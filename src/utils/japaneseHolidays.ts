/**
 * 日本の祝日判定ユーティリティ
 * 
 * 固定祝日と変動祝日（ハッピーマンデー、春分・秋分）に対応
 */

// 固定祝日（月-日）
const FIXED_HOLIDAYS: Record<string, string> = {
  '1-1': '元日',
  '2-11': '建国記念の日',
  '2-23': '天皇誕生日',
  '4-29': '昭和の日',
  '5-3': '憲法記念日',
  '5-4': 'みどりの日',
  '5-5': 'こどもの日',
  '8-11': '山の日',
  '11-3': '文化の日',
  '11-23': '勤労感謝の日',
}

// ハッピーマンデー（月-第n週の月曜日）
const HAPPY_MONDAY_HOLIDAYS: { month: number; week: number; name: string }[] = [
  { month: 1, week: 2, name: '成人の日' },      // 1月第2月曜日
  { month: 7, week: 3, name: '海の日' },        // 7月第3月曜日
  { month: 9, week: 3, name: '敬老の日' },      // 9月第3月曜日
  { month: 10, week: 2, name: 'スポーツの日' }, // 10月第2月曜日
]

/**
 * 春分の日を計算（簡易版：2000-2099年対応）
 */
function getVernalEquinoxDay(year: number): number {
  // 簡易計算式
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

/**
 * 秋分の日を計算（簡易版：2000-2099年対応）
 */
function getAutumnalEquinoxDay(year: number): number {
  // 簡易計算式
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

/**
 * 第n週の月曜日の日付を取得
 */
function getNthMondayOfMonth(year: number, month: number, n: number): number {
  const firstDay = new Date(year, month - 1, 1)
  const firstDayOfWeek = firstDay.getDay()
  // 最初の月曜日
  let firstMonday = 1 + (8 - firstDayOfWeek) % 7
  if (firstDayOfWeek === 1) firstMonday = 1 // 1日が月曜日の場合
  // n週目の月曜日
  return firstMonday + (n - 1) * 7
}

/**
 * 振替休日をチェック（日曜日が祝日の場合、翌平日が振替休日）
 */
function isSubstituteHoliday(date: Date, holidayCache: Map<string, string>): string | null {
  const dayOfWeek = date.getDay()
  if (dayOfWeek !== 1) return null // 月曜日のみチェック
  
  // 前日（日曜日）が祝日かどうか
  const prevDay = new Date(date)
  prevDay.setDate(prevDay.getDate() - 1)
  const prevKey = `${prevDay.getFullYear()}-${prevDay.getMonth() + 1}-${prevDay.getDate()}`
  
  if (holidayCache.has(prevKey)) {
    return '振替休日'
  }
  
  return null
}

/**
 * 国民の休日をチェック（祝日に挟まれた平日）
 */
function isCitizensHoliday(date: Date, holidayCache: Map<string, string>): string | null {
  const prevDay = new Date(date)
  prevDay.setDate(prevDay.getDate() - 1)
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  
  const prevKey = `${prevDay.getFullYear()}-${prevDay.getMonth() + 1}-${prevDay.getDate()}`
  const nextKey = `${nextDay.getFullYear()}-${nextDay.getMonth() + 1}-${nextDay.getDate()}`
  
  if (holidayCache.has(prevKey) && holidayCache.has(nextKey)) {
    return '国民の休日'
  }
  
  return null
}

/**
 * 指定した年の全祝日を取得
 */
function getHolidaysForYear(year: number): Map<string, string> {
  const holidays = new Map<string, string>()
  
  // 固定祝日
  for (const [monthDay, name] of Object.entries(FIXED_HOLIDAYS)) {
    const [month, day] = monthDay.split('-').map(Number)
    holidays.set(`${year}-${month}-${day}`, name)
  }
  
  // ハッピーマンデー
  for (const hm of HAPPY_MONDAY_HOLIDAYS) {
    const day = getNthMondayOfMonth(year, hm.month, hm.week)
    holidays.set(`${year}-${hm.month}-${day}`, hm.name)
  }
  
  // 春分の日
  const vernalDay = getVernalEquinoxDay(year)
  holidays.set(`${year}-3-${vernalDay}`, '春分の日')
  
  // 秋分の日
  const autumnalDay = getAutumnalEquinoxDay(year)
  holidays.set(`${year}-9-${autumnalDay}`, '秋分の日')
  
  // 振替休日と国民の休日はここでは計算しない（後で個別にチェック）
  
  return holidays
}

// キャッシュ
const holidayCache = new Map<number, Map<string, string>>()

/**
 * 指定した日付が祝日かどうかを判定
 * @param dateString YYYY-MM-DD形式の日付文字列
 * @returns 祝日名、または祝日でない場合はnull
 */
export function getJapaneseHoliday(dateString: string): string | null {
  const [yearStr, monthStr, dayStr] = dateString.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const day = parseInt(dayStr, 10)
  
  // 年のキャッシュを取得または作成
  if (!holidayCache.has(year)) {
    holidayCache.set(year, getHolidaysForYear(year))
  }
  const yearHolidays = holidayCache.get(year)!
  
  // 基本の祝日チェック
  const key = `${year}-${month}-${day}`
  if (yearHolidays.has(key)) {
    return yearHolidays.get(key)!
  }
  
  // 振替休日チェック
  const date = new Date(year, month - 1, day)
  const substitute = isSubstituteHoliday(date, yearHolidays)
  if (substitute) {
    return substitute
  }
  
  // 国民の休日チェック
  const citizens = isCitizensHoliday(date, yearHolidays)
  if (citizens) {
    return citizens
  }
  
  return null
}

/**
 * 指定した日付が祝日かどうかを判定（簡易版）
 * @param dateString YYYY-MM-DD形式の日付文字列
 * @returns 祝日ならtrue
 */
export function isJapaneseHoliday(dateString: string): boolean {
  return getJapaneseHoliday(dateString) !== null
}


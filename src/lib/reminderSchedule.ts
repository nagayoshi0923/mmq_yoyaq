/**
 * リマインドメールの対象日・文面（Edge Function と同ロジック）。
 * auto-send-reminder-emails / send-reminder-emails の日付・文言判定の正をここに置く。
 */

/** 今日（基準日時）から daysBefore 日後の公演日を JST の YYYY-MM-DD で返す */
export function getReminderTargetDateJst(
  daysBefore: number,
  now: Date = new Date()
): string {
  const targetDate = new Date(now.getTime() + daysBefore * 86400000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(targetDate)
}

/** daysBefore に応じたリマインド導入文 */
export function getReminderDayMessage(daysBefore: number): string {
  if (daysBefore === 1) {
    return '明日の公演についてリマインドいたします。'
  }
  if (daysBefore === 2) {
    return '明後日の公演についてリマインドいたします。'
  }
  if (daysBefore === 3) {
    return '3日後の公演についてリマインドいたします。'
  }
  if (daysBefore === 7) {
    return '1週間後の公演についてリマインドいたします。'
  }
  if (daysBefore === 14) {
    return '2週間後の公演についてリマインドいたします。'
  }
  if (daysBefore === 30) {
    return '1ヶ月後の公演についてリマインドいたします。'
  }
  return `${daysBefore}日後の公演についてリマインドいたします。`
}

/**
 * カスタムテンプレに「明日の」が直書きされていると、
 * daysBefore !== 1 のとき文面と送信タイミングが矛盾する（#389）。
 */
export function isHardcodedTomorrowMessageMismatched(
  template: string,
  daysBefore: number
): boolean {
  const hasTomorrow = template.includes('明日の')
  return hasTomorrow && daysBefore !== 1
}

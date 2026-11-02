const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/

/**
 * sessionStorage に書けなかった最新の月（プライベートモード・容量超過など）。書けたら消す。
 * 残っている間は保存先の古い月より優先し、同じタブ内の表示形式の切り替えで月を巻き戻さない。
 */
const memoryMonths = new Map<string, string>()

/** カレンダーとリストで共通の月の保存キー（表示形式を切り替えても選んだ月を保つ。組織ごとに分ける） */
export function bookingMonthKey(organizationSlug: string): string {
  return `booking-${organizationSlug}-month`
}

function readRaw(key: string): string | null {
  const unsaved = memoryMonths.get(key)
  if (unsaved) return unsaved
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * 予約トップのカレンダー／リストで表示していた月を sessionStorage に保持し、
 * シナリオ詳細から戻ったとき・表示形式を切り替えたときに再マウントされても同じ月を表示する。
 */
export function readPersistedBookingMonth(key: string): Date | null {
  try {
    const raw = readRaw(key)
    if (!raw || !MONTH_KEY_RE.test(raw)) return null
    const m = raw.match(MONTH_KEY_RE)
    if (!m) return null
    const y = Number(m[1])
    const monthIndex = Number(m[2])
    const d = new Date(y, monthIndex - 1, 1)
    if (Number.isNaN(d.getTime())) return null
    const today = new Date()
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    if (d < currentMonthStart) return null
    return d
  } catch {
    return null
  }
}

export function writePersistedBookingMonth(key: string, month: Date): void {
  const value = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  memoryMonths.set(key, value)
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(key, value)
    memoryMonths.delete(key)
  } catch {
    // プライベートモード・容量超過など
  }
}

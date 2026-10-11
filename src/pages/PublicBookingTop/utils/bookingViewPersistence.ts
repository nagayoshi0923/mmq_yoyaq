const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/

/**
 * 予約トップのカレンダー／リストで表示していた月を sessionStorage に保持し、
 * シナリオ詳細から戻ったときに再マウントされても同じ月を表示する。
 */
export function readPersistedBookingMonth(key: string): Date | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
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
  if (typeof sessionStorage === 'undefined') return
  try {
    const y = month.getFullYear()
    const m = month.getMonth() + 1
    sessionStorage.setItem(key, `${y}-${String(m).padStart(2, '0')}`)
  } catch {
    // プライベートモード・容量超過など
  }
}

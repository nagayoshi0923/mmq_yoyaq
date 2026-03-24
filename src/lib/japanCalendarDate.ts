/**
 * 貸切・グループ候補の「日本の公演カレンダー日」を YYYY-MM-DD に揃える。
 * - すでに YYYY-MM-DD のみ → そのまま（DB の date と同じ意味）
 * - ISO 等 → その瞬間の Asia/Tokyo の暦日（UTC 基準で 1 日ずれないようにする）
 */
export function normalizeToJapanCalendarYmd(dateRaw: string | null | undefined): string {
  const s = (dateRaw ?? '').trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const t = Date.parse(s)
  if (!Number.isNaN(t)) {
    const d = new Date(t)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const y = parts.find((p) => p.type === 'year')?.value
    const mo = parts.find((p) => p.type === 'month')?.value
    const day = parts.find((p) => p.type === 'day')?.value
    if (y && mo && day) return `${y}-${mo}-${day}`
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

/** 管理画面・候補一覧用（JST の暦日・曜日） */
export function formatJapanCalendarDateLabel(dateRaw: string | null | undefined): string {
  const ymd = normalizeToJapanCalendarYmd(dateRaw)
  if (!ymd) {
    return dateRaw ? '日付エラー' : '日付不明'
  }
  const noonJst = new Date(`${ymd}T12:00:00+09:00`)
  if (Number.isNaN(noonJst.getTime())) return '日付エラー'
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'narrow',
  }).formatToParts(noonJst)
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? ''
  return `${year}年${month}月${day}日(${wd})`
}

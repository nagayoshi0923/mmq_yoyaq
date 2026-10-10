/**
 * 確定した貸切・予約を「カレンダーに登録」するための中身（Google カレンダーの URL と .ics ファイル）と、
 * 「地図を開く」の URL を作る。画面から切り離して単体テストする。
 *
 * 時刻はすべて日本時間（JST）の日付・時刻として受け取り、UTC に直して書き出す（.ics は末尾 Z、
 * Google カレンダーも UTC ＋ ctz=Asia/Tokyo）。利用者の端末の時間帯には左右されない（check:jst-date）。
 */

export interface CalendarEventInput {
  /** 作品名（題名は「作品名（貸切）」「作品名（公演）」にする） */
  scenarioTitle: string
  /** 貸切か一般公演か */
  kind: 'private' | 'open'
  /** 公演日（JST の YYYY-MM-DD） */
  date: string
  /** 開演（JST の HH:MM または HH:MM:SS） */
  startTime: string
  /** 終了（店舗が登録した公演の終了時刻＝開演＋所要時間）。無ければ所要時間から出す */
  endTime?: string | null
  /** 作品の所要時間（分）。終了時刻が無いときに使う */
  durationMinutes?: number | null
  storeName?: string | null
  address?: string | null
  reservationNumber?: string | null
  /** 貸切はグループページ、一般公演は予約詳細の URL（絶対 URL） */
  pageUrl?: string | null
}

/** 終了時刻も所要時間も分からないときの長さ（分） */
const FALLBACK_DURATION_MINUTES = 180
const JST_OFFSET_MINUTES = 9 * 60

const pad = (n: number) => String(n).padStart(2, '0')

function parseTime(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '')
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 47 || mi > 59) return null
  return h * 60 + mi
}

function parseDate(d: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

/** JST の日付＋分（0 時からの分。24 時以降も可）→ UTC の瞬間 */
function jstToUtcMs(date: { y: number; m: number; d: number }, minutes: number): number {
  return Date.UTC(date.y, date.m - 1, date.d, 0, minutes - JST_OFFSET_MINUTES)
}

/** UTC の瞬間 → 「20261101T050000Z」 */
function toUtcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function calendarEventTitle(input: Pick<CalendarEventInput, 'scenarioTitle' | 'kind'>): string {
  const title = input.scenarioTitle.trim() || '公演'
  return `${title}（${input.kind === 'private' ? '貸切' : '公演'}）`
}

/** 開演の 10 分前（「13:50」）。時刻が無ければ null */
export function meetingTimeOf(startTime: string | null | undefined): string | null {
  const start = parseTime(startTime)
  if (start === null) return null
  const t = (((start - 10) % (24 * 60)) + 24 * 60) % (24 * 60)
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`
}

/** 開始・終了（UTC の「YYYYMMDDTHHMMSSZ」）。日付や開演時刻が読めなければ null */
export function calendarEventTimes(input: CalendarEventInput): { start: string; end: string } | null {
  const date = parseDate(input.date)
  const start = parseTime(input.startTime)
  if (!date || start === null) return null
  let end = parseTime(input.endTime)
  if (end !== null && end <= start) end += 24 * 60 // 日をまたぐ公演
  if (end === null) {
    const duration = input.durationMinutes && input.durationMinutes > 0 ? input.durationMinutes : FALLBACK_DURATION_MINUTES
    end = start + duration
  }
  return { start: toUtcStamp(jstToUtcMs(date, start)), end: toUtcStamp(jstToUtcMs(date, end)) }
}

export function calendarEventLocation(input: Pick<CalendarEventInput, 'storeName' | 'address'>): string {
  return [input.storeName?.trim(), input.address?.trim()].filter(Boolean).join(' ')
}

export function calendarEventDescription(input: CalendarEventInput): string {
  const meet = meetingTimeOf(input.startTime)
  const lines = [
    input.reservationNumber ? `予約番号: ${input.reservationNumber}` : null,
    meet ? `集合: ${meet}（開演 10 分前）` : null,
    input.pageUrl ? `${input.kind === 'private' ? 'グループページ' : '予約詳細'}: ${input.pageUrl}` : null,
    '変更やキャンセルはマイページから',
  ]
  return lines.filter((l): l is string => Boolean(l)).join('\n')
}

/** Google カレンダーの予定作成画面の URL */
export function googleCalendarUrl(input: CalendarEventInput): string | null {
  const times = calendarEventTimes(input)
  if (!times) return null
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: calendarEventTitle(input),
    dates: `${times.start}/${times.end}`,
    details: calendarEventDescription(input),
    location: calendarEventLocation(input),
    ctz: 'Asia/Tokyo',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** .ics の文字列の決まり（RFC 5545）: \ ; , と改行を逃がす */
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** 1 行 75 バイトまで。超える分は改行＋空白で続ける（日本語の文字の途中では切らない） */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74 // 続きの行は先頭の空白 1 バイトぶん短く
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/** .ics の中身。now は作成日時（DTSTAMP） */
export function buildIcs(input: CalendarEventInput, now: Date = new Date()): string | null {
  const times = calendarEventTimes(input)
  if (!times) return null
  const uidKey = (input.reservationNumber || `${input.date}-${input.startTime}`).replace(/[^A-Za-z0-9-]/g, '')
  const location = calendarEventLocation(input)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MMQ//Reservation//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:mmq-${uidKey}@mmq.game`,
    `DTSTAMP:${toUtcStamp(now.getTime())}`,
    `DTSTART:${times.start}`,
    `DTEND:${times.end}`,
    `SUMMARY:${escapeIcsText(calendarEventTitle(input))}`,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    `DESCRIPTION:${escapeIcsText(calendarEventDescription(input))}`,
    input.pageUrl ? `URL:${input.pageUrl}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.filter((l): l is string => l !== null).map(foldIcsLine).join('\r\n')}\r\n`
}

/** 保存するファイル名「mmq-<予約番号>.ics」 */
export function icsFileName(reservationNumber: string | null | undefined): string {
  const safe = (reservationNumber ?? '').replace(/[^A-Za-z0-9-]/g, '')
  return `mmq-${safe || 'event'}.ics`
}

/** 地図を開く URL。店舗に地図の URL があればそれを優先し、無ければ住所で Google マップを検索 */
export function mapSearchUrl(address: string | null | undefined, storeMapUrl?: string | null): string | null {
  if (storeMapUrl && /^https?:\/\//.test(storeMapUrl.trim())) return storeMapUrl.trim()
  const q = address?.trim()
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/** 画面の中のパス（/group/invite/…）を、カレンダーの説明に入れる絶対 URL にする */
export function absolutePageUrl(path: string): string {
  return typeof window === 'undefined' ? path : `${window.location.origin}${path}`
}

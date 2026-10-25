/**
 * 「空いている公演を探す」の共通の決まり（店舗トップ・全体トップで共通）。
 *
 * 公演（schedule_events_public の 1 行）を、お客様向けの 1 件（PublicPerformance）にして、
 * 日付・店舗・地域・空席・初心者向けで絞り、日付順に並べる（人数の絞り込みは 2026-10-12 社長指示で外した。
 * 空席は「1 名以上の空きがあれば出す」）。
 * 画面ごとに数え方が変わらないよう、件数・残席の言い方もここで決める（点検 2026-10-11 の 19・23・33）。
 */
import { addJstDays, formatJstMonthDay, getJstWeekdayIndex, toJstYmd } from '@/utils/jstDate'
import { FEW_SEATS_THRESHOLD, seatCountText } from '@/lib/seatLabel'

export interface PublicPerformance {
  id: string
  date: string
  start_time: string
  end_time: string | null
  store_id: string | null
  store_name: string
  prefecture: string | null
  organization_id: string
  organization_slug: string
  organization_name: string
  scenario_id: string
  scenario_slug: string
  title: string
  key_visual_url: string | null
  player_count_min: number
  player_count_max: number
  duration_minutes: number | null
  fee: number | null
  available_seats: number
  current_participants: number
  reservation_deadline_hours: number
  genres: string[]
  beginner_friendly: boolean
  /** 作品カードの次回公演の行に出す短い店舗名（storeShortDisplayName） */
  store_short_name?: string
  /** 店舗の色（作品カードの縦棒） */
  store_color?: string | null
  /** 募集延長中 */
  is_extended?: boolean
}

/**
 * upcoming: 今日から 30 日（既定。チップは無い）。「もっと見る」で 30 日ずつ足す（2026-10-25 社長指示「今月バッジ廃止、予定公演を30日分、末尾にもっとみる」）
 * month: 今日〜今月末（チップからは外した。内部の計算と古いリンクの読み替えだけに残す）
 */
export type DatePreset = 'upcoming' | 'week' | 'nextweek' | 'month' | 'date'

/**
 * 日付チップ（店舗トップ・全体トップで共通）。
 * 2026-10-12 社長指示: 「今日」「明日」を外し「今月」を足した。同日、さらに「今週末」を「今週」に替えた。
 * 2026-10-25 社長指示: 「今月」を外した（既定は今日から 30 日。末尾の「もっと見る」で先へ）。
 */
export const DATE_PRESETS: { value: Exclude<DatePreset, 'date' | 'upcoming' | 'month'>; label: string }[] = [
  { value: 'week', label: '今週' },
  { value: 'nextweek', label: '来週' },
]

/** 初期表示（2026-10-25: 「今月」から「今日から 30 日」に替えた） */
export const DEFAULT_DATE_PRESET: DatePreset = 'upcoming'

/** 既定の期間と「もっと見る」1 回で足す日数 */
export const UPCOMING_WINDOW_DAYS = 30

/** 今日から windows × 30 日（今日を含む。windows は 1 以上） */
export function upcomingRange(today: string, windows = 1): DateRange {
  return { from: today, to: addJstDays(today, UPCOMING_WINDOW_DAYS * Math.max(1, windows) - 1) }
}

/**
 * URL の ?when= を読む。古いリンクの weekend（今週末）・today・tomorrow は「今週」として開く
 * （古いリンクは「この数日」を見たい人が持っているので、既定の「今月」ではなく「今週」のまま）。
 * 知らない値は null（呼び出し側で既定に寄せる）。
 */
export function parseDatePreset(raw: string | null | undefined): DatePreset | null {
  switch (raw) {
    case 'week':
    case 'nextweek':
    case 'date':
      return raw
    // 「今月」はチップを外したので、古いリンクは既定（今日から 30 日）で開く
    case 'month':
    case 'upcoming':
      return 'upcoming'
    case 'weekend':
    case 'today':
    case 'tomorrow':
      return 'week'
    default:
      return null
  }
}

/** 初心者向けとみなす作品のタグ */
export const BEGINNER_GENRES = ['初心者におすすめ', '初心者向け', '初心者歓迎']

export function isBeginnerFriendly(genres: readonly string[] | null | undefined): boolean {
  return (genres ?? []).some((g) => BEGINNER_GENRES.includes(g))
}

export interface DateRange {
  from: string
  to: string
}

/** 今日（JST）の YYYY-MM-DD */
export function todayJst(now: Date = new Date()): string {
  return toJstYmd(now)
}

/** today（JST の YYYY-MM-DD）の月末日 */
export function endOfJstMonth(today: string): string {
  const [y, m] = today.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
}

/** today（JST の YYYY-MM-DD）の翌月の 1 日〜月末 */
export function nextJstMonthRange(today: string): DateRange {
  const [y, m] = today.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const from = `${ny}-${String(nm).padStart(2, '0')}-01`
  return { from, to: endOfJstMonth(from) }
}

/**
 * 日付チップの範囲（両端を含む）。
 * - 今週: 今日〜その週の日曜（JST。週は月曜始まり。日曜に開くと今日だけ）
 * - 来週: 次の月曜〜日曜（日曜に開くと明日の月曜から）
 * - 今月: 今日〜今月末（月末に開くと今日だけ）
 */
export function datePresetRange(preset: DatePreset, today: string, pickedDate?: string | null, windows = 1): DateRange {
  const w = getJstWeekdayIndex(today) ?? 0
  switch (preset) {
    case 'upcoming':
      return upcomingRange(today, windows)
    case 'month':
      return { from: today, to: endOfJstMonth(today) }
    case 'nextweek': {
      const untilMonday = ((8 - w) % 7) || 7
      const from = addJstDays(today, untilMonday)
      return { from, to: addJstDays(from, 6) }
    }
    case 'date': {
      const d = pickedDate && /^\d{4}-\d{2}-\d{2}$/.test(pickedDate) && pickedDate >= today ? pickedDate : today
      return { from: d, to: d }
    }
    case 'week':
    default:
      // 0 件のときは resolvePresetRange で「来週」に切り替える（今月は来月に）
      return { from: today, to: addJstDays(today, (7 - w) % 7) }
  }
}

/**
 * チップの範囲を決める。「今月」が 0 件なら来月（1 日〜月末）に、「今週」が 0 件なら「来週」に切り替える
 * （月末・週末の夜に開いて空の一覧にならないように）。countIn はその範囲の件数を返す
 * （読み込み中は 1 以上を返して切り替えないようにする）。
 */
export function resolvePresetRange(
  preset: DatePreset,
  today: string,
  pickedDate: string | null | undefined,
  countIn: (range: DateRange) => number,
  windows = 1,
): DateRange {
  const range = datePresetRange(preset, today, pickedDate, windows)
  if (preset === 'month') return countIn(range) > 0 ? range : nextJstMonthRange(today)
  if (preset === 'week') return countIn(range) > 0 ? range : datePresetRange('nextweek', today)
  return range
}

/** 範囲の見出し: 「10/17(土)」「10/17(土)・10/18(日)」「10/19(月)〜10/25(日)」 */
export function describeDateRange(range: DateRange): string {
  if (range.from === range.to) return formatJstMonthDay(range.from, true)
  if (addJstDays(range.from, 1) === range.to) {
    return `${formatJstMonthDay(range.from, true)}・${formatJstMonthDay(range.to, true)}`
  }
  return `${formatJstMonthDay(range.from, true)}〜${formatJstMonthDay(range.to, true)}`
}

/** 公演の開始（JST）のミリ秒 */
export function performanceStartMs(p: Pick<PublicPerformance, 'date' | 'start_time'>): number {
  const time = (p.start_time || '00:00').slice(0, 5)
  return new Date(`${p.date}T${time}:00+09:00`).getTime()
}

/** いま予約を受け付けている時間か（開始と予約締切を過ぎていない） */
export function isBookableNow(p: Pick<PublicPerformance, 'date' | 'start_time' | 'reservation_deadline_hours'>, nowMs: number): boolean {
  const deadlineMs = performanceStartMs(p) - Math.max(0, p.reservation_deadline_hours || 0) * 3600_000
  return deadlineMs > nowMs
}

export type SeatStateKind = 'full' | 'nearly_confirmed' | 'few' | 'available'

/** 最低人数まであと何人で成立するか（成立済み・誰もいないときは null） */
function playersUntilConfirmed(p: Pick<PublicPerformance, 'current_participants' | 'player_count_min'>): number | null {
  if (p.current_participants <= 0) return null
  const need = p.player_count_min - p.current_participants
  return need > 0 ? need : null
}

/** 残席の言い方: 予約済み/定員（2/8）・残少・成立間近／満席・キャンセル待ち（2026-10-12 カレンダーの形にそろえた） */
export function seatState(p: Pick<PublicPerformance, 'available_seats' | 'current_participants' | 'player_count_min'>): { kind: SeatStateKind; label: string } {
  if (p.available_seats <= 0) return { kind: 'full', label: '満席・キャンセル待ち' }
  const count = seatCountText(p.current_participants, p.current_participants + p.available_seats)
  const few = p.available_seats <= FEW_SEATS_THRESHOLD
  const need = playersUntilConfirmed(p)
  if (need !== null && need <= 2) return { kind: 'nearly_confirmed', label: `${count}${few ? '・残少' : ''}・成立間近` }
  if (few) return { kind: 'few', label: `${count}・残少` }
  return { kind: 'available', label: count }
}

export interface PerformanceCriteria {
  range: DateRange
  /** true なら 1 名以上の空きがある公演だけ */
  onlyAvailable: boolean
  beginnerOnly?: boolean
  /** 空なら全店舗 */
  storeIds?: readonly string[]
  /** 都道府県（null なら全国） */
  prefecture?: string | null
}

export function comparePerformances(a: PublicPerformance, b: PublicPerformance): number {
  return a.date.localeCompare(b.date)
    || (a.start_time || '').localeCompare(b.start_time || '')
    || a.organization_name.localeCompare(b.organization_name)
    || a.store_name.localeCompare(b.store_name)
    || a.title.localeCompare(b.title)
}

/** 条件で絞って日付順に並べる */
export function searchPerformances(list: readonly PublicPerformance[], criteria: PerformanceCriteria, nowMs: number): PublicPerformance[] {
  const storeSet = criteria.storeIds && criteria.storeIds.length > 0 ? new Set(criteria.storeIds) : null
  return list
    .filter((p) => p.date >= criteria.range.from && p.date <= criteria.range.to)
    .filter((p) => isBookableNow(p, nowMs))
    .filter((p) => !storeSet || (p.store_id !== null && storeSet.has(p.store_id)))
    .filter((p) => !criteria.prefecture || p.prefecture === criteria.prefecture)
    .filter((p) => !criteria.beginnerOnly || p.beginner_friendly)
    .filter((p) => !criteria.onlyAvailable || p.available_seats > 0)
    .sort(comparePerformances)
}

/** 残りわずか（残席 3 以下、または成立間近）を日付順に */
export function nearlyFullPerformances(list: readonly PublicPerformance[], nowMs: number, limit = 12): PublicPerformance[] {
  return list
    .filter((p) => p.available_seats > 0 && isBookableNow(p, nowMs))
    .filter((p) => {
      const kind = seatState(p).kind
      return kind === 'few' || kind === 'nearly_confirmed'
    })
    .sort(comparePerformances)
    .slice(0, limit)
}

/**
 * 作品ページを、その公演を選んだ状態で開く URL（作品ページの ?event= が受け口）。
 * 人数（?count=）は付けない。作品ページの既定（1 名）で開き、そこで選び直せる。
 */
export function performanceDetailPath(p: Pick<PublicPerformance, 'id' | 'organization_slug' | 'scenario_slug'>): string {
  const params = new URLSearchParams({ event: p.id })
  return `/${p.organization_slug}/scenario/${encodeURIComponent(p.scenario_slug)}?${params.toString()}`
}

/** 「4 時間」「3.5 時間」「2 時間 40 分」 */
export function formatDurationJa(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return ''
  if (minutes % 60 === 0) return `${minutes / 60} 時間`
  if (minutes % 30 === 0) return `${minutes / 60} 時間`
  if (minutes < 60) return `${minutes} 分`
  return `${Math.floor(minutes / 60)} 時間 ${minutes % 60} 分`
}

/** 「8 人」「4〜6 人」 */
export function formatPlayersJa(min: number, max: number): string {
  if (!max) return ''
  return min && min !== max ? `${min}〜${max} 人` : `${max} 人`
}

/** 「13:30」（秒を落とす） */
export function hhmm(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : ''
}

/** 公演日の並び（日付ピッカーで「空きのある日」に印を付ける） */
export function datesWithOpenings(list: readonly PublicPerformance[], nowMs: number): Set<string> {
  const dates = new Set<string>()
  for (const p of list) {
    if (p.available_seats > 0 && isBookableNow(p, nowMs)) dates.add(p.date)
  }
  return dates
}

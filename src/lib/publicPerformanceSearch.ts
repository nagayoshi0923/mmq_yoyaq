/**
 * 「空いている公演を探す」の共通の決まり（店舗トップ・全体トップで共通）。
 *
 * 公演（schedule_events_public の 1 行）を、お客様向けの 1 件（PublicPerformance）にして、
 * 日付・人数・店舗・地域・空席・初心者向けで絞り、日付順に並べる。
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
}

export type DatePreset = 'weekend' | 'today' | 'tomorrow' | 'nextweek' | 'date'

export const DATE_PRESETS: { value: Exclude<DatePreset, 'date'>; label: string }[] = [
  { value: 'weekend', label: '今週末' },
  { value: 'today', label: '今日' },
  { value: 'tomorrow', label: '明日' },
  { value: 'nextweek', label: '来週' },
]

export const PEOPLE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const

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

/** 日付チップの範囲（両端を含む）。今週末は土日（日曜なら次の土日） */
export function datePresetRange(preset: DatePreset, today: string, pickedDate?: string | null): DateRange {
  const w = getJstWeekdayIndex(today) ?? 0
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'tomorrow': {
      const d = addJstDays(today, 1)
      return { from: d, to: d }
    }
    case 'nextweek': {
      const untilMonday = ((8 - w) % 7) || 7
      const from = addJstDays(today, untilMonday)
      return { from, to: addJstDays(from, 6) }
    }
    case 'date': {
      const d = pickedDate && /^\d{4}-\d{2}-\d{2}$/.test(pickedDate) && pickedDate >= today ? pickedDate : today
      return { from: d, to: d }
    }
    case 'weekend':
    default: {
      // 日曜は「今日」のチップがあるので、次の土日を指す（夜に開くと 0 件になるのを避ける）
      if (w === 0) return { from: addJstDays(today, 6), to: addJstDays(today, 7) }
      const saturday = w === 6 ? today : addJstDays(today, 6 - w)
      return { from: saturday, to: addJstDays(saturday, 1) }
    }
  }
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
  people: number
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
    .filter((p) => p.player_count_max >= criteria.people)
    .filter((p) => !criteria.onlyAvailable || p.available_seats >= criteria.people)
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

/** 作品ページを、その公演と人数を選んだ状態で開く URL（作品ページの ?event=&count= が受け口） */
export function performanceDetailPath(p: Pick<PublicPerformance, 'id' | 'organization_slug' | 'scenario_slug' | 'available_seats'>, people: number): string {
  const count = p.available_seats > 0 ? Math.max(1, Math.min(people, p.available_seats)) : Math.max(1, people)
  const params = new URLSearchParams({ event: p.id, count: String(count) })
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
export function datesWithOpenings(list: readonly PublicPerformance[], people: number, nowMs: number): Set<string> {
  const dates = new Set<string>()
  for (const p of list) {
    if (p.available_seats >= people && p.player_count_max >= people && isBookableNow(p, nowMs)) dates.add(p.date)
  }
  return dates
}

/**
 * トップページの作品カード（本番 main の ScenarioCard の見た目）に渡すデータの組み立て。
 * 店舗トップ・MMQ 全体トップで共通（2026-10-13 社長承認の見本 Top.dc.html / TopMMQ.dc.html）。
 *
 * - 残りわずか・空いている公演を探す: 公演を作品ごとに 1 枚にまとめ、その公演の行を先頭に出す（探すでは色付け）
 * - 作品から探す: 作品の次回公演（予約を受け付けている公演の日付順）を出す
 */
import { comparePerformances, isBookableNow, performanceDetailPath, type PublicPerformance } from '@/lib/publicPerformanceSearch'

export interface ScenarioCardEvent {
  id: string
  date: string
  start_time: string
  store_name: string
  store_color: string | null
  available_seats: number
  current_participants: number
  player_count_min: number
  is_extended: boolean
  /** 探す結果で該当した公演（薄く色を付ける） */
  highlighted: boolean
}

export interface ScenarioCardData {
  key: string
  scenario_id: string
  title: string
  key_visual_url: string | null
  author: string
  player_count_min: number
  player_count_max: number
  duration_minutes: number | null
  fee: number | null
  /** 表示順（先頭が帯の判定に使う公演） */
  events: ScenarioCardEvent[]
  /** 今後の公演の総数（「+N件」用） */
  total_events_count: number
  is_recommended: boolean
  favorite_count: number
  release_date: string | null
  /** 押したときの行き先 */
  path: string
  /** MMQ 全体トップで画像の左上に出す組織名 */
  organization_badge?: string
  /**
   * 貸切受付中のときだけ、日程相談（作品ページの貸切リクエストのタブ）へのパス。
   * 受付していない・判定できないときは null／未指定（「貸切受付中」を出さない）。判定は privateBookingStatus.ts
   */
  private_booking_path?: string | null
}

/** 作品の補足（作者・おすすめ・遊びたい数・リリース日）。公演の行には無いので作品の一覧から引く */
export interface ScenarioCardMeta {
  author?: string | null
  is_recommended?: boolean | null
  favorite_count?: number | null
  release_date?: string | null
  /** 貸切受付中のときの日程相談へのパス（ScenarioCardData と同じ） */
  private_booking_path?: string | null
}

export type UpcomingIndex = Map<string, PublicPerformance[]>

/** 組織と作品の組（同じ作品でも組織が違えば別のカード） */
export function cardKey(p: Pick<PublicPerformance, 'organization_id' | 'scenario_id'>): string {
  return `${p.organization_id}_${p.scenario_id}`
}

/** 予約を受け付けている公演を、組織×作品ごとに日付順で */
export function indexUpcoming(list: readonly PublicPerformance[], nowMs: number): UpcomingIndex {
  const map: UpcomingIndex = new Map()
  for (const p of list) {
    if (!isBookableNow(p, nowMs)) continue
    const k = cardKey(p)
    const arr = map.get(k)
    if (arr) arr.push(p)
    else map.set(k, [p])
  }
  map.forEach((arr) => arr.sort(comparePerformances))
  return map
}

export function toCardEvent(p: PublicPerformance, highlighted = false): ScenarioCardEvent {
  return {
    id: p.id,
    date: p.date,
    start_time: p.start_time,
    store_name: p.store_short_name || p.store_name,
    store_color: p.store_color ?? null,
    available_seats: p.available_seats,
    current_participants: p.current_participants,
    player_count_min: p.player_count_min,
    is_extended: !!p.is_extended,
    highlighted,
  }
}

function minFee(list: readonly PublicPerformance[]): number | null {
  const fees = list.map((p) => p.fee).filter((f): f is number => typeof f === 'number' && f > 0)
  return fees.length > 0 ? Math.min(...fees) : null
}

interface GroupOptions {
  /** 該当の公演の行に色を付けるか（探す結果） */
  highlight: boolean
  meta: (scenarioId: string) => ScenarioCardMeta | undefined
  /** 全体トップでは組織名の帯を出す */
  showOrganization?: boolean
}

/**
 * 公演の並び（残りわずか・探す結果）を作品ごとのカードにする。
 * 並びは最初に出てきた公演の順。行は該当の公演が先頭、続けて同じ作品のほかの公演（日付順）。
 * 押すと先頭の該当公演を選んだ状態で作品ページを開く（?event=）。
 */
export function groupPerformancesIntoCards(focus: readonly PublicPerformance[], upcoming: UpcomingIndex, options: GroupOptions): ScenarioCardData[] {
  const groups = new Map<string, PublicPerformance[]>()
  for (const p of focus) {
    const k = cardKey(p)
    const arr = groups.get(k)
    if (arr) {
      if (!arr.some((x) => x.id === p.id)) arr.push(p)
    } else {
      groups.set(k, [p])
    }
  }
  return [...groups.entries()].map(([key, hits]) => {
    const first = hits[0]
    const hitIds = new Set(hits.map((p) => p.id))
    const others = (upcoming.get(key) ?? []).filter((p) => !hitIds.has(p.id))
    const meta = options.meta(first.scenario_id)
    return {
      key,
      scenario_id: first.scenario_id,
      title: first.title,
      key_visual_url: first.key_visual_url,
      author: meta?.author ?? '',
      player_count_min: first.player_count_min,
      player_count_max: first.player_count_max,
      duration_minutes: first.duration_minutes,
      fee: minFee([...hits, ...others]),
      events: [...hits.map((p) => toCardEvent(p, options.highlight)), ...others.map((p) => toCardEvent(p))],
      total_events_count: hits.length + others.length,
      is_recommended: !!meta?.is_recommended,
      favorite_count: meta?.favorite_count ?? 0,
      release_date: meta?.release_date ?? null,
      path: performanceDetailPath(first),
      organization_badge: options.showOrganization ? first.organization_name : undefined,
      private_booking_path: meta?.private_booking_path ?? null,
    }
  })
}

/** 作品から探すのカード（公演が無ければ次回公演の欄は出ない） */
export function scenarioBrowseCard(
  scenario: {
    id: string
    title: string
    key_visual_url: string | null | undefined
    player_count_min: number
    player_count_max: number
    duration_minutes?: number | null
    fee?: number | null
  } & ScenarioCardMeta,
  events: readonly PublicPerformance[],
  path: string,
): ScenarioCardData {
  const sorted = [...events].sort(comparePerformances)
  return {
    key: scenario.id,
    scenario_id: scenario.id,
    title: scenario.title,
    key_visual_url: scenario.key_visual_url ?? null,
    author: scenario.author ?? '',
    player_count_min: scenario.player_count_min,
    player_count_max: scenario.player_count_max,
    duration_minutes: scenario.duration_minutes ?? sorted[0]?.duration_minutes ?? null,
    fee: scenario.fee ?? minFee(sorted),
    events: sorted.map((p) => toCardEvent(p)),
    total_events_count: sorted.length,
    is_recommended: !!scenario.is_recommended,
    favorite_count: scenario.favorite_count ?? 0,
    release_date: scenario.release_date ?? null,
    path,
    private_booking_path: scenario.private_booking_path ?? null,
  }
}

/** 残りわずか・探す結果のカードを作るための材料（ページで 1 回作って渡す） */
export interface ScenarioCardSource {
  upcoming: UpcomingIndex
  meta: (scenarioId: string) => ScenarioCardMeta | undefined
  showOrganization?: boolean
}

export type SeatFields = Pick<PublicPerformance, 'available_seats' | 'current_participants' | 'player_count_min'>

/** 成立間近: 最低人数まで残り 1〜しきい値（最低人数 4 以下なら 2、5 以上なら 3）。本番の作品カードと同じ判定 */
export function isNearlyConfirmed(p: SeatFields): boolean {
  if (p.available_seats <= 0) return false
  const remaining = p.player_count_min - p.current_participants
  const threshold = p.player_count_min <= 4 ? 2 : 3
  return remaining >= 1 && remaining <= threshold
}

/** 開催決定: 最低人数に達していて満席でない */
export function isConfirmed(p: SeatFields): boolean {
  return p.player_count_min > 0 && p.current_participants >= p.player_count_min && p.available_seats > 0
}

/** 遊びたいリストの登録がこの数以上なら「人気」（本番の作品カードと同じ） */
const POPULAR_FAVORITES = 100
export type ScenarioCardRibbon = { label: string; className: string }

/** 画像左下の帯: 成立間近！＞募集延長中！＞おすすめ＞ロングセラー＞人気（本番の作品カードと同じ優先順） */
export function scenarioCardRibbon(card: Pick<ScenarioCardData, 'events' | 'is_recommended' | 'release_date' | 'favorite_count'>, now: Date = new Date()): ScenarioCardRibbon | null {
  const first = card.events[0]
  if (first && isNearlyConfirmed(first)) return { label: '成立間近！', className: 'text-white bg-booking-danger' }
  if (first?.is_extended) return { label: '募集延長中！', className: 'text-white bg-booking-warning' }
  if (card.is_recommended) return { label: 'おすすめ', className: 'text-white bg-booking-primary' }
  if (card.release_date) {
    const oneYearAgo = new Date(now)
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    if (new Date(card.release_date) <= oneYearAgo) return { label: 'ロングセラー', className: 'text-black bg-booking-accent' }
  }
  if (card.favorite_count >= POPULAR_FAVORITES) return { label: '人気', className: 'text-white bg-booking-popular' }
  return null
}

/**
 * 「作品から探す」のカードと新作の抽出（トップの新作一覧と「すべて見る」の新作一覧で同じ関数を使う。QW-20261023-001）。
 * 新作の判定（90 日・未来日を除く・リリース日優先・掲載登録日の JST 日付・並び）は newArrivals.ts の pickNewArrivals だけ。
 * 公開条件は呼び出し側の既存の取得（全体: fetchPlatformTopData、組織: useBookingData）のまま。
 */
import type { PublicPerformance } from '@/lib/publicPerformanceSearch'
import { addJstDays } from '@/utils/jstDate'
import type { PlatformScenario } from '@/pages/PlatformTop/hooks/platformTopData'
import type { ScenarioCard as OrgScenario } from '@/pages/PublicBookingTop/hooks/useBookingData'
import type { BrowseScenario } from './ScenarioBrowseSection'
import { cardKey, scenarioBrowseCard, type UpcomingIndex } from './scenarioCards'
import { pickNewArrivals, NEW_ARRIVALS_LIMIT, type NewArrivalDate } from './newArrivals'

/** 遊びたいリストの登録がこの数以上なら「人気」（店舗トップ） */
const ORG_POPULAR_FAVORITES = 10

/** 全体トップ: 全国の公開作品のカード。次回公演は全店舗の予約を受け付けている公演から */
export function buildPlatformBrowseScenarios(scenarios: readonly PlatformScenario[], upcoming: UpcomingIndex, today: string): BrowseScenario[] {
  const byScenario = new Map<string, PublicPerformance[]>()
  upcoming.forEach((list) => {
    if (list.length === 0) return
    const id = list[0].scenario_id
    byScenario.set(id, [...(byScenario.get(id) ?? []), ...list])
  })
  const newSince = addJstDays(today, -30)
  return scenarios.map((s) => {
    const events = byScenario.get(s.id) ?? []
    const next = events.filter((p) => p.available_seats > 0).reduce<string | null>((min, p) => (!min || p.date < min ? p.date : min), null)
    return {
      id: s.id,
      title: s.title,
      author: s.author,
      genres: s.genres,
      player_count_min: s.player_count_min,
      player_count_max: s.player_count_max,
      is_new: s.genres.includes('新作') || (!!s.release_date && s.release_date >= newSince),
      is_popular: s.is_recommended || s.genres.includes('オススメ'),
      next_date: next,
      card: scenarioBrowseCard(s, events, `/scenario/${encodeURIComponent(s.slug)}`),
    }
  })
}

/** 組織トップ: その組織の公開作品のカード */
export function buildOrgBrowseScenarios(input: {
  scenarios: readonly OrgScenario[]
  slug: string
  organizationId: string | null | undefined
  upcoming: UpcomingIndex
  nextDates: ReadonlyMap<string, string>
}): BrowseScenario[] {
  const { scenarios, slug, organizationId, upcoming, nextDates } = input
  return scenarios.map((s) => {
    const path = `/${slug}/scenario/${s.scenario_slug || s.scenario_id}`
    const events = upcoming.get(cardKey({ organization_id: organizationId ?? '', scenario_id: s.scenario_id })) ?? []
    return {
      id: s.scenario_id,
      title: s.scenario_title,
      author: s.author ?? '',
      genres: s.genre,
      player_count_min: s.player_count_min,
      player_count_max: s.player_count_max,
      is_new: !!s.is_new || s.genre.includes('新作'),
      is_popular: !!s.is_recommended || (s.favorite_count ?? 0) >= ORG_POPULAR_FAVORITES || s.genre.includes('オススメ'),
      next_date: nextDates.get(s.scenario_id) ?? null,
      card: scenarioBrowseCard({
        id: s.scenario_id,
        title: s.scenario_title,
        key_visual_url: s.key_visual_url,
        player_count_min: s.player_count_min,
        player_count_max: s.player_count_max,
        duration_minutes: s.duration,
        // 「¥N〜」は日付・時間帯の料金の最安（作品ページ・カタログと同じ。点検 F05）
        fee: s.participation_fee_min ?? s.participation_fee,
        author: s.author,
        is_recommended: s.is_recommended,
        favorite_count: s.favorite_count,
        release_date: s.release_date,
      }, events, path),
    }
  })
}

export interface NewArrivalPick<S> {
  item: BrowseScenario & { scenario: S }
  date: NewArrivalDate
}

/**
 * 全体の新作（いちばん早い掲載登録日。リリース日があればそれ）。
 * limit: トップは NEW_ARRIVALS_LIMIT（12 件）、「すべて見る」の新作一覧は Infinity（全件）
 */
export function platformNewArrivalPicks(
  scenarios: readonly PlatformScenario[], browse: readonly BrowseScenario[], today: string, limit: number = NEW_ARRIVALS_LIMIT,
): Array<NewArrivalPick<PlatformScenario>> {
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  const candidates = browse.filter((b) => byId.has(b.id)).map((b) => {
    const s = byId.get(b.id)!
    return { ...b, release_date: s.release_date ?? null, listed_at: s.listed_at ?? null, new_arrival_target: s.new_arrival_target === true, scenario: s }
  })
  return pickNewArrivals(candidates, today, limit)
}

/** その組織の新作（その組織の掲載登録日。リリース日があればそれ） */
export function orgNewArrivalPicks(
  scenarios: readonly OrgScenario[], browse: readonly BrowseScenario[], today: string, limit: number = NEW_ARRIVALS_LIMIT,
): Array<NewArrivalPick<OrgScenario>> {
  const byId = new Map(scenarios.map((s) => [s.scenario_id, s]))
  const candidates = browse.filter((b) => byId.has(b.id)).map((b) => {
    const s = byId.get(b.id)!
    return { ...b, release_date: s.release_date ?? null, listed_at: s.listed_at ?? null, new_arrival_target: s.new_arrival_target === true, scenario: s }
  })
  return pickNewArrivals(candidates, today, limit)
}

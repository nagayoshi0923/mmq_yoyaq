import type { Scenario } from '@/types'
import type { ScheduleEvent } from '@/types/schedule'
import { toJstYmd } from '@/utils/jstDate'

export interface ScenarioPlacementContext {
  organizationId: string
  month: string
  /** 現在組織の店舗一覧と、管理画面で選択中の店舗。未選択なら全店舗。 */
  organizationStoreIds: readonly string[]
  selectedStoreIds: readonly string[]
  storeLabel: string
  events: readonly ScheduleEvent[]
  ready: boolean
  /** 実データ源は未接続。呼出元が同組織・日付・時間枠に照合済みのIDだけを渡す。 */
  requestedScenarioIds?: ReadonlySet<string>
}

/** 配置数を数えるカテゴリ。テストプレイ（testplay）は GM テストに混ぜない。 */
export const PLACEMENT_CATEGORIES = ['private', 'open', 'gmtest'] as const
export type PlacementCategory = typeof PLACEMENT_CATEGORIES[number]
export type PlacementCounts = Record<PlacementCategory, number>

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function isRecentScenario(scenario: Pick<Scenario, 'release_date' | 'created_at'>, today: string): boolean {
  // リリース日があればそれを、無いときだけ登録（作成）日時の JST 日付を使う。経過 0〜89 日だけ新作、未来日は除く。
  const basis = scenario.release_date ? scenario.release_date.slice(0, 10) : toJstYmd(scenario.created_at)
  if (!YMD.test(basis)) return false
  const from = new Date(`${basis}T00:00:00+09:00`).getTime()
  if (!Number.isFinite(from) || toJstYmd(new Date(from)) !== basis) return false
  const days = (new Date(`${today}T00:00:00+09:00`).getTime() - from) / 86_400_000
  return days >= 0 && days < 90
}

export const scenarioAliases = (s: Scenario) => [s.id, s.scenario_master_id, s.org_scenario_id].filter((id): id is string => !!id)

/** 公演日（DB の date 列は JST の暦日 "YYYY-MM-DD"）の年月。その形でないときだけ JST へ変換する。 */
const eventMonth = (date: string | undefined | null) => (date && YMD.test(date.slice(0, 10)) && date.length === 10 ? date.slice(0, 7) : toJstYmd(date).slice(0, 7))

/** 取得済みの月次データを一度だけ走査。候補選択・下書きは加算しない。 */
export function countScenarioPlacements(scenarios: readonly Scenario[], context: ScenarioPlacementContext) {
  const counts = new Map<string, PlacementCounts>()
  const aliases = new Map<string, string | null>()
  const titles = new Map<string, string | null>()
  const add = (map: Map<string, string | null>, key: string, id: string) => map.set(key, map.has(key) && map.get(key) !== id ? null : id)
  for (const s of scenarios) {
    if (s.organization_id && s.organization_id !== context.organizationId) continue
    counts.set(s.id, { private: 0, open: 0, gmtest: 0 })
    for (const id of scenarioAliases(s)) add(aliases, id, s.id)
    add(titles, s.title.trim(), s.id)
  }
  const stores = new Set(context.organizationStoreIds.filter((id) => !context.selectedStoreIds.length || context.selectedStoreIds.includes(id)))
  const seen = new Set<string>()
  for (const event of context.events) {
    const deletion = event as ScheduleEvent & { deleted_at?: string | null; is_deleted?: boolean }
    // 中止・削除・未配置の貸切申請（is_private_request）・同じ公演 ID の重複は数えない
    if (!event.id || seen.has(event.id) || event.is_cancelled || event.is_private_request || deletion.deleted_at || deletion.is_deleted) continue
    if (event.category !== 'private' && event.category !== 'open' && event.category !== 'gmtest') continue
    if (event.organization_id && event.organization_id !== context.organizationId) continue
    if (!stores.has(event.store_id || event.venue) || eventMonth(event.date) !== context.month) continue
    const ids = [event.organization_scenario_id, event.organization_scenarios?.id, event.scenario_master_id, event.organization_scenarios?.scenario_master_id, event.scenarios?.id].filter((id): id is string => !!id)
    const resolved = new Set(ids.map((id) => aliases.get(id)).filter((id): id is string => !!id))
    // IDがある行はタイトルの推測へ戻さない。旧IDなし行のみ一意な完全一致を許可。
    const key = ids.length ? (resolved.size === 1 ? [...resolved][0] : null) : titles.get(event.scenario.trim())
    if (!key) continue
    const count = counts.get(key)
    if (!count) continue
    seen.add(event.id)
    count[event.category] += 1
  }
  return counts
}

export type ScenarioOptionRank = -1 | 0 | 1 | 2

/** 選択中 → このセルのリクエスト → 90 日以内の新作 → その他。元の GM/累計公演数順を各グループ内で保ち、重複なし。 */
export function rankScenarioOptions<T extends { value: string }>(options: readonly T[], scenarios: readonly Scenario[], today: string, context: ScenarioPlacementContext) {
  const byTitle = new Map(scenarios.map((s) => [s.title, s]))
  return options.map((option, index) => {
    const s = byTitle.get(option.value)
    const inOrganization = !!s && (!s.organization_id || s.organization_id === context.organizationId)
    const requested = inOrganization && scenarioAliases(s).some((id) => context.requestedScenarioIds?.has(id))
    const rank: Exclude<ScenarioOptionRank, -1> = requested ? 0 : inOrganization && isRecentScenario(s, today) ? 1 : 2
    return { option, scenario: s, rank, index }
  })
}

/** 選択中だけを先頭へ移す（選択の変更では並べ替えの計算をやり直さない）。 */
export function placeSelectedFirst<T extends { option: { value: string }; rank: number; index: number }>(ranked: readonly T[], selectedTitle = ''): Array<Omit<T, 'rank'> & { rank: ScenarioOptionRank }> {
  return ranked
    .map((r) => ({ ...r, rank: (selectedTitle && r.option.value === selectedTitle ? -1 : r.rank) as ScenarioOptionRank }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
}

/** 互換: rank と選択中の先頭化を一度に行う。 */
export function prioritizeScenarioOptions<T extends { value: string }>(options: readonly T[], scenarios: readonly Scenario[], today: string, context: ScenarioPlacementContext, selectedTitle = '') {
  return placeSelectedFirst(rankScenarioOptions(options, scenarios, today, context), selectedTitle)
}

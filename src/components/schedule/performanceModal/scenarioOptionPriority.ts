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

export function isRecentScenario(scenario: Pick<Scenario, 'release_date' | 'created_at'>, today: string): boolean {
  const basis = scenario.release_date ? scenario.release_date.slice(0, 10) : toJstYmd(scenario.created_at)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(basis)) return false
  const from = new Date(`${basis}T00:00:00+09:00`).getTime()
  if (!Number.isFinite(from) || toJstYmd(new Date(from)) !== basis) return false
  const days = (new Date(`${today}T00:00:00+09:00`).getTime() - from) / 86_400_000
  return days >= 0 && days < 90
}

export const scenarioAliases = (s: Scenario) => [s.id, s.scenario_master_id, s.org_scenario_id].filter((id): id is string => !!id)

/** 取得済みの月次データを一度だけ走査。候補選択・下書きは加算しない。 */
export function countScenarioPlacements(scenarios: readonly Scenario[], context: ScenarioPlacementContext) {
  const counts = new Map<string, { private: number; open: number }>()
  const aliases = new Map<string, string | null>()
  const titles = new Map<string, string | null>()
  const add = (map: Map<string, string | null>, key: string, id: string) => map.set(key, map.has(key) && map.get(key) !== id ? null : id)
  for (const s of scenarios) {
    if (s.organization_id && s.organization_id !== context.organizationId) continue
    counts.set(s.id, { private: 0, open: 0 })
    for (const id of scenarioAliases(s)) add(aliases, id, s.id)
    add(titles, s.title.trim(), s.id)
  }
  const stores = new Set(context.organizationStoreIds.filter((id) => !context.selectedStoreIds.length || context.selectedStoreIds.includes(id)))
  const seen = new Set<string>()
  for (const event of context.events) {
    const deletion = event as ScheduleEvent & { deleted_at?: string | null; is_deleted?: boolean }
    if (!event.id || seen.has(event.id) || event.is_cancelled || event.is_private_request || deletion.deleted_at || deletion.is_deleted) continue
    if (event.category !== 'private' && event.category !== 'open') continue
    if (event.organization_id && event.organization_id !== context.organizationId) continue
    if (!stores.has(event.store_id || event.venue) || toJstYmd(event.date).slice(0, 7) !== context.month) continue
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

/** 元のGM/累計公演数順を各グループ内で保ち、リクエスト兼新作も一候補だけ。 */
export function prioritizeScenarioOptions<T extends { value: string }>(options: readonly T[], scenarios: readonly Scenario[], today: string, context: ScenarioPlacementContext, selectedTitle = '') {
  const byTitle = new Map(scenarios.map((s) => [s.title, s]))
  return options.map((option, index) => {
    const s = byTitle.get(option.value)
    const inOrganization = s && (!s.organization_id || s.organization_id === context.organizationId)
    const requested = inOrganization && scenarioAliases(s).some((id) => context.requestedScenarioIds?.has(id))
    const rank = option.value === selectedTitle ? -1 : requested ? 0 : inOrganization && isRecentScenario(s, today) ? 1 : 2
    return { option, scenario: s, rank, index }
  }).sort((a, b) => a.rank - b.rank || a.index - b.index)
}

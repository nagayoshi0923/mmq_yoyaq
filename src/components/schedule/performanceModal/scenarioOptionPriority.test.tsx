// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Scenario, Staff } from '@/types'
import type { ScheduleEvent } from '@/types/schedule'
import { countScenarioPlacements, isRecentScenario, prioritizeScenarioOptions, type ScenarioPlacementContext } from './scenarioOptionPriority'
import { buildScenarioSelectOptions } from './scenarioSelectOptions'

const scenario = (id: string, patch: Partial<Scenario> = {}) => ({ id, title: id, organization_id: 'org', scenario_master_id: `m-${id}`, org_scenario_id: `o-${id}`, created_at: '2026-01-01T00:00:00+09:00', play_count: 0, ...patch }) as Scenario
const event = (id: string, patch: Partial<ScheduleEvent> & { deleted_at?: string; is_deleted?: boolean } = {}) => ({ id, date: '2026-11-01', venue: 'store-a', store_id: 'store-a', scenario: 'A', scenario_master_id: 'm-A', category: 'open', is_cancelled: false, organization_id: 'org', ...patch }) as ScheduleEvent
const context = (patch: Partial<ScenarioPlacementContext> = {}): ScenarioPlacementContext => ({ organizationId: 'org', month: '2026-11', organizationStoreIds: ['store-a', 'store-b'], selectedStoreIds: [], storeLabel: '全店舗', events: [], ready: true, ...patch })

describe('承認済み90日条件', () => {
  it.each([
    ['2026-10-24', true], ['2026-07-27', true], ['2026-07-26', false], ['2026-10-25', false], ['2026-02-30', false], ['bad', false],
  ])('リリース日%sの判定', (release_date, expected) => expect(isRecentScenario(scenario('A', { release_date, created_at: '2026-10-24T00:00:00+09:00' }), '2026-10-24')).toBe(expected))
  it('未入力だけ掲載登録日のJST日付へ戻り、未来・不正リリース日を登録日で救済しない', () => {
    expect(isRecentScenario(scenario('A', { created_at: '2026-07-26T15:00:00Z' }), '2026-10-24')).toBe(true)
    expect(isRecentScenario(scenario('A', { created_at: '2026-07-26T14:59:59Z' }), '2026-10-24')).toBe(false)
    expect(isRecentScenario(scenario('A', { created_at: '' }), '2026-10-24')).toBe(false)
  })
})

it('リクエスト→新作→既存順、兼用は一度だけ・同率の元順を維持する', () => {
  const scenarios = [scenario('A'), scenario('B', { release_date: '2026-10-24' }), scenario('C', { release_date: '2026-10-23' }), scenario('D'), scenario('foreign', { organization_id: 'elsewhere', release_date: '2026-10-24' })]
  const options = ['D', 'C', 'A', 'B', 'foreign'].map((value) => ({ value }))
  const sorted = prioritizeScenarioOptions(options, scenarios, '2026-10-24', context({ requestedScenarioIds: new Set(['m-B', 'o-A', 'm-foreign']) }))
  expect(sorted.map((s) => s.option.value)).toEqual(['A', 'B', 'C', 'D', 'foreign'])
  expect(sorted.map((s) => s.rank)).toEqual([0, 0, 1, 2, 2])
  expect(sorted.filter((s) => s.option.value === 'B')).toHaveLength(1)
  expect(options.map((s) => s.value)).toEqual(['D', 'C', 'A', 'B', 'foreign'])
})

it('既存GM/累計公演数順と候補数・公演不可表示を維持し、新作だけ前へ出す', () => {
  const rows = [scenario('A', { play_count: 99, available_stores: ['store-b'] }), scenario('B', { release_date: '2026-10-24', play_count: 2 })]
  const baseline = buildScenarioSelectOptions(rows, 'store-a', [] as Staff[], [])
  const options = buildScenarioSelectOptions(rows, 'store-a', [], [], context())
  // 実行日の変化から独立して比較するため、日付計算自体は上のfixtureで検証。
  expect(options).toHaveLength(baseline.length)
  expect(options.find((o) => o.value === 'A')?.label).toContain('[公演不可]')
  expect(renderToStaticMarkup(<>{options.find((o) => o.value === 'B')?.displayInfo}</>)).toContain('貸切 0件／オープン 0件')
  const unknown = buildScenarioSelectOptions(rows, '', [], [], context({ ready: false }))
  expect(renderToStaticMarkup(<>{unknown[0].displayInfo}</>)).toContain('配置数を確認できません')
})
it('選択中をリクエスト・新作より前へ一度だけ置き、候補にない作品を追加しない', () => {
  const rows = [scenario('A'), scenario('B', { release_date: '2026-10-24' }), scenario('C', { release_date: '2026-10-24' }), scenario('D')]
  const options = ['D', 'C', 'A', 'B'].map((value) => ({ value }))
  const ctx = context({ requestedScenarioIds: new Set(['m-A', 'm-B']) })
  expect(prioritizeScenarioOptions(options, rows, '2026-10-24', ctx, 'B').map((s) => [s.option.value, s.rank])).toEqual([['B', -1], ['A', 0], ['C', 1], ['D', 2]])
  expect(prioritizeScenarioOptions(options, rows, '2026-10-24', ctx, 'unknown')).toHaveLength(4)
})

describe('表示月・店舗範囲の公演数', () => {
  it('組織/マスタID差を吸収し、同じ公演IDは一度だけ。0件も返す', () => {
    const events = [event('1'), event('1'), event('2', { scenario_master_id: undefined, organization_scenario_id: 'o-A', category: 'private' }), event('3', { scenario_master_id: undefined, scenarios: { id: 'm-A', title: 'A', player_count_max: 6 } })]
    const counts = countScenarioPlacements([scenario('A'), scenario('B')], context({ events }))
    expect(counts.get('A')).toEqual({ private: 1, open: 2 })
    expect(counts.get('B')).toEqual({ private: 0, open: 0 })
  })
  it('JST月境界・選択店舗に追随し、候補を選ぶだけでは増えない', () => {
    const events = [event('before', { date: '2026-10-31T14:59:59Z' }), event('start', { date: '2026-10-31T15:00:00Z' }), event('end', { date: '2026-11-30T14:59:59Z', store_id: 'store-b' }), event('after', { date: '2026-11-30T15:00:00Z' })]
    expect(countScenarioPlacements([scenario('A')], context({ events })).get('A')?.open).toBe(2)
    expect(countScenarioPlacements([scenario('A')], context({ events, selectedStoreIds: ['store-b'] })).get('A')?.open).toBe(1)
    expect(countScenarioPlacements([scenario('A')], context({ events, month: '2026-12' })).get('A')?.open).toBe(1)
    expect(events).toHaveLength(4)
  })
  it('中止/削除/他組織/他店舗/未配置貸切希望/他種別を除外', () => {
    const events = [event('cancelled', { is_cancelled: true }), event('deleted', { deleted_at: '2026-11-01' }), event('foreign', { organization_id: 'elsewhere' }), event('store', { store_id: 'elsewhere' }), event('request', { is_private_request: true, category: 'private' }), ...(['gmtest', 'testplay', 'offsite', 'package', 'mtg', 'venue_rental', 'venue_rental_free'] as const).map((category) => event(category, { category }))]
    expect(countScenarioPlacements([scenario('A')], context({ events })).get('A')).toEqual({ private: 0, open: 0 })
  })
  it('ID不一致をタイトルで救済せず、旧IDなしは一意な完全一致だけ', () => {
    const events = [event('wrong', { scenario_master_id: 'foreign-id' }), event('legacy', { scenario_master_id: undefined })]
    expect(countScenarioPlacements([scenario('A')], context({ events })).get('A')?.open).toBe(1)
    expect(countScenarioPlacements([scenario('A'), scenario('other', { title: 'A' })], context({ events })).get('A')?.open).toBe(0)
  })
})

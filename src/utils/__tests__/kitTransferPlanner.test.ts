import { describe, it, expect } from 'vitest'
import { planKitTransfers, type PlannerDemand, type KitState } from '../kitTransferPlanner'
import type { Scenario, Store } from '@/types'

// ── テスト用ビルダ（必要な列だけ） ───────────────────────────────
function mkStore(id: string, opts: Partial<Store> = {}): Store {
  return {
    id,
    name: id,
    short_name: id,
    status: 'active',
    kit_group_id: null,
    region: '',
    address: '',
    kit_fixed: false,
    ...opts,
  } as unknown as Store
}
function mkScenario(id: string, kit_count: number): Scenario {
  return { id, title: id, kit_count } as unknown as Scenario
}
function demand(
  date: string,
  store_id: string,
  scenario_master_id: string,
  start_time = '10:00',
  end_time = '13:00',
): PlannerDemand {
  return { date, store_id, scenario_master_id, start_time, end_time }
}

const S1 = 'scn-1'
const TODAY = '2026-07-13'
const D14 = '2026-07-14'
const D15 = '2026-07-15'
const D16 = '2026-07-16'

// ── 仕様: docs/design/kit-transfer-planning.md ──────────────────
describe('planKitTransfers', () => {
  it('① 動かさず満たせる場合は移動0・不足0', () => {
    const stores = [mkStore('A'), mkStore('B')]
    const scenarios = [mkScenario(S1, 1)]
    const state: KitState = { [S1]: { 1: 'A' } }
    const demands = [demand(D14, 'A', S1)]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    expect(plan.transfers).toHaveLength(0)
    expect(plan.shortages).toHaveLength(0)
  })

  it('② 不足は1移動でカバーし、不足は出ない', () => {
    const stores = [mkStore('A'), mkStore('B')]
    const scenarios = [mkScenario(S1, 1)]
    const state: KitState = { [S1]: { 1: 'A' } }
    const demands = [demand(D15, 'B', S1)]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    expect(plan.shortages).toHaveLength(0)
    expect(plan.transfers).toHaveLength(1)
    expect(plan.transfers[0].from_store_id).toBe('A')
    expect(plan.transfers[0].to_store_id).toBe('B')
  })

  it('③ 前日必着: 移動日は公演日より前（当日着は出さない）', () => {
    const stores = [mkStore('A'), mkStore('B')]
    const scenarios = [mkScenario(S1, 1)]
    const state: KitState = { [S1]: { 1: 'A' } }
    const demands = [demand(D15, 'B', S1)]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    for (const t of plan.transfers) {
      // T <= 公演日 - 1（文字列比較で同日・未来日を除外）
      expect(t.transfer_date < t.performance_date).toBe(true)
    }
  })

  it('④ 同住所(kit_group)×時間非重複 は1キットで使い回し（移動0・不足0）', () => {
    const stores = [
      mkStore('G1', { kit_group_id: 'G' }),
      mkStore('G2', { kit_group_id: 'G' }),
    ]
    const scenarios = [mkScenario(S1, 1)]
    const state: KitState = { [S1]: { 1: 'G1' } }
    const demands = [
      demand(D14, 'G1', S1, '10:00', '13:00'),
      demand(D14, 'G2', S1, '14:00', '17:00'), // 同日・同住所・時間重ならない
    ]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    expect(plan.transfers).toHaveLength(0)
    expect(plan.shortages).toHaveLength(0)
  })

  it('⑤ 同住所×時間重複 は必要数=最大同時数。在庫不足は shortages に出る', () => {
    const stores = [
      mkStore('G1', { kit_group_id: 'G' }),
      mkStore('G2', { kit_group_id: 'G' }),
    ]
    const scenarios = [mkScenario(S1, 1)]
    const state: KitState = { [S1]: { 1: 'G1' } }
    const demands = [
      demand(D14, 'G1', S1, '10:00', '13:00'),
      demand(D14, 'G2', S1, '12:00', '15:00'), // 重なる → 同時2必要
    ]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    const short = plan.shortages.filter(s => s.scenario_master_id === S1 && s.date === D14)
    expect(short.length).toBeGreaterThanOrEqual(1)
    expect(short.some(s => s.needed - s.available >= 1)).toBe(true)
  })

  it('⑥ 中日に移動元で必要 → 移動できず不足（A:7/14使用, B:7/15必要, キット1個）', () => {
    const stores = [mkStore('A'), mkStore('B')]
    const scenarios = [mkScenario(S1, 1)]
    const state: KitState = { [S1]: { 1: 'A' } }
    const demands = [
      demand(D14, 'A', S1), // A は前日に使う
      demand(D15, 'B', S1), // B は翌日必要 → 前日(=14)に着けないと駄目だが14はAで使用中、15は当日着で禁止
    ]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    expect(plan.transfers).toHaveLength(0)
    expect(plan.shortages.some(s => s.store_id === 'B' && s.date === D15)).toBe(true)
  })

  it('⑦ 固定店舗(kit_fixed)は供給源にしない → 不足', () => {
    const stores = [mkStore('A', { kit_fixed: true }), mkStore('B')]
    const scenarios = [mkScenario(S1, 1)]
    const state: KitState = { [S1]: { 1: 'A' } }
    const demands = [demand(D15, 'B', S1)]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    expect(plan.transfers).toHaveLength(0)
    expect(plan.shortages.some(s => s.store_id === 'B')).toBe(true)
  })

  it('⑧ 未配置キット（現在地不明）は移動候補にしない → 不足', () => {
    const stores = [mkStore('A'), mkStore('B')]
    const scenarios = [mkScenario(S1, 2)] // 2キットあるはずだが…
    const state: KitState = { [S1]: { 1: 'A' } } // #2 は未配置（state に無い）
    const demands = [
      demand(D14, 'A', S1), // #1 は A で必要 → 動かせない
      demand(D14, 'B', S1), // B も必要だが #2 は未配置 → 候補外
    ]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    expect(plan.transfers).toHaveLength(0)
    expect(plan.shortages.some(s => s.store_id === 'B' && s.date === D14)).toBe(true)
  })

  it('⑨ 同じキットで複数需要をまとめてカバー → 移動は1回だけ（回数最小）', () => {
    const stores = [mkStore('A'), mkStore('B')]
    const scenarios = [mkScenario(S1, 1)]
    const state: KitState = { [S1]: { 1: 'A' } }
    const demands = [
      demand(D15, 'B', S1), // B で7/15
      demand(D16, 'B', S1), // B で7/16（同じキットが居れば両方カバー）
    ]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    expect(plan.shortages).toHaveLength(0)
    expect(plan.transfers).toHaveLength(1) // 2回ではなく1回
    expect(plan.transfers[0].to_store_id).toBe('B')
  })

  it('⑩ 解消できない不足は必ず shortages として返す（サイレントにしない）', () => {
    const stores = [mkStore('A', { kit_fixed: true }), mkStore('B')]
    const scenarios = [mkScenario(S1, 1)]
    const state: KitState = { [S1]: { 1: 'A' } }
    const demands = [demand(D15, 'B', S1)]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    expect(plan.shortages.length).toBeGreaterThan(0)
    const s = plan.shortages[0]
    expect(s).toHaveProperty('needed')
    expect(s).toHaveProperty('available')
    expect(s.needed).toBeGreaterThan(s.available)
  })

  it('⑪ 手遅れ: 今日以降に間に合う移動が無い → shortages（transfers無し）', () => {
    const stores = [mkStore('A'), mkStore('B')]
    const scenarios = [mkScenario(S1, 1)]
    const state: KitState = { [S1]: { 1: 'A' } }
    // 公演が「今日」→ 到着は前日(=昨日)が必要だが today 以降にしか運べない → 手遅れ
    const demands = [demand(TODAY, 'B', S1)]

    const plan = planKitTransfers(state, demands, scenarios, stores, TODAY)
    expect(plan.transfers).toHaveLength(0)
    expect(plan.shortages.some(s => s.store_id === 'B' && s.date === TODAY)).toBe(true)
  })
})

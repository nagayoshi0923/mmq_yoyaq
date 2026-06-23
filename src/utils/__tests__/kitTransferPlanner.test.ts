import { describe, it, expect } from 'vitest'
import {
  planKitTransfers,
  findOverdueTransfers,
  type PlannerDemand,
  type KitState,
} from '../kitTransferPlanner'
import type { Scenario, Store, KitTransferEvent, KitTransferCompletion } from '@/types'

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

// ── 持ち越しの責任追及（findOverdueTransfers） ──────────────────
function mkEvent(opts: Partial<KitTransferEvent> = {}): KitTransferEvent {
  return {
    id: 'ev-1',
    organization_id: 'org',
    scenario_master_id: S1,
    kit_number: 1,
    from_store_id: 'A',
    to_store_id: 'B',
    transfer_date: '2026-07-10',
    status: 'pending',
    created_by: 'user-creator',
    created_at: '',
    updated_at: '',
    ...opts,
  } as unknown as KitTransferEvent
}
function mkCompletion(opts: Partial<KitTransferCompletion> = {}): KitTransferCompletion {
  return {
    id: 'c-1',
    organization_id: 'org',
    scenario_master_id: S1,
    kit_number: 1,
    performance_date: '2026-07-11',
    from_store_id: 'A',
    to_store_id: 'B',
    picked_up_at: null,
    picked_up_by: null,
    delivered_at: null,
    delivered_by: null,
    created_at: '',
    updated_at: '',
    ...opts,
  } as unknown as KitTransferCompletion
}

describe('findOverdueTransfers', () => {
  it('O-1 pending・予定日が過去・完了記録なし → 未実行(not_started)・超過日数', () => {
    const events = [mkEvent({ transfer_date: '2026-07-10' })]
    const res = findOverdueTransfers(events, [], TODAY) // TODAY=2026-07-13
    expect(res).toHaveLength(1)
    expect(res[0].state).toBe('not_started')
    expect(res[0].daysOverdue).toBe(3)
    expect(res[0].event.created_by).toBe('user-creator')
  })

  it('O-2 回収済みだが未設置 → picked_up_only', () => {
    const events = [mkEvent()]
    const completions = [mkCompletion({ picked_up_at: '2026-07-10T09:00:00Z', picked_up_by: 'staff-x' })]
    const res = findOverdueTransfers(events, completions, TODAY)
    expect(res).toHaveLength(1)
    expect(res[0].state).toBe('picked_up_only')
  })

  it('O-3 設置済み(delivered) → 未実行ではない（除外）', () => {
    const events = [mkEvent()]
    const completions = [mkCompletion({ picked_up_at: 'x', delivered_at: '2026-07-10T12:00:00Z' })]
    expect(findOverdueTransfers(events, completions, TODAY)).toHaveLength(0)
  })

  it('O-4 status=completed / cancelled は対象外', () => {
    const events = [mkEvent({ status: 'completed' }), mkEvent({ id: 'ev-2', status: 'cancelled' })]
    expect(findOverdueTransfers(events, [], TODAY)).toHaveLength(0)
  })

  it('O-5 予定日が今日/未来は対象外', () => {
    const events = [mkEvent({ transfer_date: TODAY }), mkEvent({ id: 'ev-2', transfer_date: '2026-07-20' })]
    expect(findOverdueTransfers(events, [], TODAY)).toHaveLength(0)
  })
})

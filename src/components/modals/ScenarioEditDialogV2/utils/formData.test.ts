import { describe, expect, it } from 'vitest'
import { initialScenarioFormData, newScenarioFormData, scenarioToFormData } from './formData'
import type { Scenario } from '@/types'

describe('作品編集の入力欄の値', () => {
  it('初期値と新規作成の値は呼ぶたびに別の物を返す（共有して書き換わらない）', () => {
    const a = newScenarioFormData(); const b = newScenarioFormData()
    expect(a).toEqual(b); expect(a).not.toBe(b); expect(a.production_costs).not.toBe(b.production_costs)
    expect(initialScenarioFormData()).not.toBe(initialScenarioFormData())
  })

  it('新規作成は参加費 3,000 円・8 人・GM 1 人・貸切受付ありで始まる', () => {
    const f = newScenarioFormData()
    expect(f).toMatchObject({ participation_fee: 3000, player_count_min: 8, player_count_max: 8, gm_count: 1, accepts_private_booking: true, scenario_kind: 'regular', status: 'available' })
    expect(f.participation_costs).toEqual([{ time_slot: 'normal', amount: 4000, type: 'fixed' }, { time_slot: 'gmtest', amount: 3000, type: 'fixed' }])
  })

  it('作品データから: GM テストの参加費が無ければ通常の 1,000 円引きで足す', () => {
    const f = scenarioToFormData({ title: 'A', participation_fee: 4500, participation_costs: [{ time_slot: 'normal', amount: 4500, type: 'fixed' }] } as unknown as Scenario)
    expect(f.participation_costs).toEqual([{ time_slot: 'normal', amount: 4500, type: 'fixed' }, { time_slot: 'gmtest', amount: 3500, type: 'fixed' }])
    const g = scenarioToFormData({ title: 'B' } as unknown as Scenario)
    expect(g.participation_costs).toEqual([{ time_slot: 'normal', amount: 3000, type: 'fixed' }, { time_slot: 'gmtest', amount: 2000, type: 'fixed' }])
  })

  it('作品データから: ライセンス料・FC ライセンス料・GM 報酬を入力欄の形にする', () => {
    const f = scenarioToFormData({
      title: 'A', license_amount: 2000, gm_test_license_amount: 500, franchise_license_amount: null,
      gm_costs: [{ role: 'main', reward: 5000 }, { role: 'sub', reward: 3000, category: 'gmtest' }],
      is_license_buyout: true, player_count_min: 0,
    } as unknown as Scenario)
    expect(f.license_rewards).toEqual([{ item: 'normal', amount: 2000, type: 'fixed' }, { item: 'gmtest', amount: 500, type: 'fixed' }])
    expect(f.franchise_license_rewards).toEqual([{ item: 'normal', amount: 0, type: 'fixed' }, { item: 'gmtest', amount: 0, type: 'fixed' }])
    expect(f.gm_assignments).toEqual([{ role: 'main', reward: 5000, category: 'normal' }, { role: 'sub', reward: 3000, category: 'gmtest' }])
    expect(f.is_license_buyout).toBe(true)
    expect(f.player_count_min).toBe(4) // 0 や未設定は 4 人
    expect(f.characters).toEqual([])
  })
})

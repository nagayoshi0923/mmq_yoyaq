import { describe, expect, it } from 'vitest'
import { buildOrgScenarioPayload, buildScenarioSaveData, importedMasterIdForNewSave } from './savePayload'
import { newScenarioFormData } from './formData'

describe('作品編集の保存で書き込む値', () => {
  it('旧テーブル: 入力欄専用の項目を除き、参加費・ライセンス料を単一の値に直す', () => {
    const form = {
      ...newScenarioFormData(), slug: '  ', extra_preparation_time: 0,
      participation_costs: [{ time_slot: 'normal', amount: 4500, type: 'fixed' as const }],
      license_rewards: [{ item: 'normal', amount: 0, type: 'fixed' as const }, { item: 'gmtest', amount: 800, type: 'fixed' as const }],
      franchise_license_rewards: [{ item: 'normal', amount: 0, type: 'fixed' as const }],
      gm_assignments: [{ role: 'main', reward: 5000 }, { role: 'sub', reward: 3000, category: 'gmtest' as const }],
    }
    const out = buildScenarioSaveData(form as never, '題名', 'draft', '2026-10-04T00:00:00.000Z')
    expect(out).not.toHaveProperty('gm_assignments')
    expect(out).not.toHaveProperty('license_rewards')
    expect(out).not.toHaveProperty('flexible_pricing')
    expect(out).toMatchObject({
      title: '題名', status: 'draft', slug: null, extra_preparation_time: null, participation_fee: 4500,
      license_amount: 0, gm_test_license_amount: 800, franchise_license_amount: 0, franchise_gm_test_license_amount: null,
      updated_at: '2026-10-04T00:00:00.000Z',
    })
    expect(out.gm_costs).toEqual([{ role: 'main', reward: 5000 }, { role: 'sub', reward: 3000, category: 'gmtest' }])
  })

  it('組織の作品設定: 公開状態の対応・設定元の切り替え・後の項目が優先', () => {
    const form = newScenarioFormData()
    const scenarioData = buildScenarioSaveData(form, '題名', 'draft', 'now')
    const out = buildOrgScenarioPayload({ organizationId: 'org', masterId: 'm', scenarioData, formData: form, saveStatus: 'draft', sourcePayload: { recruitment_target_source: 'custom', available_stores: ['上書きされる'] } })
    expect(out).toMatchObject({ organization_id: 'org', scenario_master_id: 'm', org_status: 'coming_soon', override_title: '題名', recruitment_target_source: 'custom', gm_count: 1 })
    expect(out.available_stores).toEqual([]) // 設定元の値より、後に書いた運用の値が優先（元のコードと同じ順番）
    expect(buildOrgScenarioPayload({ organizationId: 'org', masterId: 'm', scenarioData, formData: form, saveStatus: 'unavailable', sourcePayload: {} }).org_status).toBe('unavailable')
  })
})

describe('マスタから引用した新規作成', () => {
  it('新規でマスタを引用していれば、引用元を使い新規作成はしない', () => {
    expect(importedMasterIdForNewSave(undefined, 'm1')).toBe('m1')
    expect(importedMasterIdForNewSave(null, 'm1')).toBe('m1')
  })
  it('既存の作品の編集や、引用していない新規作成は従来どおり', () => {
    expect(importedMasterIdForNewSave('m1', 'm1')).toBeUndefined()
    expect(importedMasterIdForNewSave(undefined, undefined)).toBeUndefined()
    expect(importedMasterIdForNewSave(undefined, '')).toBeUndefined()
  })
})

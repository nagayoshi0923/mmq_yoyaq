import { describe, expect, it } from 'vitest'
import { loadSettingLayers } from '../../supabase/functions/_shared/load-setting-layers'
import { resolveSetting } from '../../supabase/functions/_shared/settings-inheritance'

function fixture(foreign = false, readError = false, legacyScenario = false) {
  const filters: Array<{ table: string; constraints: Record<string, unknown> }> = []
  const db = { from(table: string) {
    const constraints: Record<string, unknown> = {}
    filters.push({ table, constraints })
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (key: string, value: unknown) => { constraints[key] = value; return query },
      is: (key: string, value: unknown) => { constraints[key] = value; return query },
      maybeSingle: async () => {
        if (foreign && table === 'schedule_events') return { data: null, error: null }
        if (readError && table === 'operating_setting_overrides') return { data: null, error: new Error('DB unavailable') }
        const data = table === 'schedule_events' ? { id: 'event', store_id: 'store', organization_scenario_id: legacyScenario ? null : 'scenario', scenario_id: legacyScenario ? 'legacy-master' : null }
          : table === 'stores' ? { id: 'store' }
          : table === 'organization_scenarios' ? { id: 'scenario', reservation_confirmation_template: '', extra_preparation_time: 30 }
          : table === 'email_settings' ? { reservation_confirmation_template: constraints.store_id === null ? '共通' : '店舗', company_name: '会社', resend_api_key: 'excluded' }
          : table === 'reservation_settings' ? { payment_method_label: '店舗案内' }
          : table === 'operating_setting_overrides' && constraints.organization_scenario_id === 'scenario' ? { settings: { reservation_confirmation_template: null, company_name: '採用しない作品署名' }, revision: 3 }
          : null
        return { data, error: null }
      },
      then: (resolve: (result: unknown) => unknown) => query.maybeSingle().then(resolve),
    }
    return query
  } }
  return { db, filters }
}
describe('設定階層の取得', () => {
  it('公演の所属を検証し、組織共通を別店舗の行で代用しない', async () => {
    const { db, filters } = fixture()
    const result = await loadSettingLayers(db, { organizationId: 'org', performanceId: 'event' })
    expect(result.context).toMatchObject({ storeId: 'store', scenarioId: 'scenario' })
    expect(filters.every(row => row.constraints.organization_id === 'org')).toBe(true)
    expect(filters).toContainEqual(expect.objectContaining({ table: 'email_settings', constraints: { organization_id: 'org', store_id: null } }))
    expect(result.revisions.scenario).toBe(3)
    expect(result.layers.organization).not.toHaveProperty('resend_api_key')
    expect(resolveSetting('reservation_confirmation_template', '既定', result.layers)).toEqual({ value: '店舗', source: 'store' })
    expect(resolveSetting('preparation_minutes', 60, result.layers).value).toBe(90)
  })
  it('旧scenario_idを持つ公演でも組織内の作品設定を継承する', async () => {
    const { db, filters } = fixture(false, false, true)
    const result = await loadSettingLayers(db, { organizationId: 'org', performanceId: 'event' })
    expect(result.context.scenarioId).toBe('scenario')
    expect(filters).toContainEqual({ table: 'organization_scenarios', constraints: { organization_id: 'org', scenario_master_id: 'legacy-master' } })
    expect(resolveSetting('preparation_minutes', 60, result.layers).value).toBe(90)
  })
  it('別組織の公演では後続の設定を読まない', async () => {
    const { db, filters } = fixture(true)
    await expect(loadSettingLayers(db, { organizationId: 'org', performanceId: 'foreign' })).rejects.toThrow('公演が見つかりません')
    expect(filters).toHaveLength(1)
  })
  it('公演と不一致の店舗指定を拒否する', async () => {
    const { db } = fixture()
    await expect(loadSettingLayers(db, { organizationId: 'org', performanceId: 'event', storeId: 'other' })).rejects.toThrow('一致しません')
  })
  it('取得失敗時は下位設定へ黙って戻さない', async () => {
    const { db } = fixture(false, true)
    await expect(loadSettingLayers(db, { organizationId: 'org', performanceId: 'event' })).rejects.toThrow('DB unavailable')
  })
})

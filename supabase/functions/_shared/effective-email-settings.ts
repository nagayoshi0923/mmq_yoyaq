import { loadSettingLayers, type SettingContext } from './load-setting-layers.ts'
import { resolveSetting } from './settings-inheritance.ts'
import { SETTING_DEFINITIONS } from './setting-definitions.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface SettingsClient { from(table: string): any }
export async function loadEffectiveEmailSettings(db: SettingsClient, options: {
  storeId?: string; organizationId?: string; reservationId?: string; scheduleEventId?: string; scenarioId?: string
}) {
  const context: SettingContext = { organizationId: options.organizationId ?? '', storeId: options.storeId,
    performanceId: options.scheduleEventId, scenarioId: options.scenarioId }
  if (options.reservationId) {
    let query = db.from('reservations').select('organization_id,store_id,schedule_event_id,scenario_master_id').eq('id', options.reservationId)
    if (context.organizationId) query = query.eq('organization_id', context.organizationId)
    const result = await query.maybeSingle()
    if (result.error) throw result.error
    if (!result.data) throw new Error('予約が見つかりません')
    context.organizationId = result.data.organization_id
    context.storeId = result.data.store_id
    context.performanceId = result.data.schedule_event_id
    if (!context.performanceId && result.data.scenario_master_id) {
      const scenario = await db.from('organization_scenarios').select('id')
        .eq('organization_id', context.organizationId).eq('scenario_master_id', result.data.scenario_master_id).maybeSingle()
      if (scenario.error) throw scenario.error
      context.scenarioId = scenario.data?.id ?? null
    }
  }
  if (!context.organizationId && context.storeId) {
    const store = await db.from('stores').select('organization_id').eq('id', context.storeId).maybeSingle()
    if (store.error) throw store.error
    context.organizationId = store.data?.organization_id ?? ''
  }
  if (!context.organizationId) return null
  // 予約の店舗が未更新でも、公演側の所属が予約の組織と一致することを必ず検証する。
  if (context.performanceId) context.storeId = undefined
  const { layers } = await loadSettingLayers(db, context)
  return Object.fromEntries(Object.entries(SETTING_DEFINITIONS)
    .filter(([, definition]) => definition.group === 'email')
    .map(([key, definition]) => {
      const resolved = resolveSetting(key,
        key === 'reminder_enabled' ? false : key === 'reminder_schedule' ? [] : '', layers, definition.scopes)
      return [key, resolved.source === 'default' && definition.kind === 'text' ? null : resolved.value]
    }))
}

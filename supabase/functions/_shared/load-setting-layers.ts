import { SETTING_DEFINITIONS } from './setting-definitions.ts'
import type { SettingLayers, SettingScope, SettingValues } from './settings-inheritance.ts'

// Edge FunctionsとNode APIで同じ取得処理を使う。両ランタイムのSupabase型に依存しない。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface SettingsClient { from(table: string): any }
export interface SettingContext {
  organizationId: string
  storeId?: string | null
  scenarioId?: string | null
  performanceId?: string | null
}

function pickSettings(row: Record<string, unknown> | null, legacy = true): SettingValues {
  if (!row) return {}
  return Object.fromEntries(Object.entries(row)
    .filter(([key]) => Object.prototype.hasOwnProperty.call(SETTING_DEFINITIONS, key))
    .map(([key, value]) => [key, legacy && SETTING_DEFINITIONS[key].group === 'email' && typeof value === 'string' && !value.trim() ? null : value])) as SettingValues
}

/** 同一組織の対象を先に確認し、任意の別店舗を組織共通の代用にしない。 */
export async function loadSettingLayers(db: SettingsClient, input: SettingContext): Promise<{
  layers: SettingLayers
  revisions: Record<SettingScope, number>
  context: SettingContext
}> {
  if (!input.organizationId) throw new Error('組織情報が必要です')
  const context = { ...input }
  let event: Record<string, unknown> | null = null
  let scenario: Record<string, unknown> | null = null
  if (context.performanceId) {
    const result = await db.from('schedule_events')
      .select('id,store_id,organization_scenario_id,scenario_master_id,scenario_id,reservation_confirmation_template,private_confirm_template')
      .eq('id', context.performanceId).eq('organization_id', context.organizationId).maybeSingle()
    if (result.error) throw result.error
    if (!result.data) throw new Error('公演が見つかりません')
    event = result.data
    if ((context.storeId && context.storeId !== event!.store_id)
      || (context.scenarioId && event!.organization_scenario_id && context.scenarioId !== event!.organization_scenario_id)) {
      throw new Error('公演と設定対象が一致しません')
    }
    context.storeId = event!.store_id as string | null
    context.scenarioId = event!.organization_scenario_id as string | null
    const masterId = event!.scenario_master_id ?? event!.scenario_id
    if (!context.scenarioId && masterId) {
      const lookup = await db.from('organization_scenarios').select('id')
        .eq('scenario_master_id', masterId).eq('organization_id', context.organizationId).maybeSingle()
      if (lookup.error) throw lookup.error
      context.scenarioId = lookup.data?.id ?? null
    }
    if (input.scenarioId && input.scenarioId !== context.scenarioId) throw new Error('公演と作品が一致しません')
  }
  if (context.storeId) {
    const result = await db.from('stores').select('id').eq('id', context.storeId).eq('organization_id', context.organizationId).maybeSingle()
    if (result.error) throw result.error
    if (!result.data) throw new Error('店舗が見つかりません')
  }
  if (context.scenarioId) {
    const result = await db.from('organization_scenarios')
      .select('id,reservation_confirmation_template,private_confirm_template,survey_enabled,survey_deadline_days,survey_url,extra_preparation_time')
      .eq('id', context.scenarioId).eq('organization_id', context.organizationId).maybeSingle()
    if (result.error) throw result.error
    if (!result.data) throw new Error('シナリオが見つかりません')
    scenario = result.data
  }

  const emailFields = Object.entries(SETTING_DEFINITIONS).filter(([, definition]) => definition.group === 'email').map(([key]) => key).join(',')
  const reservationFields = Object.entries(SETTING_DEFINITIONS).filter(([, definition]) => ['cancellation', 'payment'].includes(definition.group)).map(([key]) => key).join(',')
  const orgEmail = await db.from('email_settings').select(emailFields)
    .eq('organization_id', context.organizationId).is('store_id', null).order('id').limit(1).maybeSingle()
  if (orgEmail.error) throw orgEmail.error
  let store: SettingValues = {}
  if (context.storeId) {
    const results = await Promise.all([
      db.from('reservation_settings').select(reservationFields).eq('organization_id', context.organizationId).eq('store_id', context.storeId).maybeSingle(),
      db.from('email_settings').select(emailFields).eq('organization_id', context.organizationId).eq('store_id', context.storeId).maybeSingle(),
    ])
    for (const result of results) {
      if (result.error) throw result.error
      store = { ...store, ...pickSettings(result.data) }
    }
  }
  const layers: SettingLayers = {
    organization: pickSettings(orgEmail.data), store,
    scenario: pickSettings(scenario), performance: pickSettings(event),
  }
  const revisions: Record<SettingScope, number> = { organization: 0, store: 0, scenario: 0, performance: 0 }
  // preparation_minutes は既存の追加準備時間と意味が異なるため単純に改名しない。
  // 基本準備時間の既定60分に従来の追加分を足し、個別指定解除までは実効値を保つ。
  if (scenario?.extra_preparation_time != null) {
    layers.scenario = { ...layers.scenario, preparation_minutes: 60 + Number(scenario.extra_preparation_time) }
  }
  for (const scope of ['organization', 'store', 'scenario', 'performance'] as const) {
    const id = scope === 'organization' ? context.organizationId : scope === 'store' ? context.storeId
      : scope === 'scenario' ? context.scenarioId : context.performanceId
    if (!id) continue
    let query = db.from('operating_setting_overrides').select('settings,revision').eq('organization_id', context.organizationId)
    for (const [column, rowId] of [
      ['store_id', scope === 'store' ? id : null],
      ['organization_scenario_id', scope === 'scenario' ? id : null],
      ['schedule_event_id', scope === 'performance' ? id : null],
    ]) query = rowId ? query.eq(column, rowId) : query.is(column, null)
    const result = await query.maybeSingle()
    if (result.error) throw result.error
    if (result.data) {
      layers[scope] = { ...layers[scope], ...pickSettings(result.data.settings, false) }
      revisions[scope] = Number(result.data.revision)
    }
  }
  return { layers, revisions, context }
}

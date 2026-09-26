import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { ApiError, requireStaff, type AuthUser } from './auth.js'
import type { PreparationSettings } from '../../supabase/functions/_shared/preparation-settings.js'
export async function preparationSettings(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  if (!db || !user.orgId) throw new ApiError(403, '組織情報が必要です')
  const [scenarios, overrides] = await Promise.all([
    db.from('organization_scenarios').select('id,scenario_master_id,extra_preparation_time').eq('organization_id', user.orgId),
    db.from('operating_setting_overrides').select('store_id,organization_scenario_id,schedule_event_id,settings').eq('organization_id', user.orgId),
  ])
  if (scenarios.error || overrides.error) throw new ApiError(500, '準備時間を取得できませんでした')
  const result: PreparationSettings = { organization: null, stores: {}, scenarios: {}, performances: {} }
  const masterIds = new Map<string,string>()
  for (const row of scenarios.data ?? []) {
    result.scenarios[row.id] = row.extra_preparation_time == null ? null : 60 + row.extra_preparation_time
    masterIds.set(row.id,row.scenario_master_id)
  }
  for (const row of overrides.data ?? []) {
    if (!Object.prototype.hasOwnProperty.call(row.settings, 'preparation_minutes')) continue
    const value = row.settings.preparation_minutes as number | null
    if (row.schedule_event_id) result.performances[row.schedule_event_id] = value
    else if (row.organization_scenario_id) result.scenarios[row.organization_scenario_id] = value
    else if (row.store_id) result.stores[row.store_id] = value
    else result.organization = value
  }
  for (const [id,master] of masterIds) if (master) result.scenarios[master] = result.scenarios[id]
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json(result)
}

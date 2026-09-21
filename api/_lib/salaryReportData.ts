import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { ApiError } from './auth.js'

const HISTORY_FIELDS = 'effective_from, gm_base_pay, gm_hourly_rate, gm_test_base_pay, gm_test_hourly_rate, reception_fixed_pay, use_hourly_table, hourly_rates, gm_test_hourly_rates'
const EVENT_FIELDS = 'id, date, store_id, scenario, scenario_master_id, gms, gm_roles, staff_assignments:schedule_event_staff_assignments(staff_id,staff_name,role,ordinal,resolution_status), category, is_cancelled, stores:store_id(name), scenario_masters:scenario_master_id(title, official_duration)'

/** 認証済みsales APIの内部専用。orgIdはリクエスト値でなくrequireAuthの結果を使う。 */
export async function handleSalaryReportData(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) throw new ApiError(500, 'db unavailable')
  if (!orgId) throw new ApiError(403, '組織を確認できません')
  const { start, end, type } = req.query
  const validDate = (value: unknown): value is string => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!validDate(start) || !validDate(end) || start > end) throw new ApiError(400, '取得期間が不正です')
  const pageSize = 500
  const allRows = async (makeQuery: () => any): Promise<any[]> => {
    const rows: any[] = []
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await makeQuery().range(offset, offset + pageSize - 1)
      if (error) throw error
      rows.push(...(data ?? []))
      if ((data?.length ?? 0) < pageSize) return rows
    }
  }
  if (type === 'salary-history') {
    const { data, error } = await db.from('salary_settings_history').select(HISTORY_FIELDS)
      .eq('organization_id', orgId).lte('effective_from', start)
      .order('effective_from', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    const changes = await allRows(() => db!.from('salary_settings_history').select(HISTORY_FIELDS)
      .eq('organization_id', orgId).gt('effective_from', start).lte('effective_from', end)
      .order('effective_from', { ascending: true }))
    return res.status(200).json({ organizationId: orgId, history: [...(data ? [data] : []), ...changes] })
  }
  const staff = await allRows(() => db!.from('staff').select('id, name, role, stores')
    .eq('organization_id', orgId).order('id'))
  if (type === 'salary-inputs') {
    // service roleではauth.uid()がないためstaff_viewでなく元表を読む。認可はsales handlerで実施済み。
    const events = await allRows(() => db!.from('schedule_events').select(EVENT_FIELDS)
      .eq('organization_id', orgId).gte('date', start).lte('date', end).order('id'))
    return res.status(200).json({ organizationId: orgId, staff, events })
  }
  if (type === 'sales-cost-inputs') {
    const transactions = await allRows(() => db!.from('miscellaneous_transactions')
      .select('id, date, type, category, amount, description, scenario_id, store_id, schedule_event_id')
      .eq('organization_id', orgId).gte('date', start).lte('date', end).order('id'))
    return res.status(200).json({ organizationId: orgId, staff, transactions })
  }
  throw new ApiError(400, '未対応の取得種別です')
}

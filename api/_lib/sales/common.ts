// 売上 API の共通部分（CORS、SELECT 文字列、クエリパラメータの読み取り）。api/sales.ts から切り出した（整備 Phase 3、#774）。挙動は変えない。
import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
export const SCHEDULE_EVENT_SALES_SELECT_FIELDS =
  'id, organization_id, date, start_time, end_time, store_id, venue, scenario_master_id, scenario, organization_scenario_id, category, gms, gm_roles, capacity, max_participants, venue_rental_fee, is_cancelled, staff_assignments:schedule_event_staff_assignments(staff_id,staff_name,ordinal,resolution_status)'

export const STORE_SELECT_FIELDS_FOR_SALES =
  'id, name, short_name, fixed_costs, ownership_type, transport_allowance, franchise_fee, franchise_fee_type, franchise_fee_percent'

export const STORE_AND_SCENARIO_NESTED_SELECT = `
  *,
  stores:store_id (
    id,
    name,
    short_name
  ),
  scenario_masters:scenario_master_id (
    id,
    title,
    author,
    duration
  ),
  organization_scenarios:organization_scenario_id (
    participation_fee,
    gm_test_participation_fee,
    participation_costs,
    license_amount,
    gm_test_license_amount,
    gm_costs
  )
`

export const AUTHOR_PERFORMANCE_SELECT = `
  date,
  scenario_masters:scenario_master_id (
    id,
    title,
    author
  )
`

export function getStartEnd(req: VercelRequest): { start: string; end: string } | null {
  const start = req.query.start as string | undefined
  const end = req.query.end as string | undefined
  if (!start || !end) return null
  return { start, end }
}

export function getStoreIds(req: VercelRequest): string[] | undefined {
  const raw = req.query.store_ids as string | string[] | undefined
  if (!raw) return undefined
  if (Array.isArray(raw)) return raw.filter(Boolean)
  const arr = String(raw).split(',').map(s => s.trim()).filter(Boolean)
  return arr.length > 0 ? arr : undefined
}

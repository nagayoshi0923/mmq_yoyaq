import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError } from './_lib/auth.js'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

const RESERVATION_SELECT_FIELDS =
  'id, organization_id, reservation_number, reservation_page_id, title, scenario_id, scenario_master_id, store_id, customer_id, schedule_event_id, requested_datetime, actual_datetime, duration, participant_count, participant_names, assigned_staff, gm_staff, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, payment_method, payment_datetime, status, customer_notes, staff_notes, special_requests, cancellation_reason, cancelled_at, external_reservation_id, reservation_source, created_by, created_at, updated_at, customer_name, customer_email, customer_phone, private_group_id, candidate_datetimes'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  const start = req.query.start as string | undefined
  const end = req.query.end as string | undefined

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (db as any)
      .from('reservations')
      .select(RESERVATION_SELECT_FIELDS)
      .eq('organization_id', user.orgId)

    if (start && end) {
      query = query.gte('requested_datetime', start).lte('requested_datetime', end).order('requested_datetime', { ascending: true })
    } else {
      query = query.order('requested_datetime', { ascending: false })
    }

    const { data, error } = await query

    if (error) {
      console.error('[reservations] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }

    return res.status(200).json(data ?? [])
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[reservations] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

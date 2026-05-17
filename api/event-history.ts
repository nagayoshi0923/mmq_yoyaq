import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db'
import { requireAuth, requireStaff, ApiError } from './_lib/auth'

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

const SELECT_FIELDS =
  'id, schedule_event_id, organization_id, event_date, store_id, time_slot, changed_by_user_id, changed_by_staff_id, changed_by_name, action_type, changes, old_values, new_values, deleted_event_scenario, notes, created_at'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  const date = req.query.date as string | undefined
  const storeId = req.query.store_id as string | undefined
  const timeSlotRaw = req.query.time_slot as string | undefined
  if (!date || !storeId) {
    return res.status(400).json({ error: 'date / store_id クエリパラメータが必要です' })
  }

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (db as any)
      .from('schedule_event_history')
      .select(SELECT_FIELDS)
      .eq('organization_id', user.orgId)
      .eq('event_date', date)
      .eq('store_id', storeId)

    // time_slot: 'null' または未指定なら .is('time_slot', null)、それ以外なら eq
    if (timeSlotRaw === undefined || timeSlotRaw === 'null') {
      query = query.is('time_slot', null)
    } else {
      query = query.eq('time_slot', timeSlotRaw)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('[event-history] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }

    return res.status(200).json(data ?? [])
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[event-history] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

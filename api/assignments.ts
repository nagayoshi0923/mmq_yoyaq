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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  const staffId = req.query.staff_id as string | undefined
  const scenarioId = req.query.scenario_id as string | undefined
  if (!staffId && !scenarioId) {
    return res.status(400).json({ error: 'staff_id または scenario_id のクエリパラメータが必要です' })
  }

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    if (staffId) {
      const SELECT = `
        *,
        scenario_masters:scenario_master_id (
          id,
          title,
          author
        )
      `
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (db as any)
        .from('staff_scenario_assignments')
        .select(SELECT)
        .eq('organization_id', user.orgId)
        .eq('staff_id', staffId)
        .order('assigned_at', { ascending: false })

      if (error) {
        console.error('[assignments] DB error:', error)
        return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
      }
      return res.status(200).json(data ?? [])
    }

    // scenarioId
    const SELECT = `
      *,
      staff:staff_id (
        id,
        name,
        line_name
      )
    `
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('staff_scenario_assignments')
      .select(SELECT)
      .eq('organization_id', user.orgId)
      .eq('scenario_master_id', scenarioId)
      .order('assigned_at', { ascending: false })

    if (error) {
      console.error('[assignments] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[assignments] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

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

const SELECT_FIELDS =
  'id, staff_id, date, morning, afternoon, evening, all_day, submitted_at, status, organization_id, created_at, updated_at'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  const year = Number(req.query.year)
  const month = Number(req.query.month)
  const staffId = req.query.staff_id as string | undefined
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year/month クエリパラメータが必要です' })
  }

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const daysInMonth = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    if (staffId) {
      // 個別スタッフ: 自org のスタッフかどうか確認は staffApi 経由でもよいが、
      // 直接 shift_submissions に org フィルタをかけて取得する
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (db as any)
        .from('shift_submissions')
        .select(SELECT_FIELDS)
        .eq('organization_id', user.orgId)
        .eq('staff_id', staffId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date')

      if (error) {
        console.error('[shifts] DB error:', error)
        return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
      }
      return res.status(200).json(data ?? [])
    }

    // 全スタッフ: 自org のスタッフ ID 一覧を取得してから shift_submissions に絞り込み
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staffRows, error: staffError } = await (db as any)
      .from('staff')
      .select('id')
      .eq('organization_id', user.orgId)

    if (staffError) {
      console.error('[shifts] staff DB error:', staffError)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: staffError.message })
    }

    const staffIds = (staffRows ?? []).map((s: { id: string }) => s.id)
    if (staffIds.length === 0) return res.status(200).json([])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('shift_submissions')
      .select(SELECT_FIELDS)
      .gte('date', startDate)
      .lte('date', endDate)
      .in('staff_id', staffIds)
      .or('morning.eq.true,afternoon.eq.true,evening.eq.true,all_day.eq.true')
      .limit(10000)
      .order('date')

    if (error) {
      console.error('[shifts] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }

    return res.status(200).json(data ?? [])
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[shifts] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

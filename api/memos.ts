import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, ApiError, type AuthUser } from './_lib/auth.js'

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean) as string[]

function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*')
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

/** venue_id (store) が自組織のものか検証 */
async function assertStoreOwnedByOrg(storeId: string, orgId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new ApiError(500, `venue 所有検証に失敗: ${error.message}`)
  if (!data) throw new ApiError(403, '指定の venue は自組織のものではありません')
}

// ─── GET ─────────────────────────────────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const year = Number(req.query.year)
  const month = Number(req.query.month)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year/month クエリパラメータが必要です' })
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('daily_memos')
    .select(`
      *,
      stores:venue_id (
        id,
        name,
        short_name
      )
    `)
    .eq('organization_id', user.orgId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) {
    console.error('[memos] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── POST: メモを upsert ────────────────────────────────────────────────────
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = req.body ?? {}
  const { date, venue_id, memo_text } = body as {
    date?: string
    venue_id?: string
    memo_text?: string
  }
  if (!date || !venue_id) return res.status(400).json({ error: 'date / venue_id が必要です' })

  await assertStoreOwnedByOrg(venue_id, user.orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('daily_memos')
    .upsert(
      {
        date,
        venue_id,
        memo_text: memo_text ?? '',
        organization_id: user.orgId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'date,venue_id' }
    )
    .select()
  if (error) {
    console.error('[memos] upsert error:', error)
    return res.status(500).json({ error: 'メモ保存に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── DELETE: 指定の date+venue のメモ削除 ───────────────────────────────
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const date = (req.query.date ?? req.body?.date) as string | undefined
  const venueId = (req.query.venue_id ?? req.body?.venue_id) as string | undefined
  if (!date || !venueId) return res.status(400).json({ error: 'date / venue_id が必要です' })

  // venue が自組織のものか検証（他組織の venue を引数にして削除を試みても 403）
  await assertStoreOwnedByOrg(venueId, user.orgId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('daily_memos')
    .delete()
    .eq('date', date)
    .eq('venue_id', venueId)
    .eq('organization_id', user.orgId)
  if (error) {
    console.error('[memos] delete error:', error)
    return res.status(500).json({ error: 'メモ削除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    if (req.method === 'GET') return await handleGet(req, res, user)
    if (req.method === 'POST') return await handlePost(req, res, user)
    if (req.method === 'DELETE') return await handleDelete(req, res, user)

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[memos] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

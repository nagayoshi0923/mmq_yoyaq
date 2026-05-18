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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

const SELECT_FIELDS =
  'id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, notes, avatar_url, visit_count, total_spent, last_visit, preferences, notification_settings, created_at, updated_at'

// 作成時に受け取れるフィールドのホワイトリスト
// organization_id は受け取らない（JWT から強制）
// user_id は受け取らない（他人/他組織の顧客を勝手に作るのを防ぐ。
//   どうしても紐付けたい場合は管理画面側で別 API を作る）
const CUSTOMER_CREATE_FIELDS = [
  'name',
  'nickname',
  'email',
  'email_verified',
  'phone',
  'address',
  'line_id',
  'notes',
  'avatar_url',
  'preferences',
  'notification_settings',
] as const

// 更新可能フィールドのホワイトリスト（Mass Assignment 防止）
// organization_id / user_id / id / created_at / updated_at / visit_count / total_spent
// は更新不可（DB 側のトリガまたは集計関数が更新する想定）
const CUSTOMER_UPDATABLE_FIELDS = [
  'name',
  'nickname',
  'email',
  'email_verified',
  'phone',
  'address',
  'line_id',
  'notes',
  'avatar_url',
  'preferences',
  'notification_settings',
  'last_visit',
] as const

function pickFields<T extends readonly string[]>(
  source: Record<string, unknown>,
  allowed: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    if ((allowed as readonly string[]).includes(key)) {
      out[key] = source[key]
    }
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const method = req.method
  if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)
    requireStaff(user)

    if (method === 'GET') return await routeGet(req, res, user.orgId)
    if (method === 'POST') return await routePost(req, res, user.orgId)
    if (method === 'PATCH') return await routePatch(req, res, user.orgId)
    if (method === 'DELETE') return await routeDelete(req, res, user.orgId)
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[customers] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────
// /api/customers                  → 自組織の全顧客
// /api/customers?action=findByEmail&email=...  → メールで自組織内検索
// /api/customers?action=findByPhone&phone=...  → 電話で自組織内検索
async function routeGet(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const action = req.query.action as string | undefined

  if (action === 'findByEmail') {
    const email = req.query.email as string | undefined
    if (!email) return res.status(400).json({ error: 'email が必要です' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('customers')
      .select(SELECT_FIELDS)
      .eq('organization_id', orgId)
      .eq('email', email)
      .maybeSingle()

    if (error) {
      console.error('[customers:findByEmail] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? null)
  }

  if (action === 'findByPhone') {
    const phone = req.query.phone as string | undefined
    if (!phone) return res.status(400).json({ error: 'phone が必要です' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('customers')
      .select(SELECT_FIELDS)
      .eq('organization_id', orgId)
      .eq('phone', phone)
      .maybeSingle()

    if (error) {
      console.error('[customers:findByPhone] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? null)
  }

  // デフォルト: 自組織の全顧客
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('customers')
    .select(SELECT_FIELDS)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[customers] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  return res.status(200).json(data ?? [])
}

// ─── POST: create ────────────────────────────────────────────────────────────
// 自組織の顧客のみ作成可能（organization_id は JWT から強制）
async function routePost(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const customer = (body.customer ?? body) as Record<string, unknown>
  if (!customer || typeof customer !== 'object') {
    return res.status(400).json({ error: 'customer が必要です' })
  }

  const name = customer.name as string | undefined
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name が必要です' })
  }

  // ホワイトリストでフィルタ（クライアントが organization_id / user_id を渡してきても無視）
  const safe = pickFields(customer, CUSTOMER_CREATE_FIELDS)
  // organization_id は JWT 由来で強制
  ;(safe as Record<string, unknown>).organization_id = orgId

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('customers')
    .insert([safe])
    .select(SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[customers:create] DB error:', error)
    return res.status(500).json({ error: '顧客の作成に失敗しました', detail: error.message })
  }
  return res.status(201).json(data)
}

// ─── PATCH: update ───────────────────────────────────────────────────────────
// /api/customers?id=<uuid>
// 自組織が所有する顧客のみ更新可能
async function routePatch(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const updates = (body.updates ?? body) as Record<string, unknown>
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates が必要です' })
  }

  // マルチテナント境界チェック: 自組織が所有する顧客か確認
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: existingError } = await (db as any)
    .from('customers')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()

  if (existingError) {
    console.error('[customers:update] existence check error:', existingError)
    return res.status(500).json({ error: '更新対象の確認に失敗しました', detail: existingError.message })
  }
  if (!existing || existing.organization_id !== orgId) {
    return res.status(404).json({ error: '顧客が見つかりません' })
  }

  // ホワイトリストでフィルタ
  const safeUpdates = pickFields(updates, CUSTOMER_UPDATABLE_FIELDS)
  if (Object.keys(safeUpdates).length === 0) {
    return res.status(400).json({ error: '更新可能なフィールドがありません' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('customers')
    .update(safeUpdates)
    .eq('id', id)
    .eq('organization_id', orgId) // 念のため二重ガード
    .select(SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[customers:update] DB error:', error)
    return res.status(500).json({ error: '顧客の更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
// /api/customers?id=<uuid>
// 自組織が所有する顧客のみ削除可能
async function routeDelete(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  // マルチテナント境界チェック
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: existingError } = await (db as any)
    .from('customers')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()

  if (existingError) {
    console.error('[customers:delete] existence check error:', existingError)
    return res.status(500).json({ error: '削除対象の確認に失敗しました', detail: existingError.message })
  }
  if (!existing || existing.organization_id !== orgId) {
    return res.status(404).json({ error: '顧客が見つかりません' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId) // 念のため二重ガード

  if (error) {
    console.error('[customers:delete] DB error:', error)
    return res.status(500).json({ error: '顧客の削除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: true })
}

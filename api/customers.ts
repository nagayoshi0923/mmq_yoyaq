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
  'id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, avatar_url, birth_date, prefecture, preferences, notification_settings, created_at, updated_at'

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
  'avatar_url',
  'birth_date',
  'prefecture',
  'preferences',
  'notification_settings',
] as const

// 更新可能フィールドのホワイトリスト（Mass Assignment 防止）
// organization_id / user_id / id / created_at / updated_at は更新不可
// notes / visit_count / total_spent / last_visit は customer_org_stats に移行済み
const CUSTOMER_UPDATABLE_FIELDS = [
  'name',
  'nickname',
  'email',
  'email_verified',
  'phone',
  'address',
  'line_id',
  'avatar_url',
  'birth_date',
  'prefecture',
  'preferences',
  'notification_settings',
] as const

// プラットフォーム顧客（organization_id IS NULL）はこの組織への接点があるか確認する
async function filterToOrgCustomers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient: any,
  customers: Record<string, unknown>[],
  orgId: string,
): Promise<Record<string, unknown>[]> {
  const result: Record<string, unknown>[] = []
  for (const c of customers) {
    if (c.organization_id === orgId) { result.push(c); continue }
    // プラットフォーム顧客: reservations 経由の接点を確認
    const { data } = await dbClient
      .from('reservations')
      .select('id')
      .eq('customer_id', c.id)
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle()
    if (data) result.push(c)
  }
  return result
}

// org がこの顧客を操作できるか確認（ゲスト: org_id 一致、プラットフォーム: 予約接点あり）
async function assertOrgOwnsCustomer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient: any,
  customerId: string,
  orgId: string,
): Promise<boolean> {
  const { data: c } = await dbClient
    .from('customers')
    .select('id, organization_id')
    .eq('id', customerId)
    .maybeSingle()
  if (!c) return false
  if (c.organization_id === orgId) return true
  if (c.organization_id !== null) return false
  // プラットフォーム顧客: reservations 接点チェック
  const { data: r } = await dbClient
    .from('reservations')
    .select('id')
    .eq('customer_id', customerId)
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle()
  return !!r
}

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
// /api/customers?action=listWithStats&search=...&page=...&pageSize=...  → サーバ集計＋ページング（顧客管理ページ用）
async function routeGet(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const action = req.query.action as string | undefined

  if (action === 'listWithStats') {
    const search = (req.query.search as string | undefined)?.trim() || undefined
    const rawPage = Number.parseInt(req.query.page as string, 10)
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
    const rawPageSize = Number.parseInt(req.query.pageSize as string, 10)
    const pageSize = Number.isFinite(rawPageSize) ? Math.min(100, Math.max(10, rawPageSize)) : 50
    const offset = (page - 1) * pageSize

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).rpc('get_org_customers_with_stats', {
      p_org_id: orgId,
      p_search: search ?? null,
      p_limit: pageSize,
      p_offset: offset,
    })

    if (error) {
      console.error('[customers:listWithStats] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>
    const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0
    const customers = rows.map((row) => {
      const { total_count: _totalCount, ...rest } = row
      return rest
    })

    return res.status(200).json({ customers, totalCount })
  }

  if (action === 'findByEmail') {
    const email = req.query.email as string | undefined
    if (!email) return res.status(400).json({ error: 'email が必要です' })

    // メールで検索: 自組織のゲスト顧客 or プラットフォーム顧客（接点あり）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allMatches, error } = await (db as any)
      .from('customers')
      .select(SELECT_FIELDS)
      .eq('email', email)
      .or(`organization_id.eq.${orgId},organization_id.is.null`)

    if (error) {
      console.error('[customers:findByEmail] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    const data = await filterToOrgCustomers(db, allMatches ?? [], orgId)
    return res.status(200).json(data[0] ?? null)
  }

  if (action === 'findByPhone') {
    const phone = req.query.phone as string | undefined
    if (!phone) return res.status(400).json({ error: 'phone が必要です' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allMatches, error } = await (db as any)
      .from('customers')
      .select(SELECT_FIELDS)
      .eq('phone', phone)
      .or(`organization_id.eq.${orgId},organization_id.is.null`)

    if (error) {
      console.error('[customers:findByPhone] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    const data = await filterToOrgCustomers(db, allMatches ?? [], orgId)
    return res.status(200).json(data[0] ?? null)
  }

  // デフォルト: 自組織が見られる全顧客（RPC 経由）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc('get_org_customers', { p_org_id: orgId })

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

  // マルチテナント境界チェック
  const canEdit = await assertOrgOwnsCustomer(db, id, orgId)
  if (!canEdit) return res.status(404).json({ error: '顧客が見つかりません' })

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
  const canDelete = await assertOrgOwnsCustomer(db, id, orgId)
  if (!canDelete) return res.status(404).json({ error: '顧客が見つかりません' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from('customers')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[customers:delete] DB error:', error)
    return res.status(500).json({ error: '顧客の削除に失敗しました', detail: error.message })
  }
  return res.status(200).json({ success: true })
}

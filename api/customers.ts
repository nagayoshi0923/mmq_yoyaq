import { customerSortKeys } from '../src/types/customerList.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, requireAdmin, createUserScopedClient, type AuthUser, ApiError } from './_lib/auth.js'

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
    if (method === 'PATCH') return await routePatch(req, res, user)
    if (method === 'DELETE') {
      requireAdmin(user)
      return await routeDelete(req, res, user.orgId)
    }
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

  if (action === 'playedScenarioOptions') {
    const rows: Record<string, unknown>[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('organization_scenarios_with_master')
        .select('scenario_master_id, title').eq('organization_id', orgId)
        .eq('org_status', 'available').order('title').order('scenario_master_id')
        .range(offset, offset + 499)
      if (error) return res.status(500).json({ error: '作品一覧を取得できませんでした' })
      rows.push(...(data ?? []))
      if (!data || data.length < 500) break
    }
    return res.status(200).json(rows)
  }

  if (action === 'reservationHistory') {
    const customerId = req.query.customerId
    if (typeof customerId !== 'string' || !customerId) {
      return res.status(400).json({ error: 'customerId が必要です' })
    }
    // History is tenant-owned even when the customer profile is shared.
    // Fetch every page in a stable order; do not return partial history on failure.
    const rows: Record<string, unknown>[] = []
    const pageSize = 500
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from('reservations')
        .select('id, title, scenario_master_id, requested_datetime, participant_count, final_price, status')
        .eq('organization_id', orgId)
        .eq('customer_id', customerId)
        .order('requested_datetime', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1)
      if (error) {
        console.error('[customers:reservationHistory] DB error:', error)
        return res.status(500).json({ error: '予約履歴を取得できませんでした' })
      }
      rows.push(...(data ?? []))
      if (!data || data.length < pageSize) break
    }
    return res.status(200).json(rows)
  }

  if (action === 'listWithStats') {
    const search = (req.query.search as string | undefined)?.trim() || undefined
    const rawPage = Number.parseInt(req.query.page as string, 10)
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
    const rawPageSize = Number.parseInt(req.query.pageSize as string, 10)
    const pageSize = Number.isFinite(rawPageSize) ? Math.min(100, Math.max(10, rawPageSize)) : 50
    const offset = (page - 1) * pageSize

    const scalar = (key: string) => typeof req.query[key] === 'string' ? req.query[key] as string : undefined
    const sortBy = scalar('sortBy') ?? 'created_at'
    const sortDir = scalar('sortDir') ?? 'desc'
    const integer = (key: string) => {
      const raw = scalar(key)
      if (raw === undefined || raw === '') return null
      const value = Number(raw)
      return /^\d+$/.test(raw) && Number.isSafeInteger(value) && value <= 2147483647 ? value : NaN
    }
    const minReservations = integer('minReservations'), minVisits = integer('minVisits'), minAmount = integer('minAmount')
    const validDate = (value: string | undefined) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value)
    const visitFrom = scalar('visitFrom'), visitTo = scalar('visitTo'), hasCoupons = scalar('hasCoupons')
    if (!customerSortKeys.some(key => key === sortBy) || !['asc','desc'].includes(sortDir)
      || [minReservations,minVisits,minAmount].some(Number.isNaN)
      || !validDate(visitFrom) || !validDate(visitTo) || (visitFrom && visitTo && visitFrom > visitTo)
      || (hasCoupons !== undefined && !['true','false'].includes(hasCoupons))) {
      return res.status(400).json({ error: '並び順・絞り込み条件を確認してください' })
    }
    const { data, error } = await db!.rpc('search_org_customers', {
      p_org_id: orgId, p_search: search ?? null, p_limit: pageSize, p_offset: offset,
      p_sort_by: sortBy, p_sort_dir: sortDir, p_min_reservations: minReservations,
      p_min_visits: minVisits, p_min_amount: minAmount,
      p_has_coupons: hasCoupons === undefined ? null : hasCoupons === 'true',
      p_visit_from: visitFrom || null, p_visit_to: visitTo || null,
    })
    if (error) {
      console.error('[customers:listWithStats] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました' })
    }
    return res.status(200).json(data)

  }

  if (action === 'findByEmail') {
    const email = req.query.email as string | undefined
    if (!email) return res.status(400).json({ error: 'email が必要です' })

    // 通常一覧と同じ組織への予約・貸切参加の接点で検索。変更権限とは分離。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allMatches, error } = await (db as any)
      .rpc('get_org_customers', { p_org_id: orgId })
      .select(SELECT_FIELDS)
      .eq('email', email)

    if (error) {
      console.error('[customers:findByEmail] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    const data = allMatches ?? []
    return res.status(200).json(data[0] ?? null)
  }

  if (action === 'findByPhone') {
    const phone = req.query.phone as string | undefined
    if (!phone) return res.status(400).json({ error: 'phone が必要です' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allMatches, error } = await (db as any)
      .rpc('get_org_customers', { p_org_id: orgId })
      .select(SELECT_FIELDS)
      .eq('phone', phone)

    if (error) {
      console.error('[customers:findByPhone] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    const data = allMatches ?? []
    return res.status(200).json(data[0] ?? null)
  }

  // デフォルト: 自組織が見られる全顧客（RPC 経由）
  const { data, error } = await db!.rpc('get_org_customers', { p_org_id: orgId })

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

  const { data, error } = await db!
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
async function routePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const updates = (body.updates ?? body) as Record<string, unknown>
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates が必要です' })
  }

  // ホワイトリストでフィルタ
  const safeUpdates = pickFields(updates, CUSTOMER_UPDATABLE_FIELDS)
  if (Object.keys(safeUpdates).length === 0) {
    return res.status(400).json({ error: '更新可能なフィールドがありません' })
  }

  // Use the verified user's JWT so the existing UPDATE policy is checked at
  // write time, including reservation OR private-group contact for shared profiles.
  let query = createUserScopedClient(user.jwt)
    .from('customers')
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (user.role !== 'license_admin') {
    query = query.or(`organization_id.eq.${user.orgId},organization_id.is.null,user_id.eq.${user.userId}`)
  }
  const { data, error } = await query.select(SELECT_FIELDS).maybeSingle()

  if (error) {
    console.error('[customers:update] DB error:', error)
    return res.status(500).json({ error: '顧客の更新に失敗しました', detail: error.message })
  }
  if (!data) return res.status(404).json({ error: '顧客が見つからないか、編集権限がありません' })
  return res.status(200).json(data)
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
// /api/customers?id=<uuid>
// 自組織が所有する顧客のみ削除可能
async function routeDelete(req: VercelRequest, res: VercelResponse, orgId: string) {
  if (!db) return res.status(500).json({ error: 'db unavailable' })

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id が必要です' })

  // Scope the write itself; a booking connection does not confer deletion ownership.
  const { data, error } = await db!
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[customers:delete] DB error:', error)
    return res.status(500).json({ error: '顧客の削除に失敗しました', detail: error.message })
  }
  if (!data) return res.status(404).json({ error: '顧客が見つかりません' })
  return res.status(200).json({ success: true })
}

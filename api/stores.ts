import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, requireStaff, requireAdmin, ApiError, type AuthUser } from './_lib/auth.js'

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

const STORE_SELECT_FIELDS =
  'id, organization_id, name, short_name, address, access_info, phone_number, email, opening_date, manager_name, status, ownership_type, franchise_fee, franchise_fee_type, franchise_fee_percent, capacity, rooms, notes, color, fixed_costs, venue_cost_per_performance, is_temporary, temporary_date, temporary_dates, temporary_venue_names, display_order, region, transport_allowance, kit_group_id, kit_fixed, created_at, updated_at'

const STORE_TRAVEL_TIME_SELECT_FIELDS =
  'id, organization_id, store_a_id, store_b_id, minutes, memo, created_at, updated_at'

// 作成可能フィールドのホワイトリスト
const STORE_CREATABLE_FIELDS = [
  'name', 'short_name', 'address', 'access_info', 'phone_number', 'email',
  'opening_date', 'manager_name', 'status', 'ownership_type', 'franchise_fee',
  'franchise_fee_type', 'franchise_fee_percent',
  'capacity', 'rooms', 'notes', 'color', 'fixed_costs', 'venue_cost_per_performance',
  'is_temporary', 'temporary_date', 'temporary_dates', 'temporary_venue_names',
  'display_order', 'region', 'transport_allowance', 'kit_group_id',
  'kit_fixed',
] as const

// 更新可能フィールドのホワイトリスト（Mass Assignment 防止）
const STORE_UPDATABLE_FIELDS = STORE_CREATABLE_FIELDS

function pickFields<T extends readonly string[]>(
  src: Record<string, unknown>,
  allowed: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(src)) {
    if ((allowed as readonly string[]).includes(key)) {
      out[key] = src[key]
    }
  }
  return out
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
    if (req.method === 'PATCH') return await handlePatch(req, res, user)
    if (req.method === 'DELETE') return await handleDelete(req, res, user)
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[stores] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  const action = req.query.action as string | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  if (action === 'travelTimes') {
    const { data, error } = await database
      .from('store_travel_times')
      .select(STORE_TRAVEL_TIME_SELECT_FIELDS)
      .eq('organization_id', user.orgId)
      .order('store_a_id', { ascending: true })
      .order('store_b_id', { ascending: true })
    if (error) {
      console.error('[stores:travelTimes] DB error:', error)
      return res.status(500).json({ error: '店舗間移動時間の取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? [])
  }

  if (id) {
    const { data, error } = await database
      .from('stores')
      .select(STORE_SELECT_FIELDS)
      .eq('id', id)
      .eq('organization_id', user.orgId)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') {
      console.error('[stores:getById] DB error:', error)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
    }
    return res.status(200).json(data ?? null)
  }

  const { data, error } = await database
    .from('stores')
    .select(STORE_SELECT_FIELDS)
    .eq('organization_id', user.orgId)

  if (error) {
    console.error('[stores] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── POST: 店舗作成（admin 専用）─────────────────────────────────────────────
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireAdmin(user)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const body = (req.body ?? {}) as Record<string, unknown>
  const insertRow = pickFields(body, STORE_CREATABLE_FIELDS)

  if (!insertRow.name || typeof insertRow.name !== 'string') {
    return res.status(400).json({ error: 'name は必須です' })
  }

  // organization_id はサーバー側で強制
  insertRow.organization_id = user.orgId

  const { data, error } = await database
    .from('stores')
    .insert([insertRow])
    .select(STORE_SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[stores:create] DB error:', error)
    return res.status(500).json({ error: '店舗の作成に失敗しました', detail: error.message })
  }
  return res.status(201).json(data)
}

// ─── PATCH ───────────────────────────────────────────────────────────────────
async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = req.query.action as string | undefined

  // ─── action=updateDisplayOrder（一括更新）
  if (action === 'updateDisplayOrder') {
    requireAdmin(user)
    return await handleUpdateDisplayOrder(req, res, user)
  }

  if (action === 'upsertTravelTimes') {
    requireAdmin(user)
    return await handleUpsertTravelTimes(req, res, user)
  }

  requireAdmin(user)

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 自組織の店舗であることを必ず確認
  const { data: existing, error: existingErr } = await database
    .from('stores')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (existingErr) {
    console.error('[stores:update] existing lookup error:', existingErr)
    return res.status(500).json({ error: '店舗情報の確認に失敗しました' })
  }
  if (!existing) return res.status(404).json({ error: '店舗が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の店舗は編集できません' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const updateRow = pickFields(body, STORE_UPDATABLE_FIELDS)
  if (Object.keys(updateRow).length === 0) {
    return res.status(400).json({ error: '更新可能なフィールドがありません' })
  }

  const { data, error } = await database
    .from('stores')
    .update(updateRow)
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .select(STORE_SELECT_FIELDS)
    .single()

  if (error) {
    console.error('[stores:update] DB error:', error)
    return res.status(500).json({ error: '店舗の更新に失敗しました', detail: error.message })
  }
  return res.status(200).json(data)
}

// ─── DELETE: 店舗削除（admin 専用）───────────────────────────────────────────
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireAdmin(user)

  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  const { data: existing, error: existingErr } = await database
    .from('stores')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (existingErr) {
    console.error('[stores:delete] existing lookup error:', existingErr)
    return res.status(500).json({ error: '店舗情報の確認に失敗しました' })
  }
  if (!existing) return res.status(404).json({ error: '店舗が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の店舗は削除できません' })
  }

  const { error } = await database
    .from('stores')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.orgId)

  if (error) {
    console.error('[stores:delete] DB error:', error)
    return res.status(500).json({ error: '店舗の削除に失敗しました', detail: error.message })
  }
  return res.status(204).end()
}

async function handleUpsertTravelTimes(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const items = body.items
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items は配列必須です' })
  }

  const normalized: Array<{
    store_a_id: string
    store_b_id: string
    minutes: number | null
    memo: string | null
  }> = []
  const storeIds = new Set<string>()

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return res.status(400).json({ error: 'items の要素はオブジェクトである必要があります' })
    }
    const raw = item as {
      store_a_id?: unknown
      store_b_id?: unknown
      minutes?: unknown
      memo?: unknown
    }
    if (typeof raw.store_a_id !== 'string' || typeof raw.store_b_id !== 'string') {
      return res.status(400).json({ error: 'store_a_id / store_b_id は必須です' })
    }
    if (raw.store_a_id === raw.store_b_id) {
      return res.status(400).json({ error: '同じ店舗同士の移動時間は保存できません' })
    }
    if (raw.minutes !== null && raw.minutes !== undefined) {
      if (
        typeof raw.minutes !== 'number' ||
        !Number.isInteger(raw.minutes) ||
        raw.minutes <= 0 ||
        raw.minutes > 1440
      ) {
        return res.status(400).json({ error: 'minutes は 1〜1440 の整数、または null である必要があります' })
      }
    }
    if (raw.memo !== null && raw.memo !== undefined && typeof raw.memo !== 'string') {
      return res.status(400).json({ error: 'memo は文字列または null である必要があります' })
    }

    const [storeAId, storeBId] =
      raw.store_a_id < raw.store_b_id
        ? [raw.store_a_id, raw.store_b_id]
        : [raw.store_b_id, raw.store_a_id]

    normalized.push({
      store_a_id: storeAId,
      store_b_id: storeBId,
      minutes: raw.minutes == null ? null : raw.minutes,
      memo: raw.memo == null ? null : raw.memo.trim(),
    })
    storeIds.add(storeAId)
    storeIds.add(storeBId)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  const ids = [...storeIds]
  if (ids.length > 0) {
    const { data: stores, error: lookupErr } = await database
      .from('stores')
      .select('id, organization_id')
      .in('id', ids)
    if (lookupErr) {
      console.error('[stores:upsertTravelTimes] store lookup error:', lookupErr)
      return res.status(500).json({ error: '店舗情報の確認に失敗しました', detail: lookupErr.message })
    }
    const found = new Map((stores ?? []).map((s: { id: string; organization_id: string }) => [s.id, s.organization_id]))
    for (const id of ids) {
      if (!found.has(id)) return res.status(404).json({ error: `店舗が見つかりません: ${id}` })
      if (found.get(id) !== user.orgId) {
        return res.status(403).json({ error: '他組織の店舗間移動時間は編集できません' })
      }
    }
  }

  const deleteRows = normalized.filter(item => item.minutes == null)
  const upsertRows = normalized.filter(
    (item): item is { store_a_id: string; store_b_id: string; minutes: number; memo: string | null } =>
      item.minutes != null,
  )

  for (const item of deleteRows) {
    const { error } = await database
      .from('store_travel_times')
      .delete()
      .eq('organization_id', user.orgId)
      .eq('store_a_id', item.store_a_id)
      .eq('store_b_id', item.store_b_id)
    if (error) {
      console.error('[stores:deleteTravelTime] DB error:', error)
      return res.status(500).json({ error: '店舗間移動時間の削除に失敗しました', detail: error.message })
    }
  }

  if (upsertRows.length > 0) {
    const rows = upsertRows.map(item => ({
      organization_id: user.orgId,
      store_a_id: item.store_a_id,
      store_b_id: item.store_b_id,
      minutes: item.minutes,
      memo: item.memo,
    }))
    const { error } = await database
      .from('store_travel_times')
      .upsert(rows, { onConflict: 'organization_id,store_a_id,store_b_id' })
    if (error) {
      console.error('[stores:upsertTravelTimes] DB error:', error)
      return res.status(500).json({ error: '店舗間移動時間の保存に失敗しました', detail: error.message })
    }
  }

  const { data, error } = await database
    .from('store_travel_times')
    .select(STORE_TRAVEL_TIME_SELECT_FIELDS)
    .eq('organization_id', user.orgId)
    .order('store_a_id', { ascending: true })
    .order('store_b_id', { ascending: true })

  if (error) {
    console.error('[stores:travelTimesAfterUpsert] DB error:', error)
    return res.status(500).json({ error: '店舗間移動時間の取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// ─── helpers ─────────────────────────────────────────────────────────────────
async function handleUpdateDisplayOrder(
  req: VercelRequest,
  res: VercelResponse,
  user: AuthUser,
) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const orders = body.orders
  if (!Array.isArray(orders)) {
    return res.status(400).json({ error: 'orders は配列必須です' })
  }
  for (const o of orders) {
    if (
      !o || typeof o !== 'object' ||
      typeof (o as { id?: unknown }).id !== 'string' ||
      typeof (o as { display_order?: unknown }).display_order !== 'number'
    ) {
      return res.status(400).json({ error: 'orders の要素は { id: string; display_order: number } である必要があります' })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 対象 ID を一度に取得し、全て自組織のものか検証
  const ids = (orders as Array<{ id: string }>).map((o) => o.id)
  const { data: existingStores, error: lookupErr } = await database
    .from('stores')
    .select('id, organization_id')
    .in('id', ids)
  if (lookupErr) {
    console.error('[stores:updateDisplayOrder] lookup error:', lookupErr)
    return res.status(500).json({ error: '店舗情報の確認に失敗しました' })
  }
  const orgIds = new Set(
    (existingStores ?? []).map((s: { id: string; organization_id: string }) => s.organization_id),
  )
  if (orgIds.size > 1 || (orgIds.size === 1 && !orgIds.has(user.orgId))) {
    return res.status(403).json({ error: '他組織の店舗が含まれています' })
  }
  const foundIds = new Set((existingStores ?? []).map((s: { id: string }) => s.id))
  for (const id of ids) {
    if (!foundIds.has(id)) {
      return res.status(404).json({ error: `店舗が見つかりません: ${id}` })
    }
  }

  // 並列で更新（organization_id チェックを必ず付ける）
  const updates = (orders as Array<{ id: string; display_order: number }>).map(
    ({ id, display_order }) =>
      database
        .from('stores')
        .update({ display_order })
        .eq('id', id)
        .eq('organization_id', user.orgId),
  )
  const results = await Promise.all(updates)
  const errors = results.filter((r) => r.error)
  if (errors.length > 0) {
    console.error('[stores:updateDisplayOrder] update errors:', errors.map((e) => e.error))
    return res.status(500).json({ error: '表示順序の更新に失敗しました' })
  }
  return res.status(204).end()
}

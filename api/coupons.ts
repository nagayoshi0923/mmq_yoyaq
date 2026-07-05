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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

const CUSTOMER_COUPON_FIELDS = `
  id,
  campaign_id,
  customer_id,
  organization_id,
  uses_remaining,
  expires_at,
  status,
  created_at,
  updated_at,
  coupon_campaigns (
    id,
    organization_id,
    name,
    description,
    discount_type,
    discount_amount,
    max_uses_per_customer,
    target_type,
    target_ids,
    trigger_type,
    valid_from,
    valid_until,
    is_active
  )
`

const COUPON_CAMPAIGN_FIELDS =
  'id, organization_id, name, description, discount_type, discount_amount, max_uses_per_customer, target_type, target_ids, trigger_type, valid_from, valid_until, coupon_expiry_days, usage_valid_from, usage_valid_until, max_total_grants, max_grants_per_customer, coupon_code, notify_on_grant, min_order_amount, combinable, allowed_weekdays, allowed_time_slots, display_name, display_image_url, customer_terms, internal_memo, is_active, created_at, updated_at'

const CUSTOMER_COUPON_WITH_CUSTOMER_FIELDS = `
  id,
  campaign_id,
  customer_id,
  organization_id,
  uses_remaining,
  expires_at,
  status,
  created_at,
  updated_at,
  customers (
    name,
    email
  )
`

// PostgREST のデフォルト行数上限（1000）を超える結果を全件取得するためのページサイズ。
const PAGE_SIZE = 1000
// coupon_usages の .in() に一度に渡す customer_coupon_id の最大件数。
// 1クーポンあたりの usage 行数が数枚でも 1000 行上限に収まるよう控えめに設定。
const USAGE_CHUNK_SIZE = 200

/**
 * PostgREST のデフォルト 1000 行上限を回避し、range ページングで全行を取得する。
 * buildQuery は毎回新しいクエリビルダを返す関数（同じビルダを使い回すと range が累積するため）。
 */
async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: () => any,
): Promise<{ rows: T[]; error: unknown | null }> {
  const all: T[] = []
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1)
    if (error) return { rows: all, error }
    const batch = (data as T[]) ?? []
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return { rows: all, error: null }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// JWT user.id から customer 行を1件取得。
// platform_customers_phase1 マイグレーション以降、ログイン済み顧客の customers 行は
// organization_id = NULL（プラットフォーム共通）になっているため、user_id だけで一意に引く。
// organizationId 引数は呼び出し側互換のため残すが使わない（customers の org フィルタは外す）。
async function findCustomerByUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
  userId: string,
  _organizationId: string | null,
  selectFields = 'id'
): Promise<Record<string, unknown> | null> {
  const { data } = await database
    .from('customers')
    .select(selectFields)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  return (data?.[0] as Record<string, unknown>) ?? null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)

    if (req.method === 'GET') return handleGet(req, res, user)
    if (req.method === 'POST') return handlePost(req, res, user)
    if (req.method === 'PATCH') return handlePatch(req, res, user)
    if (req.method === 'DELETE') return handleDelete(req, res, user)

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[coupons] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// =========================================
// GET handler
// =========================================
async function handleGet(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const type = (req.query.type as string | undefined) ?? 'available'
  const requestedOrgId = req.query.organization_id as string | undefined

  // 顧客向け read（requireAuth のみで OK）
  if (type === 'available') {
    return handleAvailable(req, res, user.userId, requestedOrgId ?? user.orgId)
  }
  if (type === 'all') {
    return handleAll(req, res, user.userId, user.orgId)
  }
  if (type === 'usages') {
    return handleUsages(req, res, user.userId, user.orgId)
  }
  if (type === 'current-reservations') {
    return handleCurrentReservations(req, res, user)
  }

  // 管理者向け read（requireStaff）
  if (type === 'campaigns') {
    requireStaff(user)
    return handleCampaigns(req, res, user)
  }
  if (type === 'campaign-stats') {
    requireStaff(user)
    return handleCampaignStats(req, res, user)
  }
  if (type === 'admin-usages') {
    requireStaff(user)
    return handleAdminUsages(req, res, user)
  }
  if (type === 'campaign-coupons') {
    requireStaff(user)
    return handleCampaignCoupons(req, res, user)
  }
  if (type === 'search-customers') {
    requireStaff(user)
    return handleSearchCustomers(req, res, user)
  }
  if (type === 'customer-coupons') {
    requireStaff(user)
    return handleCustomerCoupons(req, res, user)
  }

  return res.status(400).json({ error: `unknown type: ${type}` })
}

// =========================================
// POST handler
// =========================================
async function handlePost(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const action = req.query.action as string | undefined

  // 顧客向け write（requireAuth のみで OK）
  if (action === 'use') {
    return handleUseCoupon(req, res, user)
  }
  if (action === 'grant-registration') {
    return handleGrantRegistrationCoupon(req, res, user)
  }
  if (action === 'redeem-code') {
    return handleRedeemCouponByCode(req, res, user)
  }

  // 管理者向け write（requireStaff）
  if (action === 'create-campaign') {
    requireStaff(user)
    return handleCreateCampaign(req, res, user)
  }
  if (action === 'grant-to-customer') {
    requireStaff(user)
    return handleGrantCouponToCustomer(req, res, user)
  }

  return res.status(400).json({ error: `unknown action: ${action}` })
}

// =========================================
// PATCH handler（管理者向けのみ）
// =========================================
async function handlePatch(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  const action = req.query.action as string | undefined

  if (action === 'update-campaign') {
    return handleUpdateCampaign(req, res, user)
  }
  if (action === 'toggle-campaign-active') {
    return handleToggleCampaignActive(req, res, user)
  }
  if (action === 'adjust-coupon-uses') {
    return handleAdjustCouponUses(req, res, user)
  }

  return res.status(400).json({ error: `unknown action: ${action}` })
}

// =========================================
// DELETE handler（管理者向けのみ）
// =========================================
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  const action = req.query.action as string | undefined

  if (action === 'restore-usage') {
    return handleRestoreCouponUsage(req, res, user)
  }
  if (action === 'revoke-coupon') {
    return handleRevokeCoupon(req, res, user)
  }

  return res.status(400).json({ error: `unknown action: ${action}` })
}

// =========================================
// 顧客向け: 利用可能クーポン
// =========================================
async function handleAvailable(
  _req: VercelRequest,
  res: VercelResponse,
  userId: string,
  organizationId: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const customer = await findCustomerByUserId(database, userId, organizationId)
  if (!customer) return res.status(200).json([])

  // platform customer (organizationId='') では .eq('organization_id', '') が一致しないため
  // org フィルタを条件付きに（customer_id 一致で本人特定済み）。
  let availableQuery = database
    .from('customer_coupons')
    .select(CUSTOMER_COUPON_FIELDS)
    .eq('customer_id', customer.id)
    .eq('status', 'active')
    .gt('uses_remaining', 0)
    .order('created_at', { ascending: false })
  if (organizationId) availableQuery = availableQuery.eq('organization_id', organizationId)
  const { data, error } = await availableQuery

  if (error) {
    console.error('[coupons:available] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  const now = new Date()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = ((data as any[]) ?? []).filter((coupon: any) => {
    if (coupon.expires_at && new Date(coupon.expires_at) < now) return false
    const campaign = coupon.coupon_campaigns
    if (campaign) {
      if (!campaign.is_active) return false
      // 配布期間（顧客が新規に受け取れる期間）
      if (campaign.valid_from && new Date(campaign.valid_from) > now) return false
      if (campaign.valid_until && new Date(campaign.valid_until) < now) return false
      // 使用期間（絶対日付）: 配布済みでも期間外は使えない
      if (campaign.usage_valid_from && new Date(campaign.usage_valid_from) > now) return false
      if (campaign.usage_valid_until && new Date(campaign.usage_valid_until) < now) return false
    }
    return true
  })

  return res.status(200).json(filtered)
}

// =========================================
// 顧客向け: マイページ用クーポン一覧
// =========================================
async function handleAll(
  _req: VercelRequest,
  res: VercelResponse,
  userId: string,
  organizationId: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const customer = await findCustomerByUserId(database, userId, organizationId)
  if (!customer) return res.status(200).json([])

  const { data: couponRows, error: couponError } = await database
    .from('customer_coupons')
    .select(CUSTOMER_COUPON_FIELDS)
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })

  if (couponError) {
    console.error('[coupons:all] coupons DB error:', couponError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: couponError.message })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (couponRows as any[]) ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const couponIds = rows.map((c: any) => c.id)
  if (couponIds.length === 0) return res.status(200).json(rows)

  const { data: usageRows, error: usageError } = await database
    .from('coupon_usages')
    .select(`
      id,
      customer_coupon_id,
      reservation_id,
      used_at,
      discount_amount,
      reservations (
        id,
        title,
        requested_datetime,
        store_id
      )
    `)
    .in('customer_coupon_id', couponIds)
    .order('used_at', { ascending: false })

  if (usageError) {
    console.warn('[coupons:all] usages fetch failed:', usageError)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.status(200).json(rows.map((c: any) => ({ ...c, coupon_usages: [] })))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usages = (usageRows ?? []) as any[]
  const storeIds = [
    ...new Set(
      usages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((u: any) => {
          const r = u.reservations
          const one = Array.isArray(r) ? r[0] : r
          return one?.store_id
        })
        .filter((id: unknown): id is string => typeof id === 'string'),
    ),
  ]

  const storeMap: Record<string, { name: string; short_name: string | null }> = {}
  if (storeIds.length > 0) {
    const { data: storeRows, error: storeError } = await database
      .from('stores')
      .select('id, name, short_name')
      .in('id', storeIds)
    if (storeError) {
      console.warn('[coupons:all] stores fetch failed:', storeError)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(storeRows as any[])?.forEach((s: any) => {
        storeMap[s.id] = { name: s.name, short_name: s.short_name }
      })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byCoupon: Record<string, any[]> = {}
  for (const u of usages) {
    const resRaw = u.reservations
    const r = Array.isArray(resRaw) ? resRaw[0] : resRaw
    const sid = r?.store_id ?? null
    const storeInfo = sid ? storeMap[sid] : undefined
    const entry = {
      id: u.id,
      reservation_id: u.reservation_id,
      used_at: u.used_at,
      discount_amount: u.discount_amount,
      reservations: r
        ? {
            id: r.id,
            title: r.title,
            requested_datetime: r.requested_datetime,
            store_id: r.store_id,
            stores: storeInfo ? { name: storeInfo.name, short_name: storeInfo.short_name } : null,
          }
        : null,
    }
    const cid = u.customer_coupon_id
    if (!byCoupon[cid]) byCoupon[cid] = []
    byCoupon[cid].push(entry)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = rows.map((c: any) => ({ ...c, coupon_usages: byCoupon[c.id] ?? [] }))
  return res.status(200).json(result)
}

// =========================================
// 顧客向け: クーポン使用履歴
// =========================================
async function handleUsages(
  _req: VercelRequest,
  res: VercelResponse,
  userId: string,
  organizationId: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const customer = await findCustomerByUserId(database, userId, organizationId)
  if (!customer) return res.status(200).json([])

  const { data: coupons } = await database
    .from('customer_coupons')
    .select('id')
    .eq('customer_id', customer.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const couponIds = ((coupons as any[]) ?? []).map((c: any) => c.id)
  if (couponIds.length === 0) return res.status(200).json([])

  const { data, error } = await database
    .from('coupon_usages')
    .select(`
      id,
      customer_coupon_id,
      reservation_id,
      discount_amount,
      used_at,
      customer_coupons (
        id,
        campaign_id,
        coupon_campaigns (
          name,
          discount_type,
          discount_amount
        )
      )
    `)
    .in('customer_coupon_id', couponIds)
    .order('used_at', { ascending: false })

  if (error) {
    console.error('[coupons:usages] DB error:', error)
    const { data: usages, error: usageError } = await database
      .from('coupon_usages')
      .select('id, customer_coupon_id, reservation_id, discount_amount, used_at')
      .in('customer_coupon_id', couponIds)
      .order('used_at', { ascending: false })
    if (usageError) {
      console.error('[coupons:usages] fallback DB error:', usageError)
      return res.status(500).json({ error: 'データ取得に失敗しました', detail: usageError.message })
    }
    return res.status(200).json(usages ?? [])
  }

  return res.status(200).json(data ?? [])
}

// =========================================
// 顧客向け: 現在進行中の予約（クーポン使用時の紐付け候補）
// =========================================
async function handleCurrentReservations(
  _req: VercelRequest,
  res: VercelResponse,
  user: AuthUser
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  const customer = await findCustomerByUserId(database, user.userId, user.orgId, 'id, name, organization_id') as
    | { id: string; name: string | null; organization_id: string | null }
    | null

  // スタッフ情報（スタッフ予約のマッチング用）— 組織スコープも検証
  const { data: staffRows } = await database
    .from('staff')
    .select('id, name, organization_id')
    .eq('user_id', user.userId)
    .eq('organization_id', user.orgId)
    .limit(1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staffRecord = ((staffRows as any[]) ?? [])[0] ?? null

  if (!customer && !staffRecord) return res.status(200).json([])

  // JSTで今日の日付
  const now = new Date()
  const jstOffset = 9 * 60
  const jstNow = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60 * 1000)
  const todayStr = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}-${String(jstNow.getDate()).padStart(2, '0')}`

  // 1. 通常予約（自分が customer_id の予約 / 組織スコープも検証）
  // ⚠️ platform customer (user.orgId='') の場合、reservations.organization_id は実際の
  //    予約先 org の UUID なので .eq(organization_id, '') では一致せず 0 件になる。
  //    user.orgId が空のときは org フィルタを掛けず、customer_id 一致だけで安全に絞る。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let directReservations: any[] = []
  if (customer) {
    let q = database
      .from('reservations')
      .select('id, schedule_event_id, organization_id')
      .eq('customer_id', customer.id)
      .eq('status', 'confirmed')
    if (user.orgId) q = q.eq('organization_id', user.orgId)
    const { data, error } = await q
    if (error) console.error('[coupons:current-reservations] direct error:', error)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    directReservations = (data as any[]) ?? []
  }

  // 2. 貸切公演の参加メンバーとしての予約
  // SECURITY DEFINER RPC は auth.uid() に依存するためサーバ側からは使えない。
  // 同等のクエリをサーバで明示的に組み、結果を必ず本人の user_id + 自組織で再検証する。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const privateGroupReservations: Array<{ reservation_id: string; schedule_event_id: string | null; reservation_status: string; group_status: string }> = []
  {
    const { data: members } = await database
      .from('private_group_members')
      .select('group_id')
      .eq('user_id', user.userId)
      .eq('status', 'joined')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupIds = ((members as any[]) ?? []).map((m: any) => m.group_id).filter(Boolean)
    if (groupIds.length > 0) {
      // platform customer は user.orgId='' なので org フィルタを条件付きに
      let groupsQ = database
        .from('private_groups')
        .select('id, reservation_id, status, organization_id')
        .in('id', groupIds)
        .not('reservation_id', 'is', null)
      if (user.orgId) groupsQ = groupsQ.eq('organization_id', user.orgId)
      const { data: groups } = await groupsQ

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reservationIds = ((groups as any[]) ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((g: any) => g.reservation_id)
        .filter(Boolean)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const groupStatusByRes = new Map<string, string>(((groups as any[]) ?? []).map((g: any) => [g.reservation_id, g.status]))

      if (reservationIds.length > 0) {
        let resQ = database
          .from('reservations')
          .select('id, schedule_event_id, status, organization_id')
          .in('id', reservationIds)
        if (user.orgId) resQ = resQ.eq('organization_id', user.orgId)
        const { data: reservationRows } = await resQ

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of ((reservationRows as any[]) ?? [])) {
          privateGroupReservations.push({
            reservation_id: r.id,
            schedule_event_id: r.schedule_event_id ?? null,
            reservation_status: r.status,
            group_status: groupStatusByRes.get(r.id) ?? '',
          })
        }
      }
    }
  }

  // 3. スタッフ予約（payment_method='staff' or reservation_source='staff_entry'/'staff_participation'）— 組織スコープ
  // platform customer (staffRecord 無し / user.orgId 空) はそもそも staff 予約を持たないのでスキップ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let staffReservations: any[] = []
  if (staffRecord && user.orgId) {
    const { data, error } = await database
      .from('reservations')
      .select('id, participant_names, schedule_event_id, organization_id')
      .or('payment_method.eq.staff,reservation_source.eq.staff_entry,reservation_source.eq.staff_participation')
      .eq('status', 'confirmed')
      .eq('organization_id', user.orgId)
    if (error) console.error('[coupons:current-reservations] staff error:', error)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    staffReservations = (data as any[]) ?? []
  }

  // schedule_event_id を収集して、一括取得（組織スコープ）
  const eventIds = new Set<string>()
  directReservations.forEach((r) => { if (r.schedule_event_id) eventIds.add(r.schedule_event_id) })
  privateGroupReservations.forEach((r) => { if (r.schedule_event_id) eventIds.add(r.schedule_event_id) })
  staffReservations.forEach((r) => { if (r.schedule_event_id) eventIds.add(r.schedule_event_id) })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventsMap: Record<string, any> = {}
  if (eventIds.size > 0) {
    // platform customer (user.orgId='') の場合、reservation 自体は他組織のものを
    // 既に許可しているので、events 取得時の org フィルタも条件付きにする。
    let evQ = database
      .from('schedule_events')
      .select('id, date, start_time, end_time, scenario, venue, organization_id, stores (name)')
      .in('id', Array.from(eventIds))
    if (user.orgId) evQ = evQ.eq('organization_id', user.orgId)
    const { data: events } = await evQ
    if (events) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ev of events as any[]) {
        eventsMap[ev.id] = ev
      }
    }
  }

  // 結果をマージ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allReservations: Array<{ id: string; event: any }> = []

  for (const r of directReservations) {
    const event = eventsMap[r.schedule_event_id]
    if (event) allReservations.push({ id: r.id, event })
  }

  for (const r of privateGroupReservations) {
    if (r.group_status !== 'confirmed') continue
    if (r.reservation_status !== 'confirmed') continue
    const event = r.schedule_event_id ? eventsMap[r.schedule_event_id] : undefined
    if (event && !allReservations.some(existing => existing.id === r.reservation_id)) {
      allReservations.push({ id: r.reservation_id, event })
    }
  }

  const myNames: string[] = []
  if (customer?.name) myNames.push(customer.name)
  if (staffRecord?.name && !myNames.includes(staffRecord.name)) myNames.push(staffRecord.name)

  if (myNames.length > 0) {
    for (const r of staffReservations) {
      const names = r.participant_names as string[] | null
      if (names && names.some((n: string) => myNames.includes(n))) {
        const event = eventsMap[r.schedule_event_id]
        if (event && !allReservations.some(existing => existing.id === r.id)) {
          allReservations.push({ id: r.id, event })
        }
      }
    }
  }

  // 今日の公演で、開始3時間前〜終了1時間後の範囲のものをフィルタ
  const currentHour = jstNow.getHours()
  const currentMinute = jstNow.getMinutes()
  const currentTotalMinutes = currentHour * 60 + currentMinute

  const filtered = allReservations
    .filter(({ event }) => {
      if (!event) return false
      if (event.date !== todayStr) return false

      const [startHour, startMinute] = event.start_time.split(':').map(Number)
      const startTotalMinutes = startHour * 60 + startMinute

      if (currentTotalMinutes < startTotalMinutes - 180) return false

      if (event.end_time) {
        const [endHour, endMinute] = event.end_time.split(':').map(Number)
        const endTotalMinutes = endHour * 60 + endMinute
        return currentTotalMinutes <= endTotalMinutes + 60
      }
      return currentTotalMinutes <= startTotalMinutes + 180
    })
    .map(({ id, event }) => ({
      id,
      scenario_title: event.scenario || '不明なシナリオ',
      store_name: event.stores?.name || event.venue || '不明な店舗',
      date: event.date,
      time: event.start_time.substring(0, 5),
    }))

  return res.status(200).json(filtered)
}

// =========================================
// 管理者向け: キャンペーン一覧
// =========================================
async function handleCampaigns(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('coupon_campaigns')
    .select(COUPON_CAMPAIGN_FIELDS)
    .eq('organization_id', user.orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[coupons:campaigns] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }
  return res.status(200).json(data ?? [])
}

// =========================================
// 管理者向け: キャンペーン統計
// =========================================
async function handleCampaignStats(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const campaignId = req.query.campaign_id as string | undefined
  if (!campaignId) {
    return res.status(400).json({ error: 'campaign_id クエリパラメータが必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // キャンペーンが自組織のものか検証
  const { data: campaign, error: campaignError } = await database
    .from('coupon_campaigns')
    .select('id, organization_id')
    .eq('id', campaignId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (campaignError) {
    console.error('[coupons:campaign-stats] campaign verify error:', campaignError)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: campaignError.message })
  }
  if (!campaign) {
    return res.status(404).json({ error: 'キャンペーンが見つかりません' })
  }

  // 付与されたクーポンを全件取得（1000 行上限を range ページングで回避）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { rows, error: couponsError } = await fetchAllRows<any>(() =>
    database
      .from('customer_coupons')
      .select('id, uses_remaining')
      .eq('campaign_id', campaignId)
      .eq('organization_id', user.orgId)
      .order('id'),
  )

  if (couponsError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = couponsError as any
    console.error('[coupons:campaign-stats] coupons error:', err)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: err?.message })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const couponIds = rows.map((c: any) => c.id)

  let totalUsed = 0
  let totalDiscountAmount = 0

  if (couponIds.length > 0) {
    // couponIds をチャンクに分割して .in() を繰り返す（1リクエストの URL 長・行数上限を回避）
    for (const ids of chunk(couponIds, USAGE_CHUNK_SIZE)) {
      const { data: usages, error: usagesError } = await database
        .from('coupon_usages')
        .select('discount_amount')
        .in('customer_coupon_id', ids)
      if (usagesError) {
        console.error('[coupons:campaign-stats] usages error:', usagesError)
        return res.status(500).json({ error: 'データ取得に失敗しました', detail: usagesError.message })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usageRows = (usages as any[]) ?? []
      totalUsed += usageRows.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      totalDiscountAmount += usageRows.reduce((sum: number, u: any) => sum + (u.discount_amount ?? 0), 0)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalGranted = rows.length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalRemaining = rows.reduce((sum: number, c: any) => sum + (c.uses_remaining ?? 0), 0)

  return res.status(200).json({
    totalGranted,
    totalUsed,
    totalRemaining,
    totalDiscountAmount,
  })
}

// =========================================
// 管理者向け: 顧客クーポンの使用履歴
// =========================================
async function handleAdminUsages(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const customerCouponId = req.query.customer_coupon_id as string | undefined
  if (!customerCouponId) {
    return res.status(400).json({ error: 'customer_coupon_id クエリパラメータが必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 顧客クーポンが自組織のものか検証
  const { data: coupon } = await database
    .from('customer_coupons')
    .select('id, organization_id')
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (!coupon) return res.status(200).json([])

  const { data, error } = await database
    .from('coupon_usages')
    .select(`
      id,
      reservation_id,
      discount_amount,
      used_at,
      reservations:reservation_id (title)
    `)
    .eq('customer_coupon_id', customerCouponId)
    .order('used_at', { ascending: false })

  if (error) {
    console.error('[coupons:admin-usages] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = ((data as any[]) ?? []).map((row: any) => ({
    id: row.id,
    reservation_id: row.reservation_id,
    discount_amount: row.discount_amount,
    used_at: row.used_at,
    reservation_title: row.reservations?.title ?? null,
  }))

  return res.status(200).json(mapped)
}

// =========================================
// 管理者向け: キャンペーンに紐づくクーポン一覧（顧客情報付き）
// =========================================
async function handleCampaignCoupons(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const campaignId = req.query.campaign_id as string | undefined
  if (!campaignId) {
    return res.status(400).json({ error: 'campaign_id クエリパラメータが必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // キャンペーンが自組織のものか検証
  const { data: campaign } = await database
    .from('coupon_campaigns')
    .select('id, organization_id')
    .eq('id', campaignId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (!campaign) return res.status(200).json([])

  // 全件取得（1000 行上限を range ページングで回避）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { rows: data, error } = await fetchAllRows<any>(() =>
    database
      .from('customer_coupons')
      .select(CUSTOMER_COUPON_WITH_CUSTOMER_FIELDS)
      .eq('campaign_id', campaignId)
      .eq('organization_id', user.orgId)
      // 一括付与で created_at が同時刻の行が多く、ページ間の重複/欠落を防ぐため id をタイブレーカーにする
      .order('created_at', { ascending: false })
      .order('id'),
  )

  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any
    console.error('[coupons:campaign-coupons] DB error:', err)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: err?.message })
  }

  return res.status(200).json(data ?? [])
}

// =========================================
// 管理者向け: 顧客検索
// =========================================
async function handleSearchCustomers(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const q = (req.query.q as string | undefined) ?? ''
  const trimmed = q.trim()
  if (!trimmed) return res.status(200).json([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  // ilike へ渡す値はサニタイズ（% _ \ をエスケープ）して任意検索による意図せぬマッチを防ぐ
  const escaped = trimmed.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const searchTerm = `%${escaped}%`

  // 自組織の customer + platform customer (organization_id IS NULL) を検索対象に
  // PR #251 以降 platform customer は org=NULL に統一されているため、
  // org_id 縛りだと MMQ 横断のユーザーがヒットしなくなる (Issue #252)
  const { data, error } = await database
    .from('customers')
    .select('id, name, email, phone, organization_id')
    .or(`organization_id.eq.${user.orgId},organization_id.is.null`)
    .or(`name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`)
    .limit(20)

  if (error) {
    console.error('[coupons:search-customers] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapped = ((data as any[]) ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
  }))

  return res.status(200).json(mapped)
}

// =========================================
// 管理者向け: 指定顧客の保有クーポン一覧
// =========================================
async function handleCustomerCoupons(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const customerId = req.query.customer_id as string | undefined
  if (!customerId) {
    return res.status(400).json({ error: 'customer_id クエリパラメータが必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  // 自組織が配布したクーポンのみ（grant 時に organization_id = orgId が入る）
  const { data, error } = await database
    .from('customer_coupons')
    .select(CUSTOMER_COUPON_FIELDS)
    .eq('customer_id', customerId)
    .eq('organization_id', user.orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[coupons:customer-coupons] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  return res.status(200).json(data ?? [])
}

// =========================================
// 管理者向け: 未使用クーポンを取消（誤付与の取り消し）
// 使用履歴があるクーポンは取消不可（その場合は restore-usage で使用を戻すこと）
// =========================================
async function handleRevokeCoupon(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const customerCouponId = req.query.customer_coupon_id as string | undefined
  if (!customerCouponId) {
    return res.status(400).json({ success: false, error: 'customer_coupon_id が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 自組織のクーポンか検証
  const { data: coupon, error: couponError } = await database
    .from('customer_coupons')
    .select('id, organization_id')
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (couponError) {
    console.error('[coupons:revoke-coupon] fetch error:', couponError)
    return res.status(500).json({ success: false, error: couponError.message })
  }
  if (!coupon) {
    return res.status(404).json({ success: false, error: 'クーポンが見つかりません' })
  }

  // 使用履歴があれば取消不可（使用を戻したい場合は restore-usage）
  const { count: usageCount, error: usageError } = await database
    .from('coupon_usages')
    .select('id', { count: 'exact', head: true })
    .eq('customer_coupon_id', customerCouponId)

  if (usageError) {
    console.error('[coupons:revoke-coupon] usage check error:', usageError)
    return res.status(500).json({ success: false, error: usageError.message })
  }
  if ((usageCount ?? 0) > 0) {
    return res.status(409).json({ success: false, error: '使用履歴があるため取消できません（使用を戻す場合は「使用取消」を使ってください）' })
  }

  const { error: deleteError } = await database
    .from('customer_coupons')
    .delete()
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)

  if (deleteError) {
    console.error('[coupons:revoke-coupon] delete error:', deleteError)
    return res.status(500).json({ success: false, error: '取消に失敗しました' })
  }

  return res.status(200).json({ success: true })
}

// =========================================
// 管理者向け: 保有クーポンの残使用回数を調整
// 店舗で利用失敗した等で残回数がズレた場合にスタッフが直す。
// =========================================
async function handleAdjustCouponUses(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { customer_coupon_id?: string; uses_remaining?: number }
  const customerCouponId = body.customer_coupon_id
  const usesRaw = body.uses_remaining
  if (!customerCouponId) {
    return res.status(400).json({ success: false, error: 'customer_coupon_id が必要です' })
  }
  if (typeof usesRaw !== 'number' || !Number.isFinite(usesRaw) || usesRaw < 0) {
    return res.status(400).json({ success: false, error: 'uses_remaining は 0 以上の数値が必要です' })
  }
  const usesRemaining = Math.floor(usesRaw)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 自組織のクーポンか検証
  const { data: coupon, error: couponError } = await database
    .from('customer_coupons')
    .select('id, status, organization_id')
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (couponError) {
    console.error('[coupons:adjust-coupon-uses] fetch error:', couponError)
    return res.status(500).json({ success: false, error: couponError.message })
  }
  if (!coupon) {
    return res.status(404).json({ success: false, error: 'クーポンが見つかりません' })
  }

  // 残回数に応じて status を整える（取消済みは触らない）。0なら fully_used、>0 なら active。
  const nextStatus = coupon.status === 'revoked' ? 'revoked' : (usesRemaining > 0 ? 'active' : 'fully_used')

  const { error: updateError } = await database
    .from('customer_coupons')
    .update({ uses_remaining: usesRemaining, status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)

  if (updateError) {
    console.error('[coupons:adjust-coupon-uses] update error:', updateError)
    return res.status(500).json({ success: false, error: '残回数の更新に失敗しました' })
  }

  return res.status(200).json({ success: true })
}

// =========================================
// 顧客向け: クーポンを使用（もぎる）
// =========================================
async function handleUseCoupon(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { customer_coupon_id?: string; reservation_id?: string | null }
  const customerCouponId = body.customer_coupon_id
  const reservationId = body.reservation_id ?? null

  if (!customerCouponId) {
    return res.status(400).json({ error: 'customer_coupon_id が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  const { data: coupon, error: couponError } = await database
    .from('customer_coupons')
    .select(`
      id,
      customer_id,
      organization_id,
      uses_remaining,
      status,
      expires_at,
      coupon_campaigns (
        discount_type,
        discount_amount,
        min_order_amount,
        allowed_weekdays,
        allowed_time_slots
      )
    `)
    .eq('id', customerCouponId)
    .maybeSingle()

  if (couponError) {
    console.error('[coupons:use] coupon fetch error:', couponError)
    return res.status(500).json({ success: false, error: 'クーポン取得に失敗しました' })
  }
  if (!coupon) {
    return res.status(404).json({ success: false, error: 'クーポンが見つかりません' })
  }

  // 本人検証: customer_id が JWT user_id の顧客 (customers から引いた本人) であることを保証する。
  // platform_customers_phase1 以降ログイン済み顧客の customers.organization_id は NULL
  // なので、coupon.organization_id との一致チェックを行うと platform 顧客は常に
  // owner 検証で 0 行になり「クーポンが見つかりません」と返ってしまう。
  // customers.id は PK で id + user_id だけで本人特定として十分なので org 一致は要求しない。
  const ownerQuery = database
    .from('customers')
    .select('id, organization_id')
    .eq('id', coupon.customer_id)
    .eq('user_id', user.userId)
  const { data: ownerRows } = await ownerQuery.limit(1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer = ((ownerRows as any[]) ?? [])[0]

  if (!customer) {
    return res.status(403).json({ success: false, error: 'クーポンが見つかりません' })
  }

  // 有効性チェック
  if (coupon.status !== 'active') {
    return res.status(400).json({ success: false, error: 'このクーポンは利用できません' })
  }
  if (coupon.uses_remaining <= 0) {
    return res.status(400).json({ success: false, error: 'このクーポンは使い切りました' })
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return res.status(400).json({ success: false, error: 'このクーポンは有効期限が切れています' })
  }

  // タイトル（シナリオ）に既にクーポン使用済みかチェック
  if (reservationId) {
    // 対象予約が自組織のものか軽く検証（NULL の場合は何もしない）
    const { data: selectedReservation } = await database
      .from('reservations')
      .select('schedule_event_id, organization_id')
      .eq('id', reservationId)
      .maybeSingle()

    if (selectedReservation?.organization_id && coupon.organization_id && selectedReservation.organization_id !== coupon.organization_id) {
      return res.status(400).json({ success: false, error: '予約と組織が一致しません' })
    }

    if (selectedReservation?.schedule_event_id) {
      const { data: selectedEvent } = await database
        .from('schedule_events')
        .select('scenario_master_id, scenario, organization_id')
        .eq('id', selectedReservation.schedule_event_id)
        .maybeSingle()

      if (selectedEvent && (selectedEvent.scenario_master_id || selectedEvent.scenario)) {
        const { data: myCoupons } = await database
          .from('customer_coupons')
          .select('id')
          .eq('customer_id', customer.id)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const myCouponIds = ((myCoupons as any[]) ?? []).map((c: any) => c.id)
        if (myCouponIds.length > 0) {
          const { data: usages } = await database
            .from('coupon_usages')
            .select('reservation_id')
            .in('customer_coupon_id', myCouponIds)
            .not('reservation_id', 'is', null)

          const usedReservationIds: string[] = [
            ...new Set(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((usages as any[]) ?? []).map((u: any) => u.reservation_id).filter((x: unknown) => typeof x === 'string'),
            ),
          ] as string[]
          if (usedReservationIds.length > 0) {
            const { data: usedReservations } = await database
              .from('reservations')
              .select('schedule_event_id')
              .in('id', usedReservationIds)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const usedEventIds = ((usedReservations as any[]) ?? [])
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((r: any) => r.schedule_event_id)
              .filter((x: unknown): x is string => typeof x === 'string')

            if (usedEventIds.length > 0) {
              let sameScenarioQuery = database
                .from('schedule_events')
                .select('id')
                .in('id', usedEventIds)
              if (selectedEvent.scenario_master_id) {
                sameScenarioQuery = sameScenarioQuery.eq('scenario_master_id', selectedEvent.scenario_master_id)
              } else if (selectedEvent.scenario) {
                sameScenarioQuery = sameScenarioQuery.eq('scenario', selectedEvent.scenario)
              }
              const { data: sameScenarioEvents } = await sameScenarioQuery
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if (((sameScenarioEvents as any[]) ?? []).length > 0) {
                return res.status(400).json({ success: false, error: 'このタイトルには既にクーポンをご利用済みです' })
              }
            }
          }
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaign = coupon.coupon_campaigns as any
  const campaignObj = Array.isArray(campaign) ? campaign[0] : campaign
  const discountAmount = campaignObj?.discount_amount ?? 0

  // 利用条件チェック: 最低利用金額・利用可能曜日・時間帯
  if (reservationId && campaignObj) {
    const minOrder: number | null = campaignObj.min_order_amount ?? null
    const allowedWeekdays: number[] | null = campaignObj.allowed_weekdays ?? null
    const allowedTimeSlots: string[] | null = campaignObj.allowed_time_slots ?? null

    if (minOrder != null || allowedWeekdays || allowedTimeSlots) {
      const { data: r } = await database
        .from('reservations')
        .select('total_amount, schedule_event_id')
        .eq('id', reservationId)
        .maybeSingle()
      if (r) {
        if (minOrder != null && (r.total_amount ?? 0) < minOrder) {
          return res.status(400).json({ success: false, error: `このクーポンは ¥${minOrder.toLocaleString()} 以上の予約で利用できます` })
        }
        if (r.schedule_event_id && (allowedWeekdays || allowedTimeSlots)) {
          const { data: ev } = await database
            .from('schedule_events')
            .select('date, time_slot')
            .eq('id', r.schedule_event_id)
            .maybeSingle()
          if (ev) {
            if (allowedWeekdays && allowedWeekdays.length > 0 && ev.date) {
              // ev.date は 'YYYY-MM-DD' 形式 — 日本ローカルの曜日として扱う
              const [y, m, d] = ev.date.split('-').map(Number)
              const dt = new Date(Date.UTC(y, m - 1, d))
              const wd = dt.getUTCDay()
              if (!allowedWeekdays.includes(wd)) {
                return res.status(400).json({ success: false, error: 'このクーポンはご利用可能な曜日ではありません' })
              }
            }
            if (allowedTimeSlots && allowedTimeSlots.length > 0 && ev.time_slot) {
              if (!allowedTimeSlots.includes(ev.time_slot)) {
                return res.status(400).json({ success: false, error: 'このクーポンはご利用可能な時間帯ではありません' })
              }
            }
          }
        }
      }
    }
  }

  // coupon_usages に記録（DB トリガーが uses_remaining と status を更新）
  const usageData: Record<string, unknown> = {
    customer_coupon_id: customerCouponId,
    discount_amount: discountAmount,
    used_at: new Date().toISOString(),
  }
  if (reservationId) usageData.reservation_id = reservationId

  const { error: usageError } = await database
    .from('coupon_usages')
    .insert(usageData)

  if (usageError) {
    console.error('[coupons:use] usage insert error:', usageError)
    if (usageError.code === '23503' && reservationId) {
      const { error: retryError } = await database
        .from('coupon_usages')
        .insert({
          customer_coupon_id: customerCouponId,
          discount_amount: discountAmount,
          used_at: new Date().toISOString(),
        })
      if (retryError) {
        console.error('[coupons:use] retry error:', retryError)
        return res.status(500).json({ success: false, error: 'クーポン使用の記録に失敗しました' })
      }
    } else {
      return res.status(500).json({ success: false, error: 'クーポン使用の記録に失敗しました' })
    }
  }

  return res.status(200).json({ success: true })
}

/**
 * 付与通知メールを fire-and-forget で送信する。
 * 失敗してもクーポン付与処理はブロックしない。
 * Edge Function 側でフラグチェックするので、ここでは notify_on_grant=true のみ呼び出す。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fireCouponGrantedEmail(database: any, customerCouponId: string): void {
  database.functions
    .invoke('send-coupon-granted', { body: { customerCouponId } })
    .then((r: { error?: unknown }) => {
      if (r?.error) {
        console.warn('[coupons:notify] send-coupon-granted error (non-blocking):', r.error)
      }
    })
    .catch((err: unknown) => {
      console.warn('[coupons:notify] send-coupon-granted exception (non-blocking):', err)
    })
}

// =========================================
// 顧客向け: 新規登録クーポンを付与
// =========================================
async function handleGrantRegistrationCoupon(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { customer_id?: string }
  const customerId = body.customer_id
  if (!customerId) {
    return res.status(400).json({ error: 'customer_id が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 本人検証: customer_id が JWT user_id ⇒ 自組織の customers のものであること
  const { data: customer } = await database
    .from('customers')
    .select('id, organization_id, user_id')
    .eq('id', customerId)
    .eq('user_id', user.userId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (!customer) {
    return res.status(403).json({ error: '対象の顧客にクーポンを付与する権限がありません' })
  }

  // 対象キャンペーン取得（JWT 由来の org のみ）
  const { data: campaigns, error: campaignError } = await database
    .from('coupon_campaigns')
    .select(COUPON_CAMPAIGN_FIELDS)
    .eq('trigger_type', 'registration')
    .eq('is_active', true)
    .eq('organization_id', user.orgId)
    .or('valid_from.is.null,valid_from.lte.now()')
    .or('valid_until.is.null,valid_until.gte.now()')

  if (campaignError || !campaigns || campaigns.length === 0) {
    return res.status(200).json({ granted: 0, skipped: true, reason: '対象キャンペーンなし' })
  }

  let grantedCount = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const campaign of campaigns as any[]) {
    // 1人あたり配布上限チェック（NULL = 無制限）
    if (campaign.max_grants_per_customer != null) {
      const { count: customerGrantCount } = await database
        .from('customer_coupons')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('customer_id', customerId)
      if ((customerGrantCount ?? 0) >= campaign.max_grants_per_customer) {
        continue // この顧客は既に上限到達、次のキャンペーンへ
      }
    }

    // 全体配布上限チェック（NULL = 無制限）
    if (campaign.max_total_grants != null) {
      const { count: totalGrantCount } = await database
        .from('customer_coupons')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
      if ((totalGrantCount ?? 0) >= campaign.max_total_grants) {
        continue
      }
    }

    let expiresAt: string | null = null
    if (campaign.usage_valid_until) {
      expiresAt = new Date(campaign.usage_valid_until).toISOString()
    } else if (campaign.coupon_expiry_days) {
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + campaign.coupon_expiry_days)
      expiresAt = expiry.toISOString()
    }

    const { data: newCC, error: insertError } = await database
      .from('customer_coupons')
      .insert({
        campaign_id: campaign.id,
        customer_id: customerId,
        organization_id: campaign.organization_id,
        uses_remaining: campaign.max_uses_per_customer,
        expires_at: expiresAt,
        status: 'active',
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[coupons:grant-registration] insert error:', insertError)
    } else {
      grantedCount++
      if (campaign.notify_on_grant && newCC?.id) {
        fireCouponGrantedEmail(database, newCC.id)
      }
    }
  }

  return res.status(200).json({ granted: grantedCount, skipped: grantedCount === 0 })
}

// =========================================
// 管理者向け: キャンペーン作成
// =========================================
async function handleCreateCampaign(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as Record<string, unknown>
  // クライアントから organization_id を受け付けない（JWT 由来のみ）
  const { organization_id: _ignoredOrgId, id: _ignoredId, created_at: _ignoredCreated, updated_at: _ignoredUpdated, ...formData } = body
  void _ignoredOrgId; void _ignoredId; void _ignoredCreated; void _ignoredUpdated

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('coupon_campaigns')
    .insert({ ...formData, organization_id: user.orgId })
    .select('id')
    .single()

  if (error) {
    console.error('[coupons:create-campaign] DB error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
  return res.status(200).json({ success: true, id: data.id })
}

// =========================================
// 管理者向け: キャンペーン更新
// =========================================
async function handleUpdateCampaign(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) {
    return res.status(400).json({ success: false, error: 'id クエリパラメータが必要です' })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  // クライアントから organization_id / id を受け付けない（自組織にバインド）
  const { organization_id: _ignoredOrgId, id: _ignoredId, created_at: _ignoredCreated, updated_at: _ignoredUpdated, ...formData } = body
  void _ignoredOrgId; void _ignoredId; void _ignoredCreated; void _ignoredUpdated

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const { data, error } = await database
    .from('coupon_campaigns')
    .update(formData)
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .select('id')

  if (error) {
    console.error('[coupons:update-campaign] DB error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
  if (!data || data.length === 0) {
    return res.status(404).json({ success: false, error: 'キャンペーンが見つかりません（権限不足の可能性）' })
  }
  return res.status(200).json({ success: true })
}

// =========================================
// 管理者向け: キャンペーンの有効/無効を切り替え
// =========================================
async function handleToggleCampaignActive(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) {
    return res.status(400).json({ success: false, error: 'id クエリパラメータが必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  const { data: campaign, error: fetchError } = await database
    .from('coupon_campaigns')
    .select('is_active')
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (fetchError) {
    console.error('[coupons:toggle-campaign-active] fetch error:', fetchError)
    return res.status(500).json({ success: false, error: fetchError.message })
  }
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'キャンペーンが見つかりません' })
  }

  const newStatus = !campaign.is_active
  const { error: updateError } = await database
    .from('coupon_campaigns')
    .update({ is_active: newStatus })
    .eq('id', id)
    .eq('organization_id', user.orgId)

  if (updateError) {
    console.error('[coupons:toggle-campaign-active] update error:', updateError)
    return res.status(500).json({ success: false, error: updateError.message })
  }

  return res.status(200).json({ success: true, isActive: newStatus })
}

// =========================================
// 管理者向け: 顧客にクーポンを手動付与
// =========================================
async function handleGrantCouponToCustomer(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { campaign_id?: string; customer_id?: string; uses?: number }
  const campaignId = body.campaign_id
  const customerId = body.customer_id
  if (!campaignId || !customerId) {
    return res.status(400).json({ success: false, error: 'campaign_id と customer_id が必要です' })
  }
  // 付与時に使用回数を指定可能（未指定 or 不正なら campaign.max_uses_per_customer を使う）
  const usesRaw = body.uses
  const usesOverride = typeof usesRaw === 'number' && Number.isFinite(usesRaw) && usesRaw >= 1
    ? Math.floor(usesRaw)
    : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // キャンペーンが自組織のものか
  const { data: campaign, error: campaignError } = await database
    .from('coupon_campaigns')
    .select(COUPON_CAMPAIGN_FIELDS)
    .eq('id', campaignId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (campaignError) {
    console.error('[coupons:grant-to-customer] campaign fetch error:', campaignError)
    return res.status(500).json({ success: false, error: campaignError.message })
  }
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'キャンペーンが見つかりません' })
  }

  // 顧客が自組織 または platform 顧客(organization_id IS NULL) か。
  // platform_customers_phase1 以降、ログイン顧客の customers 行は org=NULL に統一されているため、
  // org 縛りだと付与できない（searchCustomers と同じく org=NULL も対象に含める）。
  // クーポン自体は organization_id = user.orgId で作られるので、配布元組織は正しく記録される。
  const { data: customer, error: customerError } = await database
    .from('customers')
    .select('id, organization_id')
    .eq('id', customerId)
    .or(`organization_id.eq.${user.orgId},organization_id.is.null`)
    .maybeSingle()

  if (customerError) {
    console.error('[coupons:grant-to-customer] customer fetch error:', customerError)
    return res.status(500).json({ success: false, error: customerError.message })
  }
  if (!customer) {
    return res.status(404).json({ success: false, error: '顧客が見つかりません' })
  }

  // 1人あたり配布上限チェック（NULL = 無制限）
  if (campaign.max_grants_per_customer != null) {
    const { count: customerGrantCount } = await database
      .from('customer_coupons')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('customer_id', customerId)
    if ((customerGrantCount ?? 0) >= campaign.max_grants_per_customer) {
      return res.status(409).json({ success: false, error: `この顧客への配布上限 (${campaign.max_grants_per_customer}) に達しています` })
    }
  }

  // 全体配布数上限チェック（NULL = 無制限）
  if (campaign.max_total_grants != null) {
    const { count: grantedCount } = await database
      .from('customer_coupons')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
    if ((grantedCount ?? 0) >= campaign.max_total_grants) {
      return res.status(400).json({ success: false, error: `配布数の上限 (${campaign.max_total_grants}) に達しています` })
    }
  }

  // expires_at の決定: 絶対 usage_valid_until が優先、なければ相対 coupon_expiry_days
  let expiresAt: string | null = null
  if (campaign.usage_valid_until) {
    expiresAt = new Date(campaign.usage_valid_until).toISOString()
  } else if (campaign.coupon_expiry_days) {
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + campaign.coupon_expiry_days)
    expiresAt = expiry.toISOString()
  }

  const { data, error } = await database
    .from('customer_coupons')
    .insert({
      campaign_id: campaignId,
      customer_id: customerId,
      organization_id: user.orgId,
      uses_remaining: usesOverride ?? campaign.max_uses_per_customer,
      expires_at: expiresAt,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[coupons:grant-to-customer] insert error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }

  if (campaign.notify_on_grant) {
    fireCouponGrantedEmail(database, data.id)
  }

  return res.status(200).json({ success: true, couponId: data.id })
}

// =========================================
// 顧客向け: コード入力でクーポンを取得（コード制キャンペーン）
// =========================================
async function handleRedeemCouponByCode(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const body = (req.body ?? {}) as { code?: string }
  const code = (body.code ?? '').trim()
  if (!code) {
    return res.status(400).json({ success: false, error: 'コードを入力してください' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // コードに一致する有効キャンペーン（user.orgId で絞らない: コード自体が組織横断のキーになりうる）
  // ただし配布期間内・有効でなければならない
  const now = new Date().toISOString()
  const { data: campaign, error: campaignError } = await database
    .from('coupon_campaigns')
    .select(COUPON_CAMPAIGN_FIELDS)
    .eq('coupon_code', code)
    .eq('is_active', true)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)
    .limit(1)
    .maybeSingle()

  if (campaignError) {
    console.error('[coupons:redeem-code] campaign fetch error:', campaignError)
    return res.status(500).json({ success: false, error: 'コードの照合に失敗しました' })
  }
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'コードが無効か、配布期間外です' })
  }

  // 全体配布数上限チェック（NULL = 無制限）
  if (campaign.max_total_grants != null) {
    const { count: grantedCount } = await database
      .from('customer_coupons')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
    if ((grantedCount ?? 0) >= campaign.max_total_grants) {
      return res.status(400).json({ success: false, error: '配布数の上限に達しています' })
    }
  }

  // ログインユーザーの customer 行（自分自身のみ）
  const { data: customer } = await database
    .from('customers')
    .select('id')
    .eq('user_id', user.userId)
    .limit(1)
    .maybeSingle()
  if (!customer) {
    return res.status(404).json({ success: false, error: '顧客情報が見つかりません' })
  }

  // 1人あたり配布上限チェック（NULL = 無制限、customer.id 確定後に実施）
  if (campaign.max_grants_per_customer != null) {
    const { count: customerGrantCount } = await database
      .from('customer_coupons')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('customer_id', customer.id)
    if ((customerGrantCount ?? 0) >= campaign.max_grants_per_customer) {
      return res.status(409).json({ success: false, error: 'このクーポンの取得上限に達しています' })
    }
  }

  // expires_at 決定
  let expiresAt: string | null = null
  if (campaign.usage_valid_until) {
    expiresAt = new Date(campaign.usage_valid_until).toISOString()
  } else if (campaign.coupon_expiry_days) {
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + campaign.coupon_expiry_days)
    expiresAt = expiry.toISOString()
  }

  const { data, error } = await database
    .from('customer_coupons')
    .insert({
      campaign_id: campaign.id,
      customer_id: customer.id,
      organization_id: campaign.organization_id,
      uses_remaining: campaign.max_uses_per_customer,
      expires_at: expiresAt,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[coupons:redeem-code] insert error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }

  if (campaign.notify_on_grant) {
    fireCouponGrantedEmail(database, data.id)
  }

  return res.status(200).json({ success: true, couponId: data.id, campaignName: campaign.name })
}

// =========================================
// 管理者向け: クーポン使用を取り消して残数を復元
// =========================================
async function handleRestoreCouponUsage(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const couponUsageId = req.query.usage_id as string | undefined
  const customerCouponId = req.query.customer_coupon_id as string | undefined
  if (!couponUsageId || !customerCouponId) {
    return res.status(400).json({ success: false, error: 'usage_id と customer_coupon_id が必要です' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any

  // 顧客クーポンが自組織のもので、かつ usage がこのクーポンに属しているか検証
  const { data: coupon, error: couponError } = await database
    .from('customer_coupons')
    .select('id, uses_remaining, status, organization_id')
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)
    .maybeSingle()

  if (couponError) {
    console.error('[coupons:restore-usage] coupon fetch error:', couponError)
    return res.status(500).json({ success: false, error: couponError.message })
  }
  if (!coupon) {
    return res.status(404).json({ success: false, error: 'クーポンが見つかりません' })
  }

  // 使用記録の所属チェック（customer_coupon_id を必ず合わせる）
  const { data: usage } = await database
    .from('coupon_usages')
    .select('id, customer_coupon_id')
    .eq('id', couponUsageId)
    .eq('customer_coupon_id', customerCouponId)
    .maybeSingle()

  if (!usage) {
    return res.status(404).json({ success: false, error: '使用履歴が見つかりません' })
  }

  const { error: deleteError } = await database
    .from('coupon_usages')
    .delete()
    .eq('id', couponUsageId)
    .eq('customer_coupon_id', customerCouponId)

  if (deleteError) {
    console.error('[coupons:restore-usage] delete error:', deleteError)
    return res.status(500).json({ success: false, error: '使用記録の削除に失敗しました' })
  }

  const { error: updateError } = await database
    .from('customer_coupons')
    .update({
      uses_remaining: coupon.uses_remaining + 1,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerCouponId)
    .eq('organization_id', user.orgId)

  if (updateError) {
    console.error('[coupons:restore-usage] update error:', updateError)
    return res.status(500).json({ success: false, error: '残数の復元に失敗しました' })
  }

  return res.status(200).json({ success: true })
}

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db, getMissingEnvError } from './_lib/db.js'
import { requireAuth, ApiError } from './_lib/auth.js'

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

// JWT user.id から customer 行を1件取得（重複行があっても order + limit(1) で安全）
async function findCustomerByUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
  userId: string,
  organizationId: string | null,
  selectFields = 'id'
): Promise<Record<string, unknown> | null> {
  let query = database.from('customers').select(selectFields).eq('user_id', userId)
  if (organizationId) {
    query = query.eq('organization_id', organizationId)
  }
  const { data } = await query.order('created_at', { ascending: true }).limit(1)
  return (data?.[0] as Record<string, unknown>) ?? null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const envError = getMissingEnvError()
  if (envError || !db) return res.status(500).json({ error: `環境変数が未設定です: ${envError}` })

  try {
    const user = await requireAuth(req)

    const type = (req.query.type as string | undefined) ?? 'available'
    const requestedOrgId = req.query.organization_id as string | undefined

    if (type === 'available') {
      return await handleAvailable(req, res, user.userId, requestedOrgId ?? user.orgId)
    }
    if (type === 'all') {
      return await handleAll(req, res, user.userId, user.orgId)
    }
    if (type === 'usages') {
      return await handleUsages(req, res, user.userId, user.orgId)
    }

    return res.status(400).json({ error: `unknown type: ${type}` })
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message })
    console.error('[coupons] unexpected error:', err)
    return res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
}

// 利用可能クーポン: status='active' かつ uses_remaining > 0 かつ有効期限内
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

  const { data, error } = await database
    .from('customer_coupons')
    .select(CUSTOMER_COUPON_FIELDS)
    .eq('customer_id', customer.id)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .gt('uses_remaining', 0)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[coupons:available] DB error:', error)
    return res.status(500).json({ error: 'データ取得に失敗しました', detail: error.message })
  }

  // 有効期限フィルタはサーバ側でも行う（フロントの now と齟齬が出ないように）
  const now = new Date()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtered = ((data as any[]) ?? []).filter((coupon: any) => {
    if (coupon.expires_at && new Date(coupon.expires_at) < now) return false
    const campaign = coupon.coupon_campaigns
    if (campaign) {
      if (!campaign.is_active) return false
      if (campaign.valid_from && new Date(campaign.valid_from) > now) return false
      if (campaign.valid_until && new Date(campaign.valid_until) < now) return false
    }
    return true
  })

  return res.status(200).json(filtered)
}

// マイページ用クーポン一覧（全ステータス・使用履歴付き・店舗名付き）
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

  // 使用履歴 + 紐づく予約
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

// クーポン使用履歴
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
    // JOIN 失敗のフォールバック（既存実装と同じ挙動）
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

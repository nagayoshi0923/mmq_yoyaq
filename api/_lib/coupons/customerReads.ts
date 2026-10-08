// api/coupons.ts の顧客向けの読み取り（利用可能・一覧・使用履歴）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { CUSTOMER_COUPON_FIELDS, findCustomerByUserId } from './common.js'

// =========================================
// 顧客向け: 利用可能クーポン
// =========================================
/** 顧客の保有クーポン。案内時点の規則（rules_snapshot）をキャンペーンの値に重ねて返す */
type CouponWithRules = Record<string, unknown> & {
  id: string; expires_at: string | null
  coupon_campaigns: Record<string, unknown> | null
  rules_snapshot: { usage_valid_from?: string | null; usage_valid_until?: string | null } & Record<string, unknown> | null
}
type UsageStore = { name: string; short_name: string | null }
type UsageReservation = { id: string; title: string | null; requested_datetime: string | null; store_id: string | null; stores?: UsageStore | UsageStore[] | null }
type CouponUsageRow = {
  id: string; customer_coupon_id: string; reservation_id: string | null; used_at: string | null; discount_amount: number | null
  reservations: UsageReservation | UsageReservation[] | null
}

export async function handleAvailable(
  _req: VercelRequest,
  res: VercelResponse,
  userId: string,
  organizationId: string
) {
  const database = db!
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
  const filtered = ((data ?? []) as unknown as CouponWithRules[]).map(coupon => ({
    ...coupon, coupon_campaigns: { ...coupon.coupon_campaigns, ...coupon.rules_snapshot },
  })).filter(coupon => {
    if (coupon.expires_at && new Date(coupon.expires_at) < now) return false
    const rules = coupon.rules_snapshot
    if (rules?.usage_valid_from && new Date(rules.usage_valid_from) > now) return false
    if (rules?.usage_valid_until && new Date(rules.usage_valid_until) < now) return false
    return true
  })

  return res.status(200).json(filtered)
}

// =========================================
// 顧客向け: マイページ用クーポン一覧
// =========================================
export async function handleAll(
  _req: VercelRequest,
  res: VercelResponse,
  userId: string,
  organizationId: string
) {
  const database = db!
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

  const rows = (couponRows ?? []) as unknown as CouponWithRules[]
  const couponIds = rows.map(c => c.id)
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
        store_id,
        stores ( name, short_name )
      )
    `)
    .in('customer_coupon_id', couponIds)
    .order('used_at', { ascending: false })

  if (usageError) {
    console.warn('[coupons:all] usages fetch failed:', usageError)
    return res.status(200).json(rows.map(c => ({ ...c, coupon_campaigns: { ...c.coupon_campaigns, ...c.rules_snapshot }, coupon_usages: [] })))
  }

  // 店舗名は使用履歴と同じ問い合わせで読む（店舗だけを後から読み直す往復をなくす）
  const usages = (usageRows ?? []) as unknown as CouponUsageRow[]

  const byCoupon: Record<string, unknown[]> = {}
  for (const u of usages) {
    const resRaw = u.reservations
    const r = Array.isArray(resRaw) ? resRaw[0] : resRaw
    const storeRaw = r?.stores
    const storeInfo = Array.isArray(storeRaw) ? storeRaw[0] : storeRaw
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

  const result = rows.map(c => ({ ...c, coupon_campaigns: { ...c.coupon_campaigns, ...c.rules_snapshot }, coupon_usages: byCoupon[c.id] ?? [] }))
  return res.status(200).json(result)
}

// =========================================
// 顧客向け: クーポン使用履歴
// =========================================
export async function handleUsages(
  _req: VercelRequest,
  res: VercelResponse,
  userId: string,
  organizationId: string
) {
  const database = db!
  const customer = await findCustomerByUserId(database, userId, organizationId)
  if (!customer) return res.status(200).json([])

  const { data: coupons } = await database
    .from('customer_coupons')
    .select('id')
    .eq('customer_id', customer.id)

  const couponIds = (coupons ?? []).map(c => c.id)
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

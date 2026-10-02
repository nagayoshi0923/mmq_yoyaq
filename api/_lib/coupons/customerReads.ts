// api/coupons.ts の顧客向けの読み取り（利用可能・一覧・使用履歴）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { CUSTOMER_COUPON_FIELDS, findCustomerByUserId } from './common.js'

// =========================================
// 顧客向け: 利用可能クーポン
// =========================================
export async function handleAvailable(
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
  const filtered = ((data as any[]) ?? []).map((coupon: any) => ({
    ...coupon, coupon_campaigns: { ...coupon.coupon_campaigns, ...coupon.rules_snapshot },
  })).filter((coupon: any) => {
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
    return res.status(200).json(rows.map((c: any) => ({ ...c, coupon_campaigns: { ...c.coupon_campaigns, ...c.rules_snapshot }, coupon_usages: [] })))
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
  const result = rows.map((c: any) => ({ ...c, coupon_campaigns: { ...c.coupon_campaigns, ...c.rules_snapshot }, coupon_usages: byCoupon[c.id] ?? [] }))
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

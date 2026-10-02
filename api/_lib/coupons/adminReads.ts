// api/coupons.ts の管理者向けの読み取り（キャンペーン一覧・統計・使用履歴・顧客検索ほか）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { COUPON_CAMPAIGN_FIELDS, CUSTOMER_COUPON_FIELDS, CUSTOMER_COUPON_WITH_CUSTOMER_FIELDS, USAGE_CHUNK_SIZE, chunk, fetchAllRows } from './common.js'

// =========================================
// 管理者向け: キャンペーン一覧
// =========================================
export async function handleCampaigns(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
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
export async function handleCampaignStats(req: VercelRequest, res: VercelResponse, user: AuthUser) {
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
export async function handleCustomerUsages(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const customerId = req.query.customer_id
  if (typeof customerId !== 'string' || !customerId.trim()) {
    return res.status(400).json({ error: 'customer_id クエリパラメータが必要です' })
  }
  // 集計RPCと同じく、発行・キャンペーン・予約の所属をすべて確認する。
  const { rows, error } = await fetchAllRows<{
    id: string; discount_amount: number; used_at: string | null;
    reservations: { id: string; title: string; requested_datetime: string | null }
  }>(() => db!.from('coupon_usages').select(`
    id, discount_amount, used_at,
    reservations:reservation_id!inner(id, title, requested_datetime),
    customer_coupons!inner(customer_id, organization_id, coupon_campaigns!inner(organization_id))
  `)
    .eq('customer_coupons.customer_id', customerId)
    .eq('customer_coupons.organization_id', user.orgId)
    .eq('customer_coupons.coupon_campaigns.organization_id', user.orgId)
    .eq('reservations.organization_id', user.orgId)
    .order('used_at', { ascending: false })
    .order('id', { ascending: true }))
  if (error) return res.status(500).json({ error: 'クーポン使用履歴を取得できませんでした' })
  return res.status(200).json(rows.map(row => ({
    id: row.id, discount_amount: row.discount_amount, used_at: row.used_at,
    reservation: row.reservations,
  })))
}

export async function handleAdminUsages(req: VercelRequest, res: VercelResponse, user: AuthUser) {
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
export async function handleCampaignCoupons(req: VercelRequest, res: VercelResponse, user: AuthUser) {
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
export async function handleSearchCustomers(req: VercelRequest, res: VercelResponse, user: AuthUser) {
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
export async function handleCustomerCoupons(req: VercelRequest, res: VercelResponse, user: AuthUser) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.status(200).json((data ?? []).map((coupon: any) => ({
    ...coupon, coupon_campaigns: { ...coupon.coupon_campaigns, ...coupon.rules_snapshot },
  })))
}

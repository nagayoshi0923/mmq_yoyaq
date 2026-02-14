/**
 * クーポン関連のAPI
 *
 * - 利用可能クーポンの取得
 * - クーポン使用履歴の取得
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import type { CustomerCoupon, CouponUsage } from '@/types'

/**
 * ログインユーザーの利用可能クーポン一覧を取得
 * - status = 'active'
 * - uses_remaining > 0
 * - 有効期限内（expires_at が NULL or 未来）
 * - キャンペーンもアクティブ
 *
 * @param organizationId 対象組織ID（予約先の組織でフィルタ）
 */
export async function getAvailableCoupons(
  organizationId?: string
): Promise<CustomerCoupon[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // 顧客IDを取得
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!customer) return []

  let query = supabase
    .from('customer_coupons')
    .select(`
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
    `)
    .eq('customer_id', customer.id)
    .eq('status', 'active')
    .gt('uses_remaining', 0)

  // 組織でフィルタ（予約先組織のクーポンのみ表示）
  if (organizationId) {
    query = query.eq('organization_id', organizationId)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    logger.error('利用可能クーポン取得エラー:', error)
    return []
  }

  // 有効期限チェック（クライアント側でもフィルタ）
  const now = new Date()
  const filtered = (data as unknown as CustomerCoupon[])?.filter(coupon => {
    // クーポン自体の有効期限
    if (coupon.expires_at && new Date(coupon.expires_at) < now) {
      return false
    }
    // キャンペーンの有効期限
    const campaign = coupon.coupon_campaigns
    if (campaign) {
      if (!campaign.is_active) return false
      if (campaign.valid_from && new Date(campaign.valid_from) > now) return false
      if (campaign.valid_until && new Date(campaign.valid_until) < now) return false
    }
    return true
  }) || []

  return filtered
}

/**
 * ログインユーザーのクーポン一覧を取得（全ステータス）
 * マイページ表示用
 */
export async function getAllCoupons(): Promise<CustomerCoupon[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // 顧客IDを取得
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!customer) return []

  const { data, error } = await supabase
    .from('customer_coupons')
    .select(`
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
    `)
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('クーポン一覧取得エラー:', error)
    return []
  }

  return (data as unknown as CustomerCoupon[]) || []
}

/**
 * クーポン使用履歴を取得
 */
export async function getCouponUsageHistory(): Promise<CouponUsage[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // 顧客IDを取得
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!customer) return []

  // まず顧客のクーポンIDを取得
  const { data: coupons } = await supabase
    .from('customer_coupons')
    .select('id')
    .eq('customer_id', customer.id)

  if (!coupons || coupons.length === 0) return []

  const couponIds = coupons.map(c => c.id)

  const { data, error } = await supabase
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
    logger.error('クーポン使用履歴取得エラー:', error)
    // フォールバック: JOINなしで取得
    const { data: usages, error: usageError } = await supabase
      .from('coupon_usages')
      .select(`
        id,
        customer_coupon_id,
        reservation_id,
        discount_amount,
        used_at
      `)
      .in('customer_coupon_id', couponIds)
      .order('used_at', { ascending: false })

    if (usageError) {
      logger.error('クーポン使用履歴取得フォールバックエラー:', usageError)
      return []
    }

    return (usages as unknown as CouponUsage[]) || []
  }

  return (data as unknown as CouponUsage[]) || []
}

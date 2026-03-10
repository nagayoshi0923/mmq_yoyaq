/**
 * クーポン関連のAPI
 *
 * - 利用可能クーポンの取得
 * - クーポン使用履歴の取得
 * - キャンペーン管理（管理者向け）
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import type { CustomerCoupon, CouponUsage, CouponCampaign } from '@/types'

// キャンペーン統計
export interface CampaignStats {
  totalGranted: number
  totalUsed: number
  totalRemaining: number
  totalDiscountAmount: number
}

// キャンペーン作成・更新用データ
export interface CampaignFormData {
  name: string
  description?: string | null
  discount_type: 'fixed' | 'percentage'
  discount_amount: number
  max_uses_per_customer: number
  target_type: 'all' | 'specific_scenarios' | 'specific_organization'
  target_ids?: string[] | null
  trigger_type: 'registration' | 'manual'
  valid_from?: string | null
  valid_until?: string | null
  coupon_expiry_days?: number | null
  is_active: boolean
}

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
 * 新規登録クーポンを付与（電話番号で重複チェック）
 * @param customerId 顧客ID
 * @param phone 電話番号
 * @param organizationId 組織ID
 * @returns 付与されたクーポン数
 */
export async function grantRegistrationCoupon(
  customerId: string,
  phone: string,
  organizationId: string
): Promise<{ granted: number; skipped: boolean; reason?: string }> {
  // 電話番号を正規化（数字のみ）
  const normalizedPhone = phone.replace(/[^0-9]/g, '')
  
  if (!normalizedPhone) {
    logger.log('クーポン付与スキップ: 電話番号が空')
    return { granted: 0, skipped: true, reason: '電話番号が空' }
  }

  // 対象キャンペーンを取得
  const { data: campaigns, error: campaignError } = await supabase
    .from('coupon_campaigns')
    .select('*')
    .eq('trigger_type', 'registration')
    .eq('is_active', true)
    .eq('organization_id', organizationId)
    .or('valid_from.is.null,valid_from.lte.now()')
    .or('valid_until.is.null,valid_until.gte.now()')

  if (campaignError || !campaigns || campaigns.length === 0) {
    logger.log('クーポン付与スキップ: 対象キャンペーンなし')
    return { granted: 0, skipped: true, reason: '対象キャンペーンなし' }
  }

  let grantedCount = 0

  for (const campaign of campaigns) {
    // 同じ電話番号で既にクーポンが付与されていないかチェック
    const { data: existingCoupons } = await supabase
      .from('customer_coupons')
      .select(`
        id,
        customers!inner (
          phone
        )
      `)
      .eq('campaign_id', campaign.id)

    // 電話番号でフィルタ（正規化して比較）
    const hasExisting = existingCoupons?.some((coupon: any) => {
      const existingPhone = coupon.customers?.phone || ''
      const existingNormalized = existingPhone.replace(/[^0-9]/g, '')
      return existingNormalized === normalizedPhone
    })

    if (hasExisting) {
      logger.log(`クーポン付与スキップ: 電話番号 ${normalizedPhone} は既にキャンペーン ${campaign.name} のクーポン所持`)
      continue
    }

    // 有効期限を計算
    let expiresAt: string | null = null
    if (campaign.coupon_expiry_days) {
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + campaign.coupon_expiry_days)
      expiresAt = expiry.toISOString()
    }

    // クーポンを付与
    const { error: insertError } = await supabase
      .from('customer_coupons')
      .insert({
        campaign_id: campaign.id,
        customer_id: customerId,
        organization_id: campaign.organization_id,
        uses_remaining: campaign.max_uses_per_customer,
        expires_at: expiresAt,
        status: 'active'
      })

    if (insertError) {
      // 重複エラーは無視
      if (insertError.code === '23505') {
        logger.log(`クーポン付与スキップ: 既に付与済み (campaign=${campaign.id}, customer=${customerId})`)
      } else {
        logger.error('クーポン付与エラー:', insertError)
      }
    } else {
      grantedCount++
      logger.log(`✅ クーポン付与成功: campaign=${campaign.name}, customer=${customerId}`)
    }
  }

  return { granted: grantedCount, skipped: grantedCount === 0 }
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

// =========================================
// 管理者向けAPI
// =========================================

/**
 * キャンペーン一覧を取得（組織単位）
 */
export async function getCampaigns(): Promise<CouponCampaign[]> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) {
    logger.error('組織IDが取得できません')
    return []
  }

  const { data, error } = await supabase
    .from('coupon_campaigns')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('キャンペーン一覧取得エラー:', error)
    return []
  }

  return (data as CouponCampaign[]) || []
}

/**
 * キャンペーンを作成
 */
export async function createCampaign(
  formData: CampaignFormData
): Promise<{ success: boolean; id?: string; error?: string }> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) {
    return { success: false, error: '組織IDが取得できません' }
  }

  const { data, error } = await supabase
    .from('coupon_campaigns')
    .insert({
      ...formData,
      organization_id: orgId
    })
    .select('id')
    .single()

  if (error) {
    logger.error('キャンペーン作成エラー:', error)
    return { success: false, error: error.message }
  }

  return { success: true, id: data.id }
}

/**
 * キャンペーンを更新
 */
export async function updateCampaign(
  id: string,
  formData: Partial<CampaignFormData>
): Promise<{ success: boolean; error?: string }> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) {
    return { success: false, error: '組織IDが取得できません' }
  }

  const { error } = await supabase
    .from('coupon_campaigns')
    .update(formData)
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) {
    logger.error('キャンペーン更新エラー:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * キャンペーンの有効/無効を切り替え
 */
export async function toggleCampaignActive(
  id: string
): Promise<{ success: boolean; isActive?: boolean; error?: string }> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) {
    return { success: false, error: '組織IDが取得できません' }
  }

  // 現在の状態を取得
  const { data: campaign, error: fetchError } = await supabase
    .from('coupon_campaigns')
    .select('is_active')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (fetchError || !campaign) {
    logger.error('キャンペーン取得エラー:', fetchError)
    return { success: false, error: 'キャンペーンが見つかりません' }
  }

  const newStatus = !campaign.is_active

  const { error } = await supabase
    .from('coupon_campaigns')
    .update({ is_active: newStatus })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) {
    logger.error('キャンペーン状態更新エラー:', error)
    return { success: false, error: error.message }
  }

  return { success: true, isActive: newStatus }
}

/**
 * 顧客にクーポンを手動付与
 */
export async function grantCouponToCustomer(
  campaignId: string,
  customerId: string
): Promise<{ success: boolean; couponId?: string; error?: string }> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) {
    return { success: false, error: '組織IDが取得できません' }
  }

  // キャンペーン情報を取得
  const { data: campaign, error: campaignError } = await supabase
    .from('coupon_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('organization_id', orgId)
    .single()

  if (campaignError || !campaign) {
    logger.error('キャンペーン取得エラー:', campaignError)
    return { success: false, error: 'キャンペーンが見つかりません' }
  }

  if (!campaign.is_active) {
    return { success: false, error: 'このキャンペーンは無効です' }
  }

  // 有効期限を計算
  let expiresAt: string | null = null
  if (campaign.coupon_expiry_days) {
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + campaign.coupon_expiry_days)
    expiresAt = expiry.toISOString()
  }

  // クーポンを付与
  const { data, error } = await supabase
    .from('customer_coupons')
    .insert({
      campaign_id: campaignId,
      customer_id: customerId,
      organization_id: orgId,
      uses_remaining: campaign.max_uses_per_customer,
      expires_at: expiresAt,
      status: 'active'
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'この顧客には既にこのクーポンが付与されています' }
    }
    logger.error('クーポン付与エラー:', error)
    return { success: false, error: error.message }
  }

  return { success: true, couponId: data.id }
}

/**
 * キャンペーンの統計を取得
 */
export async function getCampaignStats(
  campaignId: string
): Promise<CampaignStats | null> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) {
    logger.error('組織IDが取得できません')
    return null
  }

  // 付与されたクーポン数・残り回数を取得
  const { data: coupons, error: couponsError } = await supabase
    .from('customer_coupons')
    .select('id, uses_remaining')
    .eq('campaign_id', campaignId)
    .eq('organization_id', orgId)

  if (couponsError) {
    logger.error('クーポン取得エラー:', couponsError)
    return null
  }

  const couponIds = coupons?.map(c => c.id) || []

  // 使用履歴を取得
  let totalUsed = 0
  let totalDiscountAmount = 0

  if (couponIds.length > 0) {
    const { data: usages, error: usagesError } = await supabase
      .from('coupon_usages')
      .select('discount_amount')
      .in('customer_coupon_id', couponIds)

    if (!usagesError && usages) {
      totalUsed = usages.length
      totalDiscountAmount = usages.reduce((sum, u) => sum + u.discount_amount, 0)
    }
  }

  const totalGranted = coupons?.length || 0
  const totalRemaining = coupons?.reduce((sum, c) => sum + c.uses_remaining, 0) || 0

  return {
    totalGranted,
    totalUsed,
    totalRemaining,
    totalDiscountAmount
  }
}

/**
 * 顧客一覧を検索（クーポン付与用）
 */
export async function searchCustomers(
  query: string
): Promise<Array<{ id: string; name: string; email: string; phone: string | null }>> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) {
    return []
  }

  const searchTerm = `%${query}%`

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, email, phone')
    .eq('organization_id', orgId)
    .or(`name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`)
    .limit(20)

  if (error) {
    logger.error('顧客検索エラー:', error)
    return []
  }

  return data || []
}

/**
 * キャンペーンに紐づくクーポン一覧を取得（顧客情報付き）
 */
export async function getCampaignCoupons(
  campaignId: string
): Promise<Array<CustomerCoupon & { customer?: { name: string; email: string } }>> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) {
    return []
  }

  const { data, error } = await supabase
    .from('customer_coupons')
    .select(`
      *,
      customers (
        name,
        email
      )
    `)
    .eq('campaign_id', campaignId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('キャンペーンクーポン取得エラー:', error)
    return []
  }

  return (data as any) || []
}

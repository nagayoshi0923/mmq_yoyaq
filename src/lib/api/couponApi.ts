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
 * 新規登録クーポンを付与
 * NOTE: 電話番号での重複チェックは廃止（真正性を確認できないため）
 * 重複防止は customer_coupons の UNIQUE 制約 (campaign_id, customer_id) で担保
 * @param customerId 顧客ID
 * @param organizationId 組織ID
 * @returns 付与されたクーポン数
 */
export async function grantRegistrationCoupon(
  customerId: string,
  organizationId: string
): Promise<{ granted: number; skipped: boolean; reason?: string }> {
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
    // 有効期限を計算
    let expiresAt: string | null = null
    if (campaign.coupon_expiry_days) {
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + campaign.coupon_expiry_days)
      expiresAt = expiry.toISOString()
    }

    // クーポンを付与（同一顧客への重複付与は UNIQUE 制約で防止）
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
 * クーポンを使用（もぎる）
 * @param customerCouponId 顧客クーポンID
 * @param reservationId 紐づける予約ID（任意）
 * @returns 使用結果
 */
export async function useCoupon(
  customerCouponId: string,
  reservationId?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'ログインが必要です' }

  // 顧客IDを取得
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!customer) return { success: false, error: '顧客情報が見つかりません' }

  // クーポン情報を取得
  const { data: coupon, error: couponError } = await supabase
    .from('customer_coupons')
    .select(`
      id,
      customer_id,
      uses_remaining,
      status,
      expires_at,
      coupon_campaigns (
        discount_type,
        discount_amount
      )
    `)
    .eq('id', customerCouponId)
    .eq('customer_id', customer.id)
    .single()

  if (couponError || !coupon) {
    logger.error('クーポン取得エラー:', couponError)
    return { success: false, error: 'クーポンが見つかりません' }
  }

  // 有効性チェック
  if (coupon.status !== 'active') {
    return { success: false, error: 'このクーポンは利用できません' }
  }
  if (coupon.uses_remaining <= 0) {
    return { success: false, error: 'このクーポンは使い切りました' }
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { success: false, error: 'このクーポンは有効期限が切れています' }
  }

  const campaign = coupon.coupon_campaigns as any
  const discountAmount = campaign?.discount_amount || 0

  // トランザクション的に処理
  // 1. coupon_usages に記録
  const { error: usageError } = await supabase
    .from('coupon_usages')
    .insert({
      customer_coupon_id: customerCouponId,
      reservation_id: reservationId || null,
      discount_amount: discountAmount,
      used_at: new Date().toISOString()
    })

  if (usageError) {
    logger.error('クーポン使用記録エラー:', usageError)
    return { success: false, error: 'クーポン使用の記録に失敗しました' }
  }

  // 2. uses_remaining をデクリメント & 必要なら status を fully_used に
  const newUsesRemaining = coupon.uses_remaining - 1
  const newStatus = newUsesRemaining <= 0 ? 'fully_used' : 'active'

  const { error: updateError } = await supabase
    .from('customer_coupons')
    .update({
      uses_remaining: newUsesRemaining,
      status: newStatus
    })
    .eq('id', customerCouponId)

  if (updateError) {
    logger.error('クーポン更新エラー:', updateError)
    return { success: false, error: 'クーポンの更新に失敗しました' }
  }

  logger.log('✅ クーポン使用成功:', { customerCouponId, reservationId, discountAmount })
  return { success: true }
}

/**
 * 現在進行中の予約を取得（クーポン使用時の紐付け用）
 * 本日の公演で、開始前〜開始後3時間以内のものを対象
 * 通常予約、貸切公演（参加メンバー含む）、スタッフ予約の全てに対応
 */
export async function getCurrentReservations(): Promise<Array<{
  id: string
  scenario_title: string
  store_name: string
  date: string
  time: string
}>> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // 顧客情報を取得（名前も取得してスタッフ予約のマッチングに使用）
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name')
    .eq('user_id', user.id)
    .maybeSingle()

  // スタッフ情報を取得（スタッフ予約のマッチングに使用）
  const { data: staffRecord } = await supabase
    .from('staff')
    .select('id, name')
    .eq('user_id', user.id)
    .maybeSingle()

  // 顧客もスタッフも見つからない場合は空を返す
  if (!customer && !staffRecord) return []

  // JSTで今日の日付を取得
  const now = new Date()
  const jstOffset = 9 * 60
  const jstNow = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60 * 1000)
  const todayStr = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}-${String(jstNow.getDate()).padStart(2, '0')}`

  // 1. 通常予約を取得（自分がcustomer_idの予約）
  let directReservations: any[] | null = null
  if (customer) {
    const { data } = await supabase
      .from('reservations')
      .select(`
        id,
        schedule_events (
          date,
          start_time,
          scenarios (title),
          stores (name)
        )
      `)
      .eq('customer_id', customer.id)
      .eq('status', 'confirmed')
    directReservations = data
  }

  // 2. 貸切公演の参加メンバーとしての予約を取得
  const { data: privateGroupMembers } = await supabase
    .from('private_group_members')
    .select(`
      id,
      status,
      private_groups (
        id,
        status,
        reservation_id,
        reservations (
          id,
          status,
          schedule_events (
            date,
            start_time,
            scenarios (title),
            stores (name)
          )
        )
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'joined')

  // 3. スタッフ予約を取得（payment_method='staff' または reservation_source='staff_entry'/'staff_participation'）
  // NOTE: スタッフ予約はGM欄から自動作成（staff_entry）または予約者タブから手動追加（staff_participation）される
  //       participant_names にスタッフ名が入るので、それで自分の予約かどうかを判定
  const { data: staffReservations } = await supabase
    .from('reservations')
    .select(`
      id,
      participant_names,
      schedule_events (
        date,
        start_time,
        scenarios (title),
        stores (name)
      )
    `)
    .or('payment_method.eq.staff,reservation_source.eq.staff_entry,reservation_source.eq.staff_participation')
    .eq('status', 'confirmed')

  // 結果をマージ
  const allReservations: Array<{ id: string; event: any }> = []

  // 通常予約
  if (directReservations) {
    for (const r of directReservations) {
      if (r.schedule_events) {
        allReservations.push({ id: r.id, event: r.schedule_events })
      }
    }
  }

  // 貸切公演（参加メンバー）
  if (privateGroupMembers) {
    for (const member of privateGroupMembers) {
      const group = member.private_groups as any
      if (!group || group.status !== 'confirmed') continue
      const reservation = group.reservations as any
      if (!reservation || reservation.status !== 'confirmed') continue
      if (reservation.schedule_events) {
        // 重複チェック（主催者は両方に出る可能性）
        if (!allReservations.some(r => r.id === reservation.id)) {
          allReservations.push({ id: reservation.id, event: reservation.schedule_events })
        }
      }
    }
  }

  // スタッフ予約（participant_namesに自分の名前が含まれる場合）
  // 顧客名またはスタッフ名で照合
  const myNames: string[] = []
  if (customer?.name) myNames.push(customer.name)
  if (staffRecord?.name && !myNames.includes(staffRecord.name)) myNames.push(staffRecord.name)
  
  if (staffReservations && myNames.length > 0) {
    for (const r of staffReservations) {
      const names = r.participant_names as string[] | null
      if (names && names.some(n => myNames.includes(n))) {
        if (r.schedule_events && !allReservations.some(existing => existing.id === r.id)) {
          allReservations.push({ id: r.id, event: r.schedule_events })
        }
      }
    }
  }

  // 今日の公演で、現在時刻の前後3時間以内のものをフィルタ
  const currentHour = jstNow.getHours()
  const currentMinute = jstNow.getMinutes()
  const currentTotalMinutes = currentHour * 60 + currentMinute

  const filtered = allReservations
    .filter(({ event }) => {
      if (!event) return false
      if (event.date !== todayStr) return false

      // 開始時間をパース
      const [startHour, startMinute] = event.start_time.split(':').map(Number)
      const startTotalMinutes = startHour * 60 + startMinute

      // 開始3時間前 〜 開始3時間後 の範囲内
      const diff = currentTotalMinutes - startTotalMinutes
      return diff >= -180 && diff <= 180 // 前後3時間
    })
    .map(({ id, event }) => ({
      id,
      scenario_title: event.scenarios?.title || '不明なシナリオ',
      store_name: event.stores?.name || '不明な店舗',
      date: event.date,
      time: event.start_time.substring(0, 5)
    }))

  return filtered
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

  logger.log('キャンペーン更新:', { id, orgId, formData })

  const { data, error, count } = await supabase
    .from('coupon_campaigns')
    .update(formData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()

  if (error) {
    logger.error('キャンペーン更新エラー:', error)
    return { success: false, error: error.message }
  }

  if (!data || data.length === 0) {
    logger.error('キャンペーン更新: 対象レコードなし', { id, orgId })
    return { success: false, error: 'キャンペーンが見つかりません（権限不足の可能性）' }
  }

  logger.log('キャンペーン更新成功:', data)
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

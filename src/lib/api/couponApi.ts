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

const COUPON_CAMPAIGN_SELECT_FIELDS =
  'id, organization_id, name, description, discount_type, discount_amount, max_uses_per_customer, target_type, target_ids, trigger_type, valid_from, valid_until, coupon_expiry_days, is_active, created_at, updated_at' as const

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

  // 予約先組織に紐づく顧客行のみ（同一 user_id の複数組織行の取り違え防止）
  const orgForCustomer = organizationId ?? (await getCurrentOrganizationId())
  let customerQuery = supabase.from('customers').select('id').eq('user_id', user.id)
  if (orgForCustomer) {
    customerQuery = customerQuery.eq('organization_id', orgForCustomer)
  }
  const { data: customer } = await customerQuery.maybeSingle()

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

  const orgForCustomer = await getCurrentOrganizationId()
  let customerQuery = supabase.from('customers').select('id').eq('user_id', user.id)
  if (orgForCustomer) {
    customerQuery = customerQuery.eq('organization_id', orgForCustomer)
  }
  const { data: customer } = await customerQuery.maybeSingle()

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
    .select(COUPON_CAMPAIGN_SELECT_FIELDS)
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

  // クーポンを先に取得し、customer_id + organization_id で本人の顧客行か検証（多組織の取り違え防止）
  const { data: coupon, error: couponError } = await supabase
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
        discount_amount
      )
    `)
    .eq('id', customerCouponId)
    .single()

  if (couponError || !coupon) {
    logger.error('クーポン取得エラー:', couponError)
    return { success: false, error: 'クーポンが見つかりません' }
  }

  let ownerQuery = supabase
    .from('customers')
    .select('id')
    .eq('id', coupon.customer_id)
    .eq('user_id', user.id)
  if (coupon.organization_id) {
    ownerQuery = ownerQuery.eq('organization_id', coupon.organization_id)
  }
  const { data: customer } = await ownerQuery.maybeSingle()

  if (!customer) {
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

  // タイトル（シナリオ）に既にクーポンを使用していないかチェック
  if (reservationId) {
    // 選択した予約のシナリオ情報を取得
    const { data: selectedReservation } = await supabase
      .from('reservations')
      .select('schedule_event_id')
      .eq('id', reservationId)
      .maybeSingle()

    if (selectedReservation?.schedule_event_id) {
      const { data: selectedEvent } = await supabase
        .from('schedule_events')
        .select('scenario_master_id, scenario')
        .eq('id', selectedReservation.schedule_event_id)
        .maybeSingle()

      if (selectedEvent && (selectedEvent.scenario_master_id || selectedEvent.scenario)) {
        // このお客さんの全クーポン使用履歴の reservation_id を取得
        const { data: myCoupons } = await supabase
          .from('customer_coupons')
          .select('id')
          .eq('customer_id', customer.id)

        if (myCoupons && myCoupons.length > 0) {
          const { data: usages } = await supabase
            .from('coupon_usages')
            .select('reservation_id')
            .in('customer_coupon_id', myCoupons.map(c => c.id))
            .not('reservation_id', 'is', null)

          if (usages && usages.length > 0) {
            const usedReservationIds = usages.map(u => u.reservation_id).filter(Boolean) as string[]
            const { data: usedReservations } = await supabase
              .from('reservations')
              .select('schedule_event_id')
              .in('id', usedReservationIds)

            if (usedReservations && usedReservations.length > 0) {
              const usedEventIds = usedReservations.map(r => r.schedule_event_id).filter(Boolean) as string[]
              let sameScenarioQuery = supabase
                .from('schedule_events')
                .select('id')
                .in('id', usedEventIds)

              if (selectedEvent.scenario_master_id) {
                sameScenarioQuery = sameScenarioQuery.eq('scenario_master_id', selectedEvent.scenario_master_id)
              } else if (selectedEvent.scenario) {
                sameScenarioQuery = sameScenarioQuery.eq('scenario', selectedEvent.scenario)
              }

              const { data: sameScenarioEvents } = await sameScenarioQuery
              if (sameScenarioEvents && sameScenarioEvents.length > 0) {
                return { success: false, error: 'このタイトルには既にクーポンをご利用済みです' }
              }
            }
          }
        }
      }
    }
  }

  const campaign = coupon.coupon_campaigns as any
  const discountAmount = campaign?.discount_amount || 0

  // トランザクション的に処理
  // 1. coupon_usages に記録
  const usageData: Record<string, unknown> = {
    customer_coupon_id: customerCouponId,
    discount_amount: discountAmount,
    used_at: new Date().toISOString()
  }
  // reservation_id は外部キー制約があるため、有効な場合のみ設定
  if (reservationId) {
    usageData.reservation_id = reservationId
  }

  const { error: usageError } = await supabase
    .from('coupon_usages')
    .insert(usageData)

  if (usageError) {
    console.error('クーポン使用記録エラー:', usageError)
    // reservation_id の外部キー制約エラーの場合、reservation_id なしでリトライ
    if (usageError.code === '23503' && reservationId) {
      console.warn('reservation_id の外部キー制約エラー。reservation_id なしでリトライ')
      const { error: retryError } = await supabase
        .from('coupon_usages')
        .insert({
          customer_coupon_id: customerCouponId,
          discount_amount: discountAmount,
          used_at: new Date().toISOString()
        })
      if (retryError) {
        console.error('クーポン使用記録リトライエラー:', retryError)
        return { success: false, error: 'クーポン使用の記録に失敗しました' }
      }
    } else {
      return { success: false, error: 'クーポン使用の記録に失敗しました' }
    }
  }

  // coupon_usages への INSERT 後、DB トリガーが自動で
  // customer_coupons の uses_remaining と status を更新する

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

  const orgForCustomer = await getCurrentOrganizationId()
  let customerQuery = supabase.from('customers').select('id, name').eq('user_id', user.id)
  if (orgForCustomer) {
    customerQuery = customerQuery.eq('organization_id', orgForCustomer)
  }
  const { data: customer } = await customerQuery.maybeSingle()

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
  // schedule_event_id で明示的にJOINを指定（reservationsとschedule_eventsに複数の外部キーがあるため）
  let directReservations: any[] | null = null
  if (customer) {
    const { data, error } = await supabase
      .from('reservations')
      .select(`
        id,
        schedule_event_id
      `)
      .eq('customer_id', customer.id)
      .eq('status', 'confirmed')
    if (error) console.error('[クーポン予約検索] directReservations error:', error)
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
        reservations (
          id,
          status,
          schedule_event_id
        )
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'joined')

  // 3. スタッフ予約を取得（payment_method='staff' または reservation_source='staff_entry'/'staff_participation'）
  const { data: staffReservations, error: staffError } = await supabase
    .from('reservations')
    .select(`
      id,
      participant_names,
      schedule_event_id
    `)
    .or('payment_method.eq.staff,reservation_source.eq.staff_entry,reservation_source.eq.staff_participation')
    .eq('status', 'confirmed')
  if (staffError) console.error('[クーポン予約検索] staffReservations error:', staffError)

  // schedule_event_id を収集して、一括でschedule_eventsを取得
  const eventIds = new Set<string>()
  if (directReservations) {
    directReservations.forEach((r: any) => { if (r.schedule_event_id) eventIds.add(r.schedule_event_id) })
  }
  if (privateGroupMembers) {
    privateGroupMembers.forEach((m: any) => {
      const group = m.private_groups as any
      if (!group) return
      const res = group.reservations as any
      if (res?.schedule_event_id) eventIds.add(res.schedule_event_id)
    })
  }
  if (staffReservations) {
    staffReservations.forEach((r: any) => { if (r.schedule_event_id) eventIds.add(r.schedule_event_id) })
  }

  // schedule_events を一括取得
  const eventsMap: Record<string, any> = {}
  if (eventIds.size > 0) {
    const { data: events } = await supabase
      .from('schedule_events')
      .select('id, date, start_time, scenario, venue, stores (name)')
      .in('id', Array.from(eventIds))
    if (events) {
      for (const ev of events) {
        eventsMap[ev.id] = ev
      }
    }
  }

  // 結果をマージ（eventsMapからイベント情報を取得）
  const allReservations: Array<{ id: string; event: any }> = []

  // 通常予約
  if (directReservations) {
    for (const r of directReservations) {
      const event = eventsMap[r.schedule_event_id]
      if (event) {
        allReservations.push({ id: r.id, event })
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
      const event = eventsMap[reservation.schedule_event_id]
      if (event && !allReservations.some(r => r.id === reservation.id)) {
        allReservations.push({ id: reservation.id, event })
      }
    }
  }

  // スタッフ予約（participant_namesに自分の名前が含まれる場合）
  const myNames: string[] = []
  if (customer?.name) myNames.push(customer.name)
  if (staffRecord?.name && !myNames.includes(staffRecord.name)) myNames.push(staffRecord.name)
  
  if (staffReservations && myNames.length > 0) {
    for (const r of staffReservations) {
      const names = r.participant_names as string[] | null
      if (names && names.some(n => myNames.includes(n))) {
        const event = eventsMap[r.schedule_event_id]
        if (event && !allReservations.some(existing => existing.id === r.id)) {
          allReservations.push({ id: r.id, event })
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

      const [startHour, startMinute] = event.start_time.split(':').map(Number)
      const startTotalMinutes = startHour * 60 + startMinute

      const diff = currentTotalMinutes - startTotalMinutes
      return diff >= -180 && diff <= 180
    })
    .map(({ id, event }) => ({
      id,
      scenario_title: event.scenario || '不明なシナリオ',
      store_name: event.stores?.name || event.venue || '不明な店舗',
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

  const orgForCustomer = await getCurrentOrganizationId()
  let customerQuery = supabase.from('customers').select('id').eq('user_id', user.id)
  if (orgForCustomer) {
    customerQuery = customerQuery.eq('organization_id', orgForCustomer)
  }
  const { data: customer } = await customerQuery.maybeSingle()

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
    .select(COUPON_CAMPAIGN_SELECT_FIELDS)
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
    .select(COUPON_CAMPAIGN_SELECT_FIELDS)
    .eq('id', campaignId)
    .eq('organization_id', orgId)
    .single()

  if (campaignError || !campaign) {
    logger.error('キャンペーン取得エラー:', campaignError)
    return { success: false, error: 'キャンペーンが見つかりません' }
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

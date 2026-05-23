/**
 * クーポン関連のAPI
 *
 * read / write はすべて バックエンド API (/api/coupons) 経由。
 * organization_id はサーバー側で JWT から取得するため、クライアントからは渡さない。
 * 顧客向け / 管理者向けの両方を含む。
 */
import { apiClient } from '../apiClient'
import { logger } from '@/utils/logger'
import type {
  CustomerCoupon,
  CouponUsage,
  CouponCampaign
} from '@/types'

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
  usage_valid_from?: string | null
  usage_valid_until?: string | null
  // 配布拡張
  max_total_grants?: number | null
  max_grants_per_customer?: number | null
  coupon_code?: string | null
  notify_on_grant?: boolean
  // 使用拡張
  min_order_amount?: number | null
  combinable?: boolean
  allowed_weekdays?: number[] | null
  allowed_time_slots?: string[] | null
  // 顧客向け表示
  display_name?: string | null
  display_image_url?: string | null
  customer_terms?: string | null
  internal_memo?: string | null
  is_active: boolean
}

/**
 * ログインユーザーの利用可能クーポン一覧を取得
 *
 * @param organizationId 対象組織ID（予約先の組織でフィルタ。省略時はサーバ側で JWT の orgId を使う）
 */
export async function getAvailableCoupons(
  organizationId?: string
): Promise<CustomerCoupon[]> {
  try {
    const params = new URLSearchParams({ type: 'available' })
    if (organizationId) params.set('organization_id', organizationId)
    return await apiClient.get<CustomerCoupon[]>(`/api/coupons?${params}`)
  } catch (err) {
    logger.error('利用可能クーポン取得エラー:', err)
    return []
  }
}

/**
 * ログインユーザーのクーポン一覧を取得（全ステータス）
 * マイページ表示用
 */
export async function getAllCoupons(): Promise<CustomerCoupon[]> {
  try {
    return await apiClient.get<CustomerCoupon[]>('/api/coupons?type=all')
  } catch (err) {
    logger.error('クーポン一覧取得エラー:', err)
    return []
  }
}

/**
 * 新規登録クーポンを付与
 * NOTE: 電話番号での重複チェックは廃止（真正性を確認できないため）
 * 重複防止は customer_coupons の UNIQUE 制約 (campaign_id, customer_id) で担保
 * @param customerId 顧客ID（サーバ側で JWT の user_id と一致するか検証）
 * @param _organizationId 互換性のため受け取るが、サーバ側で JWT から決定する
 * @returns 付与されたクーポン数
 */
export async function grantRegistrationCoupon(
  customerId: string,
  _organizationId?: string
): Promise<{ granted: number; skipped: boolean; reason?: string }> {
  try {
    return await apiClient.post<{ granted: number; skipped: boolean; reason?: string }>(
      '/api/coupons?action=grant-registration',
      { customer_id: customerId }
    )
  } catch (err) {
    logger.error('クーポン付与エラー:', err)
    return { granted: 0, skipped: true, reason: '付与に失敗しました' }
  }
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
  try {
    return await apiClient.post<{ success: boolean; error?: string }>(
      '/api/coupons?action=use',
      {
        customer_coupon_id: customerCouponId,
        reservation_id: reservationId ?? null,
      }
    )
  } catch (err) {
    logger.error('クーポン使用エラー:', err)
    const message = err instanceof Error ? err.message : 'クーポン使用に失敗しました'
    return { success: false, error: message }
  }
}

/**
 * 現在進行中の予約を取得（クーポン使用時の紐付け用）
 * 本日の公演で、開始3時間前〜終了1時間後の範囲のものを対象
 * 通常予約、貸切公演（参加メンバー含む）、スタッフ予約の全てに対応
 */
export async function getCurrentReservations(): Promise<Array<{
  id: string
  scenario_title: string
  store_name: string
  date: string
  time: string
}>> {
  try {
    return await apiClient.get<Array<{
      id: string
      scenario_title: string
      store_name: string
      date: string
      time: string
    }>>('/api/coupons?type=current-reservations')
  } catch (err) {
    logger.error('現在進行中の予約取得エラー:', err)
    return []
  }
}

/**
 * クーポン使用履歴を取得
 */
export async function getCouponUsageHistory(): Promise<CouponUsage[]> {
  try {
    return await apiClient.get<CouponUsage[]>('/api/coupons?type=usages')
  } catch (err) {
    logger.error('クーポン使用履歴取得エラー:', err)
    return []
  }
}

// =========================================
// 管理者向けAPI
// =========================================

/**
 * キャンペーン一覧を取得（組織単位）
 */
export async function getCampaigns(): Promise<CouponCampaign[]> {
  try {
    return await apiClient.get<CouponCampaign[]>('/api/coupons?type=campaigns')
  } catch (err) {
    logger.error('キャンペーン一覧取得エラー:', err)
    return []
  }
}

/**
 * キャンペーンを作成
 */
export async function createCampaign(
  formData: CampaignFormData
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    return await apiClient.post<{ success: boolean; id?: string; error?: string }>(
      '/api/coupons?action=create-campaign',
      formData
    )
  } catch (err) {
    logger.error('キャンペーン作成エラー:', err)
    const message = err instanceof Error ? err.message : '作成に失敗しました'
    return { success: false, error: message }
  }
}

/**
 * キャンペーンを更新
 */
export async function updateCampaign(
  id: string,
  formData: Partial<CampaignFormData>
): Promise<{ success: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({ action: 'update-campaign', id })
    return await apiClient.patch<{ success: boolean; error?: string }>(
      `/api/coupons?${params}`,
      formData
    )
  } catch (err) {
    logger.error('キャンペーン更新エラー:', err)
    const message = err instanceof Error ? err.message : '更新に失敗しました'
    return { success: false, error: message }
  }
}

/**
 * キャンペーンの有効/無効を切り替え
 */
export async function toggleCampaignActive(
  id: string
): Promise<{ success: boolean; isActive?: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({ action: 'toggle-campaign-active', id })
    return await apiClient.patch<{ success: boolean; isActive?: boolean; error?: string }>(
      `/api/coupons?${params}`,
      {}
    )
  } catch (err) {
    logger.error('キャンペーン状態更新エラー:', err)
    const message = err instanceof Error ? err.message : '状態の変更に失敗しました'
    return { success: false, error: message }
  }
}

/**
 * 顧客にクーポンを手動付与
 */
export async function grantCouponToCustomer(
  campaignId: string,
  customerId: string
): Promise<{ success: boolean; couponId?: string; error?: string }> {
  try {
    return await apiClient.post<{ success: boolean; couponId?: string; error?: string }>(
      '/api/coupons?action=grant-to-customer',
      { campaign_id: campaignId, customer_id: customerId }
    )
  } catch (err) {
    logger.error('クーポン付与エラー:', err)
    const message = err instanceof Error ? err.message : '付与に失敗しました'
    return { success: false, error: message }
  }
}

/**
 * キャンペーンの統計を取得
 */
export async function getCampaignStats(
  campaignId: string
): Promise<CampaignStats | null> {
  try {
    const params = new URLSearchParams({ type: 'campaign-stats', campaign_id: campaignId })
    return await apiClient.get<CampaignStats>(`/api/coupons?${params}`)
  } catch (err) {
    logger.error('キャンペーン統計取得エラー:', err)
    return null
  }
}

/**
 * 顧客がコード入力でクーポンを取得
 */
export async function redeemCouponByCode(
  code: string
): Promise<{ success: boolean; couponId?: string; campaignName?: string; error?: string }> {
  try {
    return await apiClient.post<{ success: boolean; couponId?: string; campaignName?: string; error?: string }>(
      '/api/coupons?action=redeem-code',
      { code }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'コードの引き換えに失敗しました'
    return { success: false, error: message }
  }
}

/**
 * 顧客一覧を検索（クーポン付与用）
 */
export async function searchCustomers(
  query: string
): Promise<Array<{ id: string; name: string; email: string; phone: string | null }>> {
  try {
    const params = new URLSearchParams({ type: 'search-customers', q: query })
    return await apiClient.get<Array<{ id: string; name: string; email: string; phone: string | null }>>(
      `/api/coupons?${params}`
    )
  } catch (err) {
    logger.error('顧客検索エラー:', err)
    return []
  }
}

/**
 * クーポン使用を取り消して残数を復元する（管理者向け）
 * coupon_usages を削除し、customer_coupons.uses_remaining を +1 する
 */
export async function restoreCouponUsage(
  couponUsageId: string,
  customerCouponId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({
      action: 'restore-usage',
      usage_id: couponUsageId,
      customer_coupon_id: customerCouponId,
    })
    return await apiClient.delete<{ success: boolean; error?: string }>(`/api/coupons?${params}`)
  } catch (err) {
    logger.error('クーポン使用取り消しエラー:', err)
    const message = err instanceof Error ? err.message : '復元に失敗しました'
    return { success: false, error: message }
  }
}

/**
 * 顧客クーポンの使用履歴を取得（管理者向け）
 */
export async function getCouponUsagesForAdmin(
  customerCouponId: string
): Promise<Array<{
  id: string
  reservation_id: string | null
  discount_amount: number
  used_at: string
  reservation_title: string | null
}>> {
  try {
    const params = new URLSearchParams({ type: 'admin-usages', customer_coupon_id: customerCouponId })
    return await apiClient.get<Array<{
      id: string
      reservation_id: string | null
      discount_amount: number
      used_at: string
      reservation_title: string | null
    }>>(`/api/coupons?${params}`)
  } catch (err) {
    logger.error('クーポン使用履歴取得エラー:', err)
    return []
  }
}

/**
 * キャンペーンに紐づくクーポン一覧を取得（顧客情報付き）
 */
export async function getCampaignCoupons(
  campaignId: string
): Promise<Array<CustomerCoupon & { customers?: { name: string; email: string } }>> {
  try {
    const params = new URLSearchParams({ type: 'campaign-coupons', campaign_id: campaignId })
    return await apiClient.get<Array<CustomerCoupon & { customers?: { name: string; email: string } }>>(
      `/api/coupons?${params}`
    )
  } catch (err) {
    logger.error('キャンペーンクーポン取得エラー:', err)
    return []
  }
}

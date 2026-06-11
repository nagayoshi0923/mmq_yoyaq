import type { Reservation } from './reservation'

// ================================================
// クーポン関連の型定義
// ================================================

// クーポンキャンペーン（組織単位のキャンペーン定義）
export interface CouponCampaign {
  id: string
  organization_id: string
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
  created_at: string
  updated_at: string
}

/** マイページ用: customer_coupons にネストした使用履歴＋予約概要 */
export interface CustomerCouponUsageWithReservation {
  id: string
  reservation_id: string
  used_at: string
  discount_amount: number
  reservations?: {
    id: string
    title: string | null
    requested_datetime: string
    store_id: string | null
    stores?: { name: string; short_name?: string | null } | null
  } | null
}

// 顧客のクーポン保有・使用状況
export interface CustomerCoupon {
  id: string
  campaign_id: string
  customer_id: string
  organization_id: string
  uses_remaining: number
  expires_at?: string | null
  status: 'active' | 'fully_used' | 'expired' | 'revoked'
  created_at: string
  updated_at: string
  // JOIN時の拡張フィールド
  coupon_campaigns?: CouponCampaign | null
  /** getAllCoupons 時のみ: 各使用ごとの予約（公演）情報 */
  coupon_usages?: CustomerCouponUsageWithReservation[] | null
}

// クーポン使用履歴
export interface CouponUsage {
  id: string
  customer_coupon_id: string
  reservation_id: string
  discount_amount: number
  used_at: string
  // JOIN時の拡張フィールド
  customer_coupons?: CustomerCoupon | null
  reservations?: Reservation | null
}

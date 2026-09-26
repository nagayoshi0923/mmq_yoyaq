import type { CustomerCoupon } from '@/types'

type CouponStatus = CustomerCoupon['status']

type CouponLike = Pick<CustomerCoupon, 'status' | 'expires_at' | 'updated_at' | 'created_at'> & {
  coupon_campaigns?: Pick<NonNullable<CustomerCoupon['coupon_campaigns']>, 'usage_valid_until'> | null
}

/** active でも期限経過なら表示上は expired にする */
export function resolveCouponDisplayStatus(coupon: CouponLike, now: Date): CouponStatus {
  if (
    coupon.status === 'active' &&
    (
      (coupon.expires_at && new Date(coupon.expires_at) < now) ||
      (coupon.coupon_campaigns?.usage_valid_until && new Date(coupon.coupon_campaigns.usage_valid_until) < now)
    )
  ) {
    return 'expired'
  }
  return coupon.status
}

/** 期限切れ保持の基準日: expires_at、なければ usage_valid_until */
export function getExpiredRetentionDeadline(coupon: CouponLike): string | null {
  return coupon.expires_at ?? coupon.coupon_campaigns?.usage_valid_until ?? null
}

/**
 * 「使用済み・期限切れ」欄に残すか。
 * - fully_used: 使用時に動く updated_at（なければ created_at）
 * - expired: 期限日（updated_at は使わない）
 * - その他（revoked 等）: updated_at
 */
export function isUsedCouponVisible(coupon: CouponLike, now: Date, retentionMonths = 1): boolean {
  if (coupon.status === 'active') return false

  const retentionStart = new Date(now)
  retentionStart.setMonth(retentionStart.getMonth() - retentionMonths)

  if (coupon.status === 'fully_used') {
    const updatedAt = coupon.updated_at ? new Date(coupon.updated_at) : null
    const createdAt = coupon.created_at ? new Date(coupon.created_at) : null
    if (updatedAt && updatedAt >= retentionStart) return true
    if (createdAt && createdAt >= retentionStart) return true
    return false
  }

  if (coupon.status === 'expired') {
    const deadline = getExpiredRetentionDeadline(coupon)
    if (!deadline) return true
    return new Date(deadline) >= retentionStart
  }

  if (!coupon.updated_at) return true
  return new Date(coupon.updated_at) >= retentionStart
}

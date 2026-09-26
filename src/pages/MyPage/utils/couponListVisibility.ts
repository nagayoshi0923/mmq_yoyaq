import type { CustomerCoupon } from '@/types'

type CouponStatus = CustomerCoupon['status']

type CouponLike = Pick<CustomerCoupon, 'status' | 'expires_at' | 'updated_at' | 'created_at'> & {
  coupon_usages?: { used_at: string }[] | null
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

/** 個別期限とキャンペーン期限のうち、先に利用不可になる日時。 */
export function getExpiredRetentionDeadline(coupon: CouponLike): string | null {
  const deadlines = [coupon.expires_at, coupon.coupon_campaigns?.usage_valid_until]
    .filter((value): value is string => !!value && Number.isFinite(Date.parse(value)))
  return deadlines.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
}

export function getLastCouponUsedAt(coupon: CouponLike): string | null {
  return (coupon.coupon_usages ?? []).map(usage => usage.used_at)
    .filter(value => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
}

function retentionStartAtJst(now: Date, months: number): Date {
  const offset = 9 * 60 * 60 * 1000
  const shifted = new Date(now.getTime() + offset)
  const day = shifted.getUTCDate()
  shifted.setUTCDate(1)
  shifted.setUTCMonth(shifted.getUTCMonth() - months)
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate()
  shifted.setUTCDate(Math.min(day, lastDay))
  return new Date(shifted.getTime() - offset)
}

/**
 * 「使用済み・期限切れ」欄に残すか。
 * - fully_used: 最後の利用日時。履歴が取得できない場合は隠さない
 * - expired: 期限日（updated_at は使わない）
 * - その他（revoked 等）: updated_at
 */
export function isUsedCouponVisible(coupon: CouponLike, now: Date, retentionMonths = 1): boolean {
  if (coupon.status === 'active') return false

  const retentionStart = retentionStartAtJst(now, retentionMonths)

  if (coupon.status === 'fully_used') {
    const usedAt = getLastCouponUsedAt(coupon)
    return usedAt === null || Date.parse(usedAt) >= retentionStart.getTime()
  }

  if (coupon.status === 'expired') {
    const deadline = getExpiredRetentionDeadline(coupon)
    if (!deadline) return true
    return new Date(deadline) >= retentionStart
  }

  if (!coupon.updated_at) return true
  return new Date(coupon.updated_at) >= retentionStart
}

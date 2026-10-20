/**
 * 予約に適用済みのクーポン（社長決定 B、2026-10-20）。
 * 予約時にクーポンを付けると、その時点で使用（消費）される。来店時にお客様が「もぎる」を押すと
 * 「来店時に確認済み」の印が付く。マイページのクーポンに、当日〜近日の予約に付いたクーポンを出す。
 */
import type { CustomerCoupon } from '@/types'
import { addJstDays, toJstYmd } from '@/utils/jstDate'

/** 何日先の予約まで「この予約に適用済み」に出すか */
export const APPLIED_COUPON_DAYS_AHEAD = 30

const ACTIVE_RESERVATION_STATUSES = new Set(['confirmed', 'checked_in'])

export interface AppliedCouponCard {
  usageId: string
  couponId: string
  campaignName: string
  discountAmount: number
  reservationTitle: string
  storeName: string
  startsAt: string
  redeemedAt: string | null
}

type CouponForApplied = Pick<CustomerCoupon, 'id' | 'coupon_usages' | 'coupon_campaigns'>

export function listAppliedCoupons(coupons: CouponForApplied[], now: Date, daysAhead = APPLIED_COUPON_DAYS_AHEAD): AppliedCouponCard[] {
  const today = toJstYmd(now)
  const last = addJstDays(today, daysAhead)
  const cards: AppliedCouponCard[] = []
  for (const coupon of coupons) {
    for (const usage of coupon.coupon_usages ?? []) {
      const reservation = usage.reservations
      if (!reservation?.requested_datetime) continue
      if (reservation.status && !ACTIVE_RESERVATION_STATUSES.has(reservation.status)) continue
      const day = toJstYmd(reservation.requested_datetime)
      if (!day || day < today || day > last) continue
      cards.push({
        usageId: usage.id,
        couponId: coupon.id,
        campaignName: coupon.coupon_campaigns?.display_name || coupon.coupon_campaigns?.name || 'クーポン',
        discountAmount: usage.discount_amount,
        reservationTitle: cleanReservationTitle(reservation.title),
        storeName: reservation.stores?.short_name || reservation.stores?.name || '',
        startsAt: reservation.requested_datetime,
        redeemedAt: usage.redeemed_at ?? null,
      })
    }
  }
  return cards.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
}

export function cleanReservationTitle(title?: string | null): string {
  if (!title) return '（タイトル不明）'
  const t = title.replace(/【貸切希望】/g, '【貸切】').replace(/（候補\d+件）/g, '').trim()
  return t || '（タイトル不明）'
}

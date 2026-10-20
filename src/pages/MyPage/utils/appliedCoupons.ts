/**
 * 予約に適用済みのクーポン（社長決定 B、2026-10-20）。
 * 予約時にクーポンを付けると、その時点で使用（消費）される。来店時にお客様が「もぎる」を押すと
 * 「来店時に確認済み」の印が付く。マイページのクーポンに、当日〜近日の予約に付いたクーポンを出す。
 * 公演の日付は予約の公演（schedule_events.date）を正とし、公演の無い予約だけ requested_datetime の日本時間の日付を使う
 * （requested_datetime に予約を作った時刻が入っている予約があるため。サーバーの判定 20261020220000 と同じ）。
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
  /** 公演の開始日時（表示・並び順用） */
  startsAt: string
  /** 公演の日付（YYYY-MM-DD、日本時間）。「もぎる」を押せるのはこの日だけ */
  performanceDate: string
  redeemedAt: string | null
}

type UsageReservation = NonNullable<NonNullable<CustomerCoupon['coupon_usages']>[number]['reservations']>

/** 予約の公演日（日本時間）と開始日時。公演の日付が正、公演が無ければ requested_datetime */
export function reservationPerformance(reservation: Pick<UsageReservation, 'requested_datetime' | 'performance_date' | 'performance_start_time'>): { date: string; startsAt: string } | null {
  const date = reservation.performance_date
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const time = (reservation.performance_start_time ?? '').slice(0, 5)
    return { date, startsAt: `${date}T${/^\d{2}:\d{2}$/.test(time) ? time : '00:00'}:00+09:00` }
  }
  if (!reservation.requested_datetime) return null
  const fallback = toJstYmd(reservation.requested_datetime)
  return fallback ? { date: fallback, startsAt: reservation.requested_datetime } : null
}

type CouponForApplied = Pick<CustomerCoupon, 'id' | 'coupon_usages' | 'coupon_campaigns'>

export function listAppliedCoupons(coupons: CouponForApplied[], now: Date, daysAhead = APPLIED_COUPON_DAYS_AHEAD): AppliedCouponCard[] {
  const today = toJstYmd(now)
  const last = addJstDays(today, daysAhead)
  const cards: AppliedCouponCard[] = []
  for (const coupon of coupons) {
    for (const usage of coupon.coupon_usages ?? []) {
      const reservation = usage.reservations
      if (!reservation) continue
      if (reservation.status && !ACTIVE_RESERVATION_STATUSES.has(reservation.status)) continue
      const performance = reservationPerformance(reservation)
      if (!performance || performance.date < today || performance.date > last) continue
      cards.push({
        usageId: usage.id,
        couponId: coupon.id,
        campaignName: coupon.coupon_campaigns?.display_name || coupon.coupon_campaigns?.name || 'クーポン',
        discountAmount: usage.discount_amount,
        reservationTitle: cleanReservationTitle(reservation.title),
        storeName: reservation.stores?.short_name || reservation.stores?.name || '',
        startsAt: performance.startsAt,
        performanceDate: performance.date,
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

import { describe, expect, it } from 'vitest'
import { listAppliedCoupons } from './appliedCoupons'
import type { CustomerCoupon } from '@/types'

const now = new Date('2026-10-20T01:00:00Z') // JST 10/20 10:00
function coupon(usages: NonNullable<CustomerCoupon['coupon_usages']>): Pick<CustomerCoupon, 'id' | 'coupon_usages' | 'coupon_campaigns'> {
  return { id: 'c1', coupon_campaigns: { name: '初回クーポン' } as CustomerCoupon['coupon_campaigns'], coupon_usages: usages }
}
function usage(id: string, when: string, extra: Record<string, unknown> = {}) {
  return {
    id, reservation_id: `r-${id}`, used_at: '2026-10-10T00:00:00Z', discount_amount: 500,
    reservations: { id: `r-${id}`, title: '【貸切希望】架空作品（候補3件）', status: 'confirmed', requested_datetime: when, store_id: 's', stores: { name: 'クインズワルツ高田馬場店', short_name: '高田馬場店' } },
    ...extra,
  }
}

describe('予約に適用済みのクーポン（マイページ）', () => {
  it('当日〜近日の確定予約に付いたクーポンを、日時の早い順に出す', () => {
    const cards = listAppliedCoupons([coupon([
      usage('later', '2026-10-25T10:00:00Z'),
      usage('today', '2026-10-20T04:00:00Z'),
    ])], now)
    expect(cards.map(c => c.usageId)).toEqual(['today', 'later'])
    expect(cards[0]).toMatchObject({ couponId: 'c1', campaignName: '初回クーポン', discountAmount: 500, reservationTitle: '【貸切】架空作品', storeName: '高田馬場店', redeemedAt: null })
  })
  it('当日の朝早い公演（JST で今日）も出す。昨日以前・30日より先は出さない', () => {
    const cards = listAppliedCoupons([coupon([
      usage('early', '2026-10-19T16:00:00Z'), // JST 10/20 1:00
      usage('yesterday', '2026-10-19T10:00:00Z'), // JST 10/19 19:00
      usage('far', '2026-12-01T10:00:00Z'),
    ])], now)
    expect(cards.map(c => c.usageId)).toEqual(['early'])
  })
  it('取り消した予約・予約情報が無い使用は出さない', () => {
    const cancelled = usage('cancelled', '2026-10-21T10:00:00Z')
    cancelled.reservations.status = 'cancelled'
    const cards = listAppliedCoupons([coupon([cancelled, { ...usage('none', '2026-10-21T10:00:00Z'), reservations: null }])], now)
    expect(cards).toEqual([])
  })
  it('来店確認済みは時刻を持って出す（押し直しはさせない）', () => {
    const cards = listAppliedCoupons([coupon([usage('done', '2026-10-20T04:00:00Z', { redeemed_at: '2026-10-20T03:50:00Z' })])], now)
    expect(cards[0].redeemedAt).toBe('2026-10-20T03:50:00Z')
  })
})

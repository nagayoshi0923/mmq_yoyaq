import { describe, expect, it } from 'vitest'
import { couponBadge, couponDetail, groupCouponStatusesByReservation } from './reservationCoupons'

const base = { usage_id: 'u1', reservation_id: 'r1', discount_amount: 500, campaign_name: '初回クーポン', used_at: '2026-10-19T03:00:00Z', redeemed_at: null, redeemed_source: null }

describe('予約に付いたクーポンの来店確認（スタッフ側）', () => {
  it('クーポンの無い予約は何も出さない', () => {
    expect(couponBadge(undefined)).toBeNull()
    expect(couponBadge([])).toBeNull()
  })
  it('未確認と来店確認済みを出し分ける', () => {
    expect(couponBadge([base])).toEqual({ label: 'クーポン 未確認', redeemed: false })
    expect(couponBadge([{ ...base, redeemed_at: '2026-10-20T04:05:00Z', redeemed_source: 'customer_present' }])).toEqual({ label: 'クーポン 来店確認済み', redeemed: true })
  })
  it('複数枚のうち1枚でも未確認なら未確認', () => {
    expect(couponBadge([{ ...base, redeemed_at: '2026-10-20T04:05:00Z' }, { ...base, usage_id: 'u2' }])?.redeemed).toBe(false)
  })
  it('台帳の詳細に割引額と確認時刻（日本時間）を出す', () => {
    expect(couponDetail(base)).toBe('初回クーポン ¥500 割引・来店確認は未確認（予約時に適用）')
    expect(couponDetail({ ...base, redeemed_at: '2026-10-20T04:05:00Z', redeemed_source: 'customer_present' })).toContain('来店確認済み（2026/10/20 13:05）')
    expect(couponDetail({ ...base, redeemed_at: '2026-10-20T04:05:00Z', redeemed_source: 'venue_use' })).toContain('来店時に使用')
  })
  it('予約ごとにまとめる', () => {
    const map = groupCouponStatusesByReservation([base, { ...base, usage_id: 'u2' }, { ...base, usage_id: 'u3', reservation_id: 'r2' }])
    expect(map.get('r1')).toHaveLength(2)
    expect(map.get('r2')).toHaveLength(1)
  })
})

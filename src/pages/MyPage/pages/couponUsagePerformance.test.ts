// 点検 F13: クーポンの使用履歴の公演時刻。UTC で保存された 04:00+00（日本時間 13:00）を 04:00 と出していた
import { describe, expect, it, vi } from 'vitest'
import { formatCouponUsagePerformance } from './couponUsagePerformance'

const usage = (reservations: Record<string, unknown>) => ({ id: 'u', reservation_id: 'r', used_at: '2026-11-01T05:00:00Z', discount_amount: 500, reservations: { id: 'r', title: '架空の作品', store_id: 's', stores: { name: '架空店', short_name: '架空' }, ...reservations } }) as never

describe('使用履歴の公演の日時', () => {
  it.each([
    ['2026-11-01T04:00:00+00:00'], ['2026-11-01T04:00:00+00'], ['2026-11-01T04:00:00Z'], ['2026-11-01T13:00:00+09:00'], ['2026-11-01T13:00:00'],
  ])('予約の日時 %s は日本時間 13:00', (dt) => {
    expect(formatCouponUsagePerformance(usage({ requested_datetime: dt }))).toBe('架空の作品 ｜ 架空 ｜ 2026年11月1日 13:00〜')
  })
  it('日をまたぐ UTC（10/31 16:30Z）は日本時間の 11/1 01:30', () => {
    expect(formatCouponUsagePerformance(usage({ requested_datetime: '2026-10-31T16:30:00Z' }))).toBe('架空の作品 ｜ 架空 ｜ 2026年11月1日 01:30〜')
  })
  it('公演の日付・開始時刻があればそれを正とする', () => {
    expect(formatCouponUsagePerformance(usage({ requested_datetime: '2026-11-01T04:00:00+00', performance_date: '2026-11-01', performance_start_time: '13:00:00' }))).toBe('架空の作品 ｜ 架空 ｜ 2026年11月1日 13:00〜')
  })
})

// 平日・土日祝で料金が違う作品の 4 区分（2026-10-25 社長報告: 日曜の貸切が平日料金で案内された）。
// オープン公演（予約確認画面・useBookingSubmit）も貸切（作品ページ・申込画面・日時から選ぶ画面）も calculateParticipationFee を通る。
import { describe, expect, it } from 'vitest'
import { calculateParticipationFee, calculatePrivateCandidateFees, participationFeeRange, type ParticipationCost } from './pricingUtils'

// 架空の設定: 平日 4,500 円・土日祝 5,000 円（スタッフ向けの gmtest は使わない）
const costs: ParticipationCost[] = [
  { time_slot: 'normal', amount: 4500, type: 'fixed' },
  { time_slot: 'gmtest', amount: 4000, type: 'fixed' },
  { time_slot: 'weekend', amount: 5000, type: 'fixed' },
  { time_slot: 'holiday', amount: 5000, type: 'fixed' },
]
const noHoliday = () => false

describe('4 区分', () => {
  it('オープン・平日（火曜 19:00）は平日の料金', () => {
    expect(calculateParticipationFee(4500, costs, '2026-10-20', noHoliday, '19:00')).toBe(4500)
  })
  it('オープン・休日（日曜 14:00、祝日 11/3、独自休日）は土日祝の料金', () => {
    expect(calculateParticipationFee(4500, costs, '2026-10-25', noHoliday, '14:00')).toBe(5000)
    expect(calculateParticipationFee(4500, costs, '2026-11-03', noHoliday, '14:00')).toBe(5000)
    expect(calculateParticipationFee(4500, costs, '2026-10-21', (d) => d === '2026-10-21', '14:00')).toBe(5000)
  })
  it('貸切・平日（火曜 9:00）は平日の料金', () => {
    expect(calculatePrivateCandidateFees(4500, costs, [{ date: '2026-10-20', slot: { startTime: '09:00' } }], noHoliday)).toEqual([4500])
  })
  it('貸切・休日（日曜 9:00）は土日祝の料金。平日と休日が混ざった候補は候補ごとの料金', () => {
    expect(calculatePrivateCandidateFees(4500, costs, [{ date: '2026-10-25', slot: { startTime: '09:00' } }], noHoliday)).toEqual([5000])
    expect(calculatePrivateCandidateFees(4500, costs, [
      { date: '2026-10-23', slot: { startTime: '19:00' } },
      { date: '2026-10-25', slot: { startTime: '09:00' } },
      { date: '2026-11-03', slot: { startTime: '14:00' } },
    ], noHoliday)).toEqual([4500, 5000, 5000])
  })
})

describe('日付が決まる前の料金の幅', () => {
  it('平日と土日祝で違えば最安〜最高、同じなら 1 つ', () => {
    expect(participationFeeRange(4500, costs)).toEqual({ min: 4500, max: 5000 })
    expect(participationFeeRange(4500, [{ time_slot: 'normal', amount: 4500, type: 'fixed' }])).toEqual({ min: 4500, max: 4500 })
    expect(participationFeeRange(4500, undefined)).toEqual({ min: 4500, max: 4500 })
  })
})

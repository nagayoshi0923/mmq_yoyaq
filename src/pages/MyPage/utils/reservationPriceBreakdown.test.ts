import { describe, expect, it } from 'vitest'
import { reservationPriceBreakdown } from './reservationPriceBreakdown'

describe('reservationPriceBreakdown（通常予約の金額・公開前検証 P2）', () => {
  it('4,500×2・割引1,000 → 合計 ¥8,000（サーバー確定金額）', () => {
    expect(reservationPriceBreakdown({ unit_price: 4500, participant_count: 2, total_price: 9000, discount_amount: 1000, final_price: 8000 }))
      .toEqual({ unitPrice: 4500, participantCount: 2, subtotal: 9000, discount: 1000, total: 8000 })
  })
  it('割引なしは単価×人数と合計が一致', () => {
    expect(reservationPriceBreakdown({ unit_price: 4500, participant_count: 3, final_price: 13500 })).toMatchObject({ subtotal: 13500, discount: 0, total: 13500 })
  })
  it('全額割引の 0 円を割引前に戻さない', () => {
    expect(reservationPriceBreakdown({ unit_price: 4500, participant_count: 1, discount_amount: 4500, final_price: 0 })).toMatchObject({ discount: 4500, total: 0 })
  })
  it('final_price が無い旧予約は保存済みの割引を引く', () => {
    expect(reservationPriceBreakdown({ unit_price: 4500, participant_count: 2, discount_amount: 1000, final_price: null })).toMatchObject({ discount: 1000, total: 8000 })
  })
})

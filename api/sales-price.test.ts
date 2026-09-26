import { expect, it, vi } from 'vitest'
vi.mock('./_lib/db.js', () => ({ db: {}, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', () => ({ requireAuth: vi.fn(), requireAdmin: vi.fn(), requireStaff: vi.fn(), ApiError: class extends Error {} }))
import { getReservationRevenue } from './sales'
it('全額割引の確定金額0円を売上0円として扱う', () => {
  expect(getReservationRevenue({ reservation_source: 'web', unit_price: 3000, total_price: 6000, final_price: 0 }, 2, 3000)).toBe(0)
  expect(getReservationRevenue({ reservation_source: 'web', unit_price: 3000, total_price: 6000, final_price: 5000 }, 2, 3000)).toBe(5000)
})
it('final_price未設定だけ合計金額へフォールバックする', () => {
  expect(getReservationRevenue({ reservation_source: 'web', unit_price: 3000, total_price: 6000, final_price: null }, 2, 3000)).toBe(6000)
  expect(getReservationRevenue({ reservation_source: 'web', unit_price: 3000, total_price: null, final_price: null }, 2, 3000)).toBe(6000)
})

it('旧貸切の初期値0円は、割引なしと確認できる場合だけ保存済み合計を使う', () => {
  const legacy = { reservation_source: 'web_private', unit_price: null, total_price: 40000, final_price: 0, discount_amount: 0 }
  expect(getReservationRevenue(legacy, 8, 9999)).toBe(40000)
  expect(getReservationRevenue({ ...legacy, discount_amount: 40000 }, 8, 5000)).toBe(0)
  expect(getReservationRevenue({ ...legacy, discount_amount: null }, 8, 5000)).toBe(0)
  expect(getReservationRevenue({ ...legacy, reservation_source: 'web' }, 8, 5000)).toBe(0)
  expect(getReservationRevenue({ ...legacy, final_price: 35000, discount_amount: 5000 }, 8, 5000)).toBe(35000)
})
it('大宮8月の貸切4件と公開2件を合計すると222500円になる', () => {
  const privateRevenue = Array.from({ length: 4 }, () => getReservationRevenue({
    reservation_source: 'web_private', unit_price: null, total_price: 40000,
    final_price: 0, discount_amount: 0,
  }, 8, 5000)).reduce((sum, amount) => sum + amount, 0)
  expect(privateRevenue + 40000 + 22500).toBe(222500)
})

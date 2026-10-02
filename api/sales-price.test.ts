import { expect, it, vi } from 'vitest'
vi.mock('./_lib/db.js', () => ({ db: {}, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', () => ({ requireAuth: vi.fn(), requireAdmin: vi.fn(), requireStaff: vi.fn(), ApiError: class extends Error {} }))
import { getReservationRevenue } from './sales'
it('final_price（確定金額）が正本。全額割引の0円も0円', () => {
  expect(getReservationRevenue({ reservation_source: 'web', unit_price: 3000, total_price: 6000, final_price: 0 }, 2, 3000)).toBe(0)
  expect(getReservationRevenue({ reservation_source: 'web', unit_price: 3000, total_price: 6000, final_price: 5000 }, 2, 3000)).toBe(5000)
  // 当日受付・demo も final_price があればそれを使う
  expect(getReservationRevenue({ reservation_source: 'walk_in', unit_price: 3000, total_price: 6000, final_price: 5500 }, 2, 3000)).toBe(5500)
})
it('final_price が無い予約だけフォールバックする', () => {
  expect(getReservationRevenue({ reservation_source: 'web', unit_price: 3000, total_price: 6000, final_price: null }, 2, 3000)).toBe(6000)
  expect(getReservationRevenue({ reservation_source: 'web', unit_price: 3000, total_price: null, final_price: null }, 2, 3000)).toBe(6000)
  expect(getReservationRevenue({ reservation_source: 'walk_in', unit_price: 3500, total_price: null, final_price: null }, 2, 3000)).toBe(7000)
  expect(getReservationRevenue({ reservation_source: 'demo', unit_price: null, total_price: null, final_price: null }, 2, 3000)).toBe(6000)
})
it('旧貸切は migration で final_price に揃えたので特例なし（final_price をそのまま使う）', () => {
  const legacy = { reservation_source: 'web_private', unit_price: null, total_price: 40000, final_price: 40000, discount_amount: 0 }
  expect(getReservationRevenue(legacy, 8, 9999)).toBe(40000)
  expect(getReservationRevenue({ ...legacy, final_price: 35000, discount_amount: 5000 }, 8, 5000)).toBe(35000)
  expect(getReservationRevenue({ ...legacy, final_price: 0, discount_amount: 40000 }, 8, 5000)).toBe(0)
})
it('大宮8月の貸切4件と公開2件を合計すると222500円になる', () => {
  const privateRevenue = Array.from({ length: 4 }, () => getReservationRevenue({
    reservation_source: 'web_private', unit_price: null, total_price: 40000,
    final_price: 40000, discount_amount: 0,
  }, 8, 5000)).reduce((sum, amount) => sum + amount, 0)
  expect(privateRevenue + 40000 + 22500).toBe(222500)
})

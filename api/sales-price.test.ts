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

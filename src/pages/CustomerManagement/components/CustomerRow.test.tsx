// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Customer } from '@/types'
const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api/couponApi', () => ({ getCustomerCouponUsages: mocks.get }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/components/ui/DevField', () => ({ devDb: () => ({}) }))
vi.mock('./CustomerPlayedManager', () => ({ CustomerPlayedManager: () => null }))
vi.mock('./CustomerCouponManager', () => ({ CustomerCouponManager: () => null }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) } }))
import { CustomerRow } from './CustomerRow'
let root: Root, host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
async function render() {
  await act(async () => root.render(<CustomerRow customer={{ id: 'customer', name: '検証顧客' } as Customer} isExpanded onToggleExpand={() => {}} onEdit={() => {}} couponStats={{ total_coupons: 1, used_coupons: 1, remaining_coupons: 1 }} />))
}
it('読込中は履歴なしと表示せず、APIの履歴を表示する', async () => {
  let resolve!: (value: unknown) => void
  mocks.get.mockReturnValue(new Promise(done => { resolve = done }))
  await render()
  expect(host.textContent).toContain('使用履歴を読み込み中')
  expect(host.textContent).not.toContain('使用履歴なし')
  await act(async () => resolve([{ id: 'usage', used_at: '2026-09-25T00:00:00Z', discount_amount: 1000, reservation: { id: 'reservation', title: '履歴の作品' } }]))
  expect(host.textContent).toContain('履歴の作品')
  expect(mocks.get).toHaveBeenCalledWith('customer')
})
it('履歴取得失敗を明示して再試行できる', async () => {
  mocks.get.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([])
  await render()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('使用履歴を取得できませんでした')
  expect(host.textContent).not.toContain('使用履歴なし')
  const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent === '再試行')!
  await act(async () => retry.click())
  expect(mocks.get).toHaveBeenCalledTimes(2)
  expect(host.textContent).toContain('使用履歴なし')
  expect(host.querySelector('[role="alert"]')).toBeNull()
})

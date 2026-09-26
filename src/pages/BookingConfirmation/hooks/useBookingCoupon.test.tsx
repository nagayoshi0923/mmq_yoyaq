// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/apiClient', () => ({ apiClient: api }))
import { useBookingCoupon } from './useBookingCoupon'
let root: Root, host: HTMLDivElement, client: QueryClient
let current: ReturnType<typeof useBookingCoupon>
function Probe() { current = useBookingCoupon('user', 'event', 2); return <span>{current.couponReady ? 'ready' : 'pending'}:{current.couponDiscount}</span> }
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  api.get.mockResolvedValue([{ id: 'coupon' }])
  api.post.mockResolvedValue({ success: true, total_price: 5000, discount_amount: 5000, final_price: 0 })
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 300000, refetchOnMount: false, retry: false } } })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)); await flush()
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove() })
it('確定失敗後、同じクーポンの再選択では以前の割引を使わず再検証する', async () => {
  await act(async () => current.setSelectedCouponId('coupon')); await flush()
  expect(current.couponReady).toBe(true); expect(current.couponDiscount).toBe(5000)
  expect(api.post).toHaveBeenCalledTimes(1)
  await act(async () => current.resetAfterFailure()); await flush()
  expect(current.selectedCouponId).toBeNull()
  let resolve!: (value: unknown) => void
  api.post.mockReturnValueOnce(new Promise(done => { resolve = done }))
  await act(async () => current.setSelectedCouponId('coupon')); await flush()
  expect(api.post).toHaveBeenCalledTimes(2)
  expect(current.couponReady).toBe(false); expect(current.couponDiscount).toBe(0)
  await act(async () => resolve({ success: false, total_price: 5000, discount_amount: 0, final_price: 5000 })); await flush()
  expect(current.couponReady).toBe(false); expect(current.couponDiscount).toBe(0)
})

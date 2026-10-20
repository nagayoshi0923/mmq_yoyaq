// @vitest-environment jsdom
// マイページ › クーポンの「この予約に使う」は公演当日（日本時間）だけ押せる（20261020190000）
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ use: vi.fn(), preview: vi.fn(), reservations: [] as unknown[] }))
vi.mock('@/utils/toast', () => ({ showToast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api/couponApi', () => ({ previewCouponUse: mock.preview }))
vi.mock('../hooks/useCouponsQuery', () => ({
  useCouponsQuery: () => ({ data: [coupon], isLoading: false, refetch: vi.fn(), isFetching: false }),
  useCurrentReservationsQuery: () => ({ data: mock.reservations, isLoading: false, isError: false, refetch: vi.fn() }),
  useUseCouponMutation: () => ({ mutateAsync: mock.use, isPending: false }),
  useRedeemCouponUsageMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
import { showToast } from '@/utils/toast'
import { CouponsPage } from './CouponsPage'

const coupon = {
  id: 'coupon', organization_id: 'org', campaign_id: 'campaign', customer_id: 'customer', uses_remaining: 1, status: 'active',
  expires_at: '2099-01-01T14:59:59Z', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  coupon_campaigns: { id: 'campaign', name: '500円クーポン', combinable: true, same_scenario_once: false, discount_type: 'fixed', discount_amount: 500, max_uses_per_customer: 1 },
}
const reservation = (id: string, date: string, title: string) =>
  ({ id, scenario_title: title, organization_id: 'org', murder_mystery_eligible: true, store_name: '架空店舗', date, time: '13:00' })

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  // 今は 2026-10-20 12:00（日本時間）
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T03:00:00Z'))
  vi.clearAllMocks()
  mock.preview.mockResolvedValue({ success: true, discount_amount: 500 })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })

const useButton = () => [...host.querySelectorAll('button')].find(b => b.textContent === 'この予約に使う') as HTMLButtonElement | undefined
async function openDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(<QueryClientProvider client={client}><CouponsPage /></QueryClientProvider>))
  const card = [...host.querySelectorAll('span')].find(s => s.textContent === 'タップして使う')!.closest('[class*="cursor-pointer"]')!
  await act(async () => card.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  // 割引額の確認（当日の予約だけ）が返るまで待つ
  for (let i = 0; i < 20 && mock.preview.mock.calls.length > 0 && !host.textContent?.includes('今回の割引額'); i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  }
}

describe('この予約に使う（予約後のクーポン使用）', () => {
  it('公演当日の予約なら割引額を確かめて押せる', async () => {
    mock.reservations = [reservation('today', '2026-10-20', '今日の公演')]
    mock.use.mockResolvedValue({ success: true })
    await openDialog()
    expect(host.textContent).toContain('今日の公演')
    expect(host.textContent).not.toContain('公演当日に使えます')
    expect(host.textContent).toContain('今回の割引額：¥500')
    expect(useButton()?.disabled).toBe(false)
    await act(async () => useButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(mock.use).toHaveBeenCalledWith({ couponId: 'coupon', reservationId: 'today' })
  })

  it('公演当日でない予約（明日）は押せず「公演当日に使えます（M/D）」を出す。割引額の確認もしない', async () => {
    mock.reservations = [reservation('tomorrow', '2026-10-21', '明日の公演')]
    await openDialog()
    expect(host.querySelector('[data-testid="coupon-use-not-today"]')?.textContent).toBe('公演当日に使えます（10/21）')
    expect(useButton()?.disabled).toBe(true)
    expect(mock.preview).not.toHaveBeenCalled()
  })

  it('候補が複数なら、当日でない予約にだけ使える日を添える', async () => {
    mock.reservations = [reservation('today', '2026-10-20', '今日の公演'), reservation('later', '2026-11-03', '先の公演')]
    await openDialog()
    const notes = [...host.querySelectorAll('p')].filter(p => p.textContent?.startsWith('公演当日に使えます'))
    expect(notes.map(p => p.textContent)).toEqual(['公演当日に使えます（11/3）'])
  })

  it('サーバーが公演当日でないと断ったら、日本語で使える日を出す', async () => {
    mock.reservations = [reservation('today', '2026-10-20', '今日の公演')]
    mock.use.mockResolvedValue({ success: false, error: '公演当日にお使いください', code: 'not_performance_day' })
    await openDialog()
    await act(async () => useButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(showToast.error).toHaveBeenCalledWith('クーポンは公演当日（10/20）にお使いください')
  })

  it('ほかの理由で断られたらサーバーの文言をそのまま出す', async () => {
    mock.reservations = [reservation('today', '2026-10-20', '今日の公演')]
    mock.use.mockResolvedValue({ success: false, error: '対象店舗ではありません', code: 'P0028' })
    await openDialog()
    await act(async () => useButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(showToast.error).toHaveBeenCalledWith('対象店舗ではありません')
  })
})

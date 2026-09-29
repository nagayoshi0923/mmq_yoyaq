// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Customer } from '@/types'
const mocks = vi.hoisted(() => ({ get: vi.fn(), history: vi.fn() }))
vi.mock('@/lib/api/couponApi', () => ({ getCustomerCouponUsages: mocks.get }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/components/ui/DevField', () => ({ devDb: () => ({}) }))
vi.mock('./CustomerPlayedManager', () => ({ CustomerPlayedManager: () => null }))
vi.mock('./CustomerCouponManager', () => ({ CustomerCouponManager: () => null }))
vi.mock('@/lib/api/customerApi', () => ({ customerApi: { reservationHistory: mocks.history } }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) } }))
import { CustomerRow } from './CustomerRow'
let root: Root, host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.resetAllMocks(); mocks.get.mockResolvedValue([]); mocks.history.mockResolvedValue([]); host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
async function render(id = 'customer') {
  await act(async () => root.render(<CustomerRow customer={{ id, name: '検証顧客' } as Customer} isExpanded onToggleExpand={() => {}} onEdit={() => {}} couponStats={{ total_coupons: 1, used_coupons: 1, remaining_coupons: 1 }} />))
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

it('予約取得失敗を履歴なしとして扱わず再試行する', async () => {
  mocks.history.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([])
  await render()
  expect(host.textContent).toContain('予約履歴を取得できませんでした')
  expect(host.textContent).not.toContain('予約履歴がありません')
  const retry = host.querySelector('[role="alert"] button') as HTMLButtonElement
  await act(async () => retry.click())
  expect(mocks.history).toHaveBeenCalledTimes(2)
  expect(host.textContent).toContain('予約履歴がありません')
})
it('顧客切替後に古い予約・クーポンの応答を表示しない', async () => {
  let oldHistory!: (value: unknown) => void
  let oldCoupon!: (value: unknown) => void
  mocks.history.mockImplementationOnce(() => new Promise(resolve => { oldHistory=resolve })).mockResolvedValueOnce([])
  mocks.get.mockImplementationOnce(() => new Promise(resolve => { oldCoupon=resolve })).mockResolvedValueOnce([])
  await render('old'); await render('new')
  await act(async () => {
    oldHistory([{ id: 'old', title: '旧組織の履歴', requested_datetime: '2026-09-25T00:00:00Z', participant_count: 1, final_price: 1000, status: 'confirmed' }])
    oldCoupon([{ id: 'old', used_at: '2026-09-25T00:00:00Z', discount_amount: 1000, reservation: { id: 'old', title: '旧クーポン' } }])
  })
  expect(host.textContent).not.toContain('旧組織の履歴')
  expect(host.textContent).not.toContain('旧クーポン')
  expect(mocks.history).toHaveBeenLastCalledWith('new')
})
it.each([null, 0, 2500])('累計予約金額の未確認と実際の0円を区別する: %s', async amount => {
  await act(async () => root.render(<CustomerRow customer={{ id:'amount', name:'金額確認', total_spent:amount } as Customer} isExpanded={false} onToggleExpand={() => {}} onEdit={() => {}} />))
  if (amount === null) expect(host.textContent).toContain('要確認')
  else {
    expect(host.textContent).not.toContain('要確認')
    expect(host.textContent).toContain(amount.toLocaleString('ja-JP'))
  }
})
it('他組織所有の顧客（canEdit=false）には編集操作を出さない', async () => {
  const editButtons = () => [...host.querySelectorAll('button')].filter(b => b.getAttribute('aria-label') === '編集' || b.textContent?.includes('編集'))
  await render()
  expect(editButtons().length).toBeGreaterThan(0)
  await act(async () => root.render(<CustomerRow customer={{ id: 'foreign', name: '他組織顧客', organization_id: 'org-b' } as Customer} isExpanded={false} onToggleExpand={() => {}} onEdit={() => {}} canEdit={false} />))
  expect(editButtons()).toHaveLength(0)
})

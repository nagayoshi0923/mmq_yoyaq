// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/utils/toast', () => ({ showToast: { success: vi.fn(), error: vi.fn() } }))
import { AppliedCouponsSection } from './AppliedCouponsSection'
import type { AppliedCouponCard } from '../utils/appliedCoupons'

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const card: AppliedCouponCard = {
  usageId: 'u1', couponId: 'c1', campaignName: '初回クーポン', discountAmount: 500,
  reservationTitle: '架空作品', storeName: '高田馬場店', startsAt: '2026-10-20T04:00:00Z', redeemedAt: null,
}
const buttonByText = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))

describe('この予約に適用済みのクーポン', () => {
  it('予約が無ければ何も出さない', async () => {
    await act(async () => root.render(<AppliedCouponsSection cards={[]} onRedeem={vi.fn()} redeeming={false} />))
    expect(host.textContent).toBe('')
  })
  it('公演名・日時・割引額と未確認の「もぎる（来店確認）」を出し、確認してから押す', async () => {
    const onRedeem = vi.fn().mockResolvedValue({ success: true })
    await act(async () => root.render(<AppliedCouponsSection cards={[card]} onRedeem={onRedeem} redeeming={false} />))
    expect(host.textContent).toContain('この予約に適用済み')
    expect(host.textContent).toContain('架空作品')
    expect(host.textContent).toContain('¥500 OFF')
    expect(host.textContent).toContain('10月20日')
    expect(host.textContent).toContain('13:00〜')
    expect(host.textContent).toContain('来店確認: 未確認')
    await act(async () => buttonByText('もぎる（来店確認）')!.click())
    expect(onRedeem).not.toHaveBeenCalled()
    expect(host.textContent).toContain('押しても新たにクーポンは使われません')
    await act(async () => [...host.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === 'もぎる')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onRedeem).toHaveBeenCalledWith('u1')
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })
  it('キャンセルでは記録しない', async () => {
    const onRedeem = vi.fn()
    await act(async () => root.render(<AppliedCouponsSection cards={[card]} onRedeem={onRedeem} redeeming={false} />))
    await act(async () => buttonByText('もぎる（来店確認）')!.click())
    await act(async () => buttonByText('キャンセル')!.click())
    expect(onRedeem).not.toHaveBeenCalled()
  })
  it('来店確認済みは押せず、確認済みと時刻を出す', async () => {
    await act(async () => root.render(<AppliedCouponsSection cards={[{ ...card, redeemedAt: '2026-10-20T03:50:00Z' }]} onRedeem={vi.fn()} redeeming={false} />))
    expect(host.querySelector('[data-testid="applied-coupon-redeemed"]')?.textContent).toContain('来店時に確認済み')
    expect(buttonByText('もぎる')).toBeUndefined()
  })
})

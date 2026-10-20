// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/utils/toast', () => ({ showToast: { success: vi.fn(), error: vi.fn() } }))
import { showToast } from '@/utils/toast'
import { AppliedCouponsSection, isPerformanceDay } from './AppliedCouponsSection'
import type { AppliedCouponCard } from '../utils/appliedCoupons'

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  // 今は 2026-10-20 12:00（日本時間）。カードの公演は同じ日の 13:00
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T03:00:00Z'))
  vi.mocked(showToast.error).mockClear()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })

const card: AppliedCouponCard = {
  usageId: 'u1', couponId: 'c1', campaignName: '初回クーポン', discountAmount: 500,
  reservationTitle: '架空作品', storeName: '高田馬場店', startsAt: '2026-10-20T04:00:00Z', performanceDate: '2026-10-20', redeemedAt: null,
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
  it('公演当日でなければ「もぎる」を押せず、押せる日を出す', async () => {
    const onRedeem = vi.fn()
    await act(async () => root.render(<AppliedCouponsSection cards={[{ ...card, startsAt: '2026-10-21T04:00:00Z', performanceDate: '2026-10-21' }]} onRedeem={onRedeem} redeeming={false} />))
    expect(host.querySelector('[data-testid="applied-coupon-not-today"]')?.textContent).toContain('公演当日に押せます（10/21）')
    const button = buttonByText('もぎる（来店確認）')!
    expect(button.disabled).toBe(true)
    await act(async () => button.click())
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(onRedeem).not.toHaveBeenCalled()
  })
  it('公演当日なら「公演当日に押せます」は出さず、押せる', async () => {
    await act(async () => root.render(<AppliedCouponsSection cards={[card]} onRedeem={vi.fn()} redeeming={false} />))
    expect(host.textContent).not.toContain('公演当日に押せます')
    expect(buttonByText('もぎる（来店確認）')!.disabled).toBe(false)
  })
  it('当日かどうかは公演の日付で決める（開始日時が別の日を指していても公演日が今日なら押せる）', async () => {
    // requested_datetime に予約を作った時刻が入っていた予約（staging で 31 件）を想定
    await act(async () => root.render(<AppliedCouponsSection cards={[{ ...card, startsAt: '2026-09-19T03:28:00Z', performanceDate: '2026-10-20' }]} onRedeem={vi.fn()} redeeming={false} />))
    expect(host.textContent).not.toContain('公演当日に押せます')
    expect(buttonByText('もぎる（来店確認）')!.disabled).toBe(false)
  })
  it('サーバーが「公演当日ではない」と断ったら日本語で押せる日を伝える', async () => {
    const onRedeem = vi.fn().mockResolvedValue({ success: false, error: '公演当日に押してください', code: 'not_performance_day' })
    await act(async () => root.render(<AppliedCouponsSection cards={[card]} onRedeem={onRedeem} redeeming={false} />))
    await act(async () => buttonByText('もぎる（来店確認）')!.click())
    await act(async () => [...host.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === 'もぎる')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(showToast.error).toHaveBeenCalledWith('来店確認は公演当日（10/20）に押してください')
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('公演当日の判定（日本時間）', () => {
  it('日本時間の日付で比べる', () => {
    const now = new Date('2026-10-20T14:30:00Z') // 10/20 23:30 JST
    expect(isPerformanceDay('2026-10-20T00:00:00+09:00', now)).toBe(true)
    expect(isPerformanceDay('2026-10-20T15:00:00Z', now)).toBe(false) // 10/21 0:00 JST
    expect(isPerformanceDay('2026-10-19T14:59:00Z', now)).toBe(false) // 10/19 23:59 JST
    expect(isPerformanceDay('2099-01-01T04:00:00Z', now)).toBe(false)
  })
  it('公演の日付（YYYY-MM-DD）はそのまま日本時間の日付として比べる', () => {
    expect(isPerformanceDay('2026-10-20', new Date('2026-10-19T15:00:00Z'))).toBe(true) // 10/20 0:00 JST
    expect(isPerformanceDay('2026-10-20', new Date('2026-10-20T14:59:00Z'))).toBe(true) // 10/20 23:59 JST
    expect(isPerformanceDay('2026-10-20', new Date('2026-10-20T15:00:00Z'))).toBe(false) // 10/21 0:00 JST
    expect(isPerformanceDay('2026-10-20', new Date('2026-10-19T14:59:00Z'))).toBe(false) // 10/19 23:59 JST
  })
})

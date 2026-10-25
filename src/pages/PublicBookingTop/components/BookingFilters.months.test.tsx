// @vitest-environment jsdom
// カレンダー・リストの月送り: 予約を受け付けている公開の公演がある最後の月まで進める（2026-10-25 社長報告「12 月以降に切り替えられない」）
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BookingFilters } from './BookingFilters'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T10:00:00+09:00')) })
afterEach(() => { vi.useRealTimers() })

function nav(currentMonth: Date, lastMonth?: Date | null) {
  const html = renderToStaticMarkup(
    <BookingFilters currentMonth={currentMonth} onMonthChange={() => {}} selectedStoreIds={[]} onStoreIdsChange={() => {}} storeOptions={[]} primaryColor="#E60012" lastMonth={lastMonth} />,
  )
  // class の「disabled:opacity-30」ではなく、disabled="" の属性だけを見る
  const disabled = (label: string) => new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0].includes('disabled=""') ?? false
  return { next: !disabled('次の月'), prev: !disabled('前の月') }
}

describe('月送りの範囲', () => {
  it('既定（lastMonth なし）は今月から 3 か月: 12 月で次へ進めない（従来どおり）', () => {
    expect(nav(new Date(2026, 11, 1)).next).toBe(false)
  })
  it('最後の公開公演が 2027/2/7 なら 12 月 → 1 月 → 2 月まで進め、2 月で止まる。前の月へは戻れる', () => {
    const last = new Date(2027, 1, 1)
    expect(nav(new Date(2026, 11, 1), last).next).toBe(true)
    expect(nav(new Date(2027, 0, 1), last).next).toBe(true)
    expect(nav(new Date(2027, 1, 1), last)).toEqual({ next: false, prev: true })
  })
  it('今月より前へは戻れない', () => {
    expect(nav(new Date(2026, 9, 1), new Date(2027, 1, 1)).prev).toBe(false)
  })
})

// 公演を読む期間の計算（2026-10-25 社長報告「カレンダーが 12 月以降に切り替えられない」・「もっと見る」）
import { describe, expect, it } from 'vitest'
import { browseLimits, defaultBookingRangeEnd, extraMonthsToLoad, monthEnd, monthsBetween, requiredUntil, uniqueById } from './bookingRange'

describe('最初に読む期間と読み足す月', () => {
  it('最初は今月を含む 3 か月（10/25 なら 12/31、12 月なら翌年 2 月末、うるう年）', () => {
    expect(defaultBookingRangeEnd('2026-10-25')).toBe('2026-12-31')
    expect(defaultBookingRangeEnd('2026-12-01')).toBe('2027-02-28')
    expect(defaultBookingRangeEnd('2027-12-31')).toBe('2028-02-29')
  })
  it('月末・月の並び', () => {
    expect(monthEnd('2027-02')).toBe('2027-02-28')
    expect(monthsBetween('2026-11-15', '2027-02-07')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
  it('読んだ期間より先が要る月だけ読み足す（12 月まで読んだ状態で 2 月を開くと 1 月・2 月）', () => {
    expect(extraMonthsToLoad('2026-12-31', '2027-02-28')).toEqual(['2027-01', '2027-02'])
    expect(extraMonthsToLoad('2026-12-31', '2026-12-31')).toEqual([])
    expect(extraMonthsToLoad('2026-12-31', '2026-11-30')).toEqual([])
    expect(extraMonthsToLoad('2026-12-31', null)).toEqual([])
  })
  it('最初の取得に失敗した（読めた期間の終わり＝昨日）なら、今月から読み足す', () => {
    expect(extraMonthsToLoad('2026-10-24', '2026-11-30')).toEqual(['2026-10', '2026-11'])
  })
})

describe('月送り・「もっと見る」の上限', () => {
  it('予約を受け付けている公開の公演がある最後の月まで（2/7 → 2027-02）', () => {
    expect(browseLimits('2026-10-25', '2026-12-31', '2027-02-07', false)).toEqual({ lastMonth: '2027-02', moreUntil: '2027-02-07' })
  })
  it('その日が最初の 3 か月より前（札幌 11/28）でも、最初の 3 か月までは進める', () => {
    expect(browseLimits('2026-10-25', '2026-12-31', '2026-11-28', false)).toEqual({ lastMonth: '2026-12', moreUntil: '2026-11-28' })
  })
  it('公開の公演が無ければ最初の 3 か月まで、「もっと見る」は出さない', () => {
    expect(browseLimits('2026-10-25', '2026-12-31', null, false)).toEqual({ lastMonth: '2026-12', moreUntil: null })
  })
  it('その日を読めなかったら狭めない（今月から 12 か月まで。月ごとに読むので取りすぎない）', () => {
    expect(browseLimits('2026-10-25', '2026-12-31', null, true)).toEqual({ lastMonth: '2027-09', moreUntil: '2027-09-30' })
  })
  it('要る期間はカードの終わりと表示中の月末の遅い方で、最後の月を超えない', () => {
    expect(requiredUntil({ cardsUntil: '2026-11-23', visibleMonth: null, lastMonth: '2027-02' })).toBe('2026-11-23')
    expect(requiredUntil({ cardsUntil: null, visibleMonth: '2027-01', lastMonth: '2027-02' })).toBe('2027-01-31')
    expect(requiredUntil({ cardsUntil: '2027-06-01', visibleMonth: null, lastMonth: '2027-02' })).toBe('2027-02-28')
    expect(requiredUntil({ cardsUntil: null, visibleMonth: null, lastMonth: '2027-02' })).toBeNull()
  })
})

describe('最初の取得と月ごとの取得をつなぐ', () => {
  it('同じ id は 1 件にする（最初の取得を優先）', () => {
    const a = [{ id: 'x', v: 1 }, { id: 'y', v: 1 }]
    const b = [{ id: 'y', v: 2 }, { id: 'z', v: 2 }]
    expect(uniqueById(a, b)).toEqual([{ id: 'x', v: 1 }, { id: 'y', v: 1 }, { id: 'z', v: 2 }])
    expect(uniqueById(a, [])).toBe(a)
  })
})

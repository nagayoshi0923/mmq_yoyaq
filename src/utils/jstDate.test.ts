import { describe, expect, it } from 'vitest'
import { jstMonthDateRange } from './jstDate'

describe('jstMonthDateRange', () => {
  it('7月は 7/1〜7/31（toISOString だと 6/30〜7/30 になる）', () => {
    expect(jstMonthDateRange(2026, 7)).toEqual({
      start: '2026-07-01',
      end: '2026-07-31',
    })
  })

  it('平年2月は 2/28、うるう年2月は 2/29', () => {
    expect(jstMonthDateRange(2026, 2)).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    })
    expect(jstMonthDateRange(2024, 2)).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
    })
  })

  it('1月と12月も暦月のまま', () => {
    expect(jstMonthDateRange(2026, 1)).toEqual({
      start: '2026-01-01',
      end: '2026-01-31',
    })
    expect(jstMonthDateRange(2026, 12)).toEqual({
      start: '2026-12-01',
      end: '2026-12-31',
    })
  })
})

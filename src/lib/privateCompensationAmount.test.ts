import { describe, it, expect } from 'vitest'
import { compensationAmount } from '../../api/_lib/privateCouponClaims'
describe('GM cancellation compensation timing', () => {
  it('includes exactly two hours in the highest tier', () => {
    expect(compensationAmount('2026-09-08T19:00:00+09:00','2026-09-08T17:00:00+09:00')).toBe(5000)
    expect(compensationAmount('2026-09-08T19:00:00+09:00','2026-09-08T16:59:59+09:00')).toBe(2000)
  })
  it('uses Japanese calendar days for the previous-day tier', () => {
    expect(compensationAmount('2026-09-08T10:00:00+09:00','2026-09-07T23:59:00+09:00')).toBe(1000)
    expect(compensationAmount('2026-09-08T10:00:00+09:00','2026-09-08T00:00:00+09:00')).toBe(2000)
  })
  it('holds undefined timing rather than inventing an amount', () => {
    expect(compensationAmount('2026-09-08T10:00:00+09:00','2026-09-06T23:59:00+09:00')).toBeNull()
    expect(compensationAmount('bad','bad')).toBeNull()
    expect(compensationAmount('2026-09-08T10:00:00+09:00','2026-09-08T10:01:00+09:00')).toBeNull()
  })
})

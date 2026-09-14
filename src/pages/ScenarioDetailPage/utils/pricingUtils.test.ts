import { describe, expect, it } from 'vitest'
import { calculateParticipationFee, isWeekendOrHoliday } from './pricingUtils'
import { buildPrice } from '../../../../api/_lib/publicScenario'

const costs = [
  { time_slot: 'normal', amount: 4500, type: 'fixed' as const },
  { time_slot: 'weekend', amount: 5000, type: 'fixed' as const },
  { time_slot: 'gmtest', amount: 3500, type: 'fixed' as const },
]

describe('QW-20260914-003 weekday/weekend pricing', () => {
  it.each([['2026-09-11',4500], ['2026-09-12',5000], ['2026-09-13',5000], ['2026-09-14',4500], ['2026-09-21',5000]])('date %s resolves %i', (date, fee) => {
    expect(calculateParticipationFee(4500,costs,date,undefined,'14:00')).toBe(fee)
  })
  it('uses custom holidays and the same public display prices', () => {
    expect(calculateParticipationFee(4500,costs,'2026-09-15', date => date === '2026-09-15')).toBe(5000)
    expect(buildPrice(costs,4500)).toEqual({normal:4500,display:'平日4,500円 / 土日祝5,000円'})
  })
  it('preserves time slot fallback without replacing weekend prices', () => {
    const extra = [...costs,{time_slot:'afternoon',amount:4700,type:'fixed' as const}]
    expect(calculateParticipationFee(4500,extra,'2026-09-12',undefined,'14:00')).toBe(5000)
    expect(calculateParticipationFee(4500,extra,'2026-09-14',undefined,'14:00')).toBe(4700)
  })
  it('classifies calendar dates independently of the runtime timezone', () => {
    expect(isWeekendOrHoliday('2026-09-12')).toBe(true)
    expect(isWeekendOrHoliday('2026-09-14')).toBe(false)
  })
  it('does not apply a future or expired weekend tariff', () => {
    for (const period of [{startDate:'2099-01-01'},{endDate:'2000-01-01'}]) {
      expect(calculateParticipationFee(4500,[{...costs[1],...period}],'2026-09-12')).toBe(4500)
    }
  })
})

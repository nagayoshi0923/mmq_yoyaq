import { describe, it, expect } from 'vitest'
import { calculatePrivateCandidateFees } from '../pages/ScenarioDetailPage/utils/pricingUtils'
import { formatPrivateBookingQuoteTotal } from '../../supabase/functions/_shared/privateBookingQuote'
const costs = [{time_slot:'normal',amount:5000,type:'fixed' as const},{time_slot:'weekend',amount:5500,type:'fixed' as const}]
describe('Monochrome private booking prices', () => {
  it('shows 30,000 weekday / 33,000 weekend for six people, preserving candidate order', () => {
    const fees = calculatePrivateCandidateFees(5000,costs,[
      {date:'2026-09-14',slot:{startTime:'14:00'}},
      {date:'2026-09-19',slot:{startTime:'14:00'}},
    ])
    expect(fees).toEqual([5000,5500])
    expect(formatPrivateBookingQuoteTotal(30000,fees.map(fee => ({totalPrice:fee*6})))).toBe('30,000〜33,000')
  })
  it('does not show a range for all-weekend candidates, including custom holidays', () => {
    const fees = calculatePrivateCandidateFees(5000,costs,[
      {date:'2026-09-19',slot:{startTime:'14:00'}},
      {date:'2026-09-15',slot:{startTime:'14:00'}},
    ], date => date==='2026-09-15')
    expect(fees).toEqual([5500,5500])
    expect(formatPrivateBookingQuoteTotal(33000,fees.map(fee=>({totalPrice:fee*6})))).toBe('33,000')
  })
  it('preserves zero and legacy saved totals without candidate quotes', () => {
    expect(formatPrivateBookingQuoteTotal(0,[])).toBe('0')
    expect(formatPrivateBookingQuoteTotal(30000,[{date:'2026-09-19'}])).toBe('30,000')
  })
})

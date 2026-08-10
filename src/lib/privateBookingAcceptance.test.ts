import { describe, expect, it } from 'vitest'
import { isScenarioAcceptingPrivateBooking } from './privateBookingAcceptance'

describe('isScenarioAcceptingPrivateBooking', () => {
  it('未設定は受付中とみなす', () => {
    expect(isScenarioAcceptingPrivateBooking({})).toBe(true)
  })

  it('accepts_private_booking=false は拒否', () => {
    expect(isScenarioAcceptingPrivateBooking({ accepts_private_booking: false })).toBe(false)
  })

  it('scenario_kind=offsite_only は拒否', () => {
    expect(isScenarioAcceptingPrivateBooking({ scenario_kind: 'offsite_only' })).toBe(false)
  })

  it('ON + regular は受付', () => {
    expect(
      isScenarioAcceptingPrivateBooking({
        accepts_private_booking: true,
        scenario_kind: 'regular',
      })
    ).toBe(true)
  })
})

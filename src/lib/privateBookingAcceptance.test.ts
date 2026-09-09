import { describe, expect, it } from 'vitest'
import { isScenarioAcceptingPrivateBooking } from './privateBookingAcceptance'

describe('isScenarioAcceptingPrivateBooking', () => {
  it('未設定は従来どおり受付可とみなす', () => {
    expect(isScenarioAcceptingPrivateBooking({})).toBe(true)
    expect(isScenarioAcceptingPrivateBooking({ accepts_private_booking: true })).toBe(true)
  })

  it('貸切受付OFFは拒否する', () => {
    expect(isScenarioAcceptingPrivateBooking({ accepts_private_booking: false })).toBe(false)
  })

  it('出張公演限定は拒否する', () => {
    expect(
      isScenarioAcceptingPrivateBooking({
        accepts_private_booking: true,
        scenario_kind: 'offsite_only',
      }),
    ).toBe(false)
  })

  it('null/undefined は拒否する', () => {
    expect(isScenarioAcceptingPrivateBooking(null)).toBe(false)
    expect(isScenarioAcceptingPrivateBooking(undefined)).toBe(false)
  })
})

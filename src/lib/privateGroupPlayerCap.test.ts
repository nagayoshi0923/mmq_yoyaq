import { describe, expect, it } from 'vitest'
import { resolvePrivateGroupBookingParticipantCount } from './privateGroupPlayerCap'

describe('resolvePrivateGroupBookingParticipantCount', () => {
  it('uses scenario max so later members can still join', () => {
    expect(
      resolvePrivateGroupBookingParticipantCount({
        scenarioPlayerMax: 8,
        targetParticipantCount: null,
      })
    ).toBe(8)
  })

  it('does not use the current joined count', () => {
    expect(
      resolvePrivateGroupBookingParticipantCount({
        scenarioPlayerMax: 8,
        targetParticipantCount: 6,
      })
    ).toBe(8)
  })

  it('falls back to target when scenario max is missing', () => {
    expect(
      resolvePrivateGroupBookingParticipantCount({
        scenarioPlayerMax: null,
        targetParticipantCount: 7,
      })
    ).toBe(7)
  })

  it('falls back to 1 when nothing is set', () => {
    expect(resolvePrivateGroupBookingParticipantCount({})).toBe(1)
  })
})

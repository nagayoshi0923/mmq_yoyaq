import { describe, expect, it } from 'vitest'
import {
  pickScenarioSlotStartTime,
  parseScenarioSlotStartTimes,
} from './privateBookingSlotStartTimes'

describe('pickScenarioSlotStartTime', () => {
  const times = {
    weekday: { morning: '09:00', afternoon: null, evening: '18:00' },
    weekend: { morning: '09:30', afternoon: '14:00', evening: null },
  }

  it('平日は weekday を使う', () => {
    expect(pickScenarioSlotStartTime(times, false, 'morning')).toBe('09:00')
    expect(pickScenarioSlotStartTime(times, false, 'afternoon')).toBeNull()
    expect(pickScenarioSlotStartTime(times, false, 'evening')).toBe('18:00')
  })

  it('土日祝は weekend を使う', () => {
    expect(pickScenarioSlotStartTime(times, true, 'morning')).toBe('09:30')
    expect(pickScenarioSlotStartTime(times, true, 'afternoon')).toBe('14:00')
    expect(pickScenarioSlotStartTime(times, true, 'evening')).toBeNull()
  })

  it('未設定は null', () => {
    expect(pickScenarioSlotStartTime(null, false, 'morning')).toBeNull()
  })
})

describe('parseScenarioSlotStartTimes', () => {
  it('不正値を落とす', () => {
    const parsed = parseScenarioSlotStartTimes({
      weekday: { morning: '25:00', afternoon: '13:00', evening: 'x' },
    })
    expect(parsed.weekday?.morning).toBeNull()
    expect(parsed.weekday?.afternoon).toBe('13:00')
    expect(parsed.weekday?.evening).toBeNull()
  })
})

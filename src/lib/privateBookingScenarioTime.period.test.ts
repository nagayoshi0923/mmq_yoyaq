import { describe, expect, it } from 'vitest'
import { isWithinScenarioPerformancePeriod } from './privateBookingScenarioTime'

describe('作品の公演期間（#960）', () => {
  const period = { available_from: '2026-11-01', available_until: '2027-05-09' }

  it('期間の初日・最終日は含み、前後の日は含まない', () => {
    expect(isWithinScenarioPerformancePeriod('2026-10-31', period)).toBe(false)
    expect(isWithinScenarioPerformancePeriod('2026-11-01', period)).toBe(true)
    expect(isWithinScenarioPerformancePeriod('2027-05-09', period)).toBe(true)
    expect(isWithinScenarioPerformancePeriod('2027-05-10', period)).toBe(false)
  })

  it('未設定の側は制限しない', () => {
    expect(isWithinScenarioPerformancePeriod('2030-01-01', { available_from: '2026-11-01', available_until: null })).toBe(true)
    expect(isWithinScenarioPerformancePeriod('2020-01-01', { available_from: null, available_until: '2027-05-09' })).toBe(true)
    expect(isWithinScenarioPerformancePeriod('2026-10-01', null)).toBe(true)
  })
})

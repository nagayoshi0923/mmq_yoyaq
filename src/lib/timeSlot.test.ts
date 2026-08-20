import { describe, expect, it } from 'vitest'
import { startTimeToEn } from './timeSlot'

describe('startTimeToEn', () => {
  it.each([
    ['09:00', 'morning'],
    ['11:59', 'morning'],
    ['12:00', 'afternoon'],
    ['17:00', 'afternoon'],
    ['17:30', 'afternoon'],
    ['18:00', 'evening'],
    ['22:30', 'evening'],
  ] as const)('%s は %s', (start, slot) => {
    expect(startTimeToEn(start)).toBe(slot)
  })
})

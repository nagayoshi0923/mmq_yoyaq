import { describe, expect, it } from 'vitest'
import {
  getWeekendEveningStartFloorMinutes,
  usesWeekendEvening1930PrivateBookingStart,
  WEEKEND_EVENING_PRIVATE_BOOKING_START_MINUTES,
} from '@/lib/scenarioWeekendEveningPrivateBooking'
import { computePrivateBookingSlots } from '@/lib/computePrivateBookingSlots'
import type { BusinessHoursSettingRow } from '@/lib/privateGroupCandidateSlots'

describe('scenarioWeekendEveningPrivateBooking', () => {
  it('BeatSpecter と戦塵のレガストリアは土日祝の夜枠 19:30 対象', () => {
    expect(usesWeekendEvening1930PrivateBookingStart('BeatSpecter')).toBe(true)
    expect(usesWeekendEvening1930PrivateBookingStart('戦塵のレガストリア')).toBe(true)
    expect(usesWeekendEvening1930PrivateBookingStart('クロノフォビア')).toBe(false)
  })

  it('平日は底上げしない', () => {
    expect(
      getWeekendEveningStartFloorMinutes(false, 'BeatSpecter')
    ).toBeNull()
  })

  it('土日祝は対象シナリオのみ 19:30 を返す', () => {
    expect(
      getWeekendEveningStartFloorMinutes(true, 'BeatSpecter')
    ).toBe(WEEKEND_EVENING_PRIVATE_BOOKING_START_MINUTES)
    expect(
      getWeekendEveningStartFloorMinutes(true, '密室の謎')
    ).toBeNull()
  })
})

describe('computePrivateBookingSlots weekend evening 19:30', () => {
  const storeId = 'store-1'
  const weekdayHours: BusinessHoursSettingRow = {
    store_id: storeId,
    opening_hours: {
      monday: {
        is_open: true,
        close_time: '23:00',
        available_slots: ['morning', 'afternoon', 'evening'],
        slot_start_times: { morning: '10:00', afternoon: '13:00', evening: '19:00' },
      },
      thursday: {
        is_open: true,
        close_time: '23:00',
        available_slots: ['morning', 'afternoon', 'evening'],
        slot_start_times: { morning: '10:00', afternoon: '13:00', evening: '19:00' },
      },
      saturday: {
        is_open: true,
        close_time: '23:00',
        available_slots: ['morning', 'afternoon', 'evening'],
        slot_start_times: { morning: '10:00', afternoon: '14:00', evening: '19:00' },
      },
      sunday: {
        is_open: true,
        close_time: '23:00',
        available_slots: ['morning', 'afternoon', 'evening'],
        slot_start_times: { morning: '10:00', afternoon: '14:00', evening: '19:00' },
      },
    },
  }

  const businessHoursByStore = new Map<string, BusinessHoursSettingRow>([
    [storeId, weekdayHours],
  ])

  const baseParams = {
    storeIds: [storeId],
    businessHoursByStore,
    scenarioTiming: { duration: 180, weekend_duration: null },
    allStoreEvents: [],
    isCustomHoliday: () => false,
    privateBookingTimeSlots: ['夜公演'],
  }

  it('BeatSpecter の土日は夜枠が 19:30 開始', () => {
    const slots = computePrivateBookingSlots({
      ...baseParams,
      date: '2026-08-29',
      scenarioTitle: 'BeatSpecter',
    })
    const evening = slots.find((s) => s.key === 'evening')
    expect(evening?.startTime).toBe('19:30')
  })

  it('BeatSpecter の平日は夜枠が 19:00 開始のまま', () => {
    const slots = computePrivateBookingSlots({
      ...baseParams,
      date: '2026-08-27',
      scenarioTitle: 'BeatSpecter',
    })
    const evening = slots.find((s) => s.key === 'evening')
    expect(evening?.startTime).toBe('19:00')
  })

  it('他シナリオの土日は夜枠が 19:00 のまま', () => {
    const slots = computePrivateBookingSlots({
      ...baseParams,
      date: '2026-08-29',
      scenarioTitle: 'クロノフォビア',
    })
    const evening = slots.find((s) => s.key === 'evening')
    expect(evening?.startTime).toBe('19:00')
  })
})

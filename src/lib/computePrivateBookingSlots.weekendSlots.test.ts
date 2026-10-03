import { describe, expect, it } from 'vitest'
import { computePrivateBookingSlots } from './computePrivateBookingSlots'
import type { BusinessHoursSettingRow } from './privateGroupCandidateSlots'

// #345: 貸切時間枠は平日と土日・祝日（独自休日を含む）で別々に判定する。土日祝の設定が空なら全枠。平日の設定は流用しない。
const day = { is_open: true, open_time: '09:00', close_time: '23:00', slot_start_times: { morning: '09:00', afternoon: '13:00', evening: '19:00' } }
const row: BusinessHoursSettingRow = {
  store_id: 'a',
  opening_hours: { monday: day, tuesday: day, wednesday: day, thursday: day, friday: day, saturday: day, sunday: day },
}
const compute = (date: string, weekday?: string[], weekend?: string[] | null, customHoliday = false) => computePrivateBookingSlots({
  date, storeIds: ['a'], businessHoursByStore: new Map([['a', row]]),
  scenarioTiming: { duration: 180, weekend_duration: null, preparation_minutes_by_store: { a: 60 } },
  allStoreEvents: [], isCustomHoliday: () => customHoliday,
  privateBookingTimeSlots: weekday, privateBookingTimeSlotsWeekend: weekend,
}).map(slot => slot.label)

const SATURDAY = '2030-01-12'
const SUNDAY = '2030-01-13'
const TUESDAY = '2030-01-08'

describe('貸切時間枠の平日・土日祝の切り分け（#345）', () => {
  it('土日祝を「夜公演」だけにすると、土日は夜だけ、平日は平日の設定のまま', () => {
    expect(compute(SATURDAY, undefined, ['夜公演'])).toEqual(['夜'])
    expect(compute(SUNDAY, undefined, ['夜公演'])).toEqual(['夜'])
    expect(compute(TUESDAY, undefined, ['夜公演'])).not.toEqual(['夜'])
  })
  it('平日を絞っても、土日祝が未設定なら土日は全枠（平日の設定を流用しない）', () => {
    expect(compute(TUESDAY, ['夜公演'], null)).toEqual(['夜'])
    expect(compute(SATURDAY, ['夜公演'], null)).toEqual(['午前', '午後', '夜'])
    expect(compute(SATURDAY, ['夜公演'], [])).toEqual(['午前', '午後', '夜'])
  })
  it('組織の独自休日は土日祝の設定で判定する', () => {
    expect(compute(TUESDAY, ['昼公演', '夜公演'], ['夜公演'], true)).toEqual(['夜'])
  })
})

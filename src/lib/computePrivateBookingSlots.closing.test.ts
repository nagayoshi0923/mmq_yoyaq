import { describe, expect, it } from 'vitest'
import { computePrivateBookingSlots } from './computePrivateBookingSlots'
import type { BusinessHoursSettingRow } from './privateGroupCandidateSlots'
const hours = (store: string, close: string): BusinessHoursSettingRow => ({
 store_id: store,
 opening_hours: { saturday: { is_open: true, open_time: '09:00', close_time: close, slot_start_times: { morning: '10:00', afternoon: '14:00', evening: '19:00' } } },
})
const compute = (rows: BusinessHoursSettingRow[], duration = 240) => computePrivateBookingSlots({
 date: '2030-01-05', storeIds: rows.map(row => row.store_id), businessHoursByStore: new Map(rows.map(row => [row.store_id, row])),
 scenarioTiming: { duration, weekend_duration: null, preparation_minutes_by_store: Object.fromEntries(rows.map(row => [row.store_id, 60])) },
 allStoreEvents: [], isCustomHoliday: () => false,
})
describe('貸切候補は店舗の閉店時刻まで', () => {
 it('22:30閉店店で19〜23時を選択可能にしない', () => {
  expect(compute([hours('a','22:30')]).some(slot => slot.key === 'evening')).toBe(false)
 })
 it('23時閉店なら19〜23時を維持する', () => {
  expect(compute([hours('a','23:00')])).toContainEqual({ key: 'evening', label: '夜', startTime: '19:00', endTime: '23:00' })
 })
 it('別の希望店が23時まで営業する場合は候補を残す', () => {
  expect(compute([hours('a','22:30'),hours('b','23:00')]).some(slot => slot.key === 'evening')).toBe(true)
 })
 it('昼の枠延長も閉店を越えない', () => {
  expect(compute([hours('a','17:00')],240).some(slot => slot.key === 'afternoon')).toBe(false)
 })
})

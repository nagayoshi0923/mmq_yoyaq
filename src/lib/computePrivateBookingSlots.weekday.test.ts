import { describe, expect, it } from 'vitest'
import { computePrivateBookingSlots } from './computePrivateBookingSlots'
import type { BusinessHoursSettingRow } from './privateGroupCandidateSlots'
const hours = (store: string, afternoon = '13:00', evening = '19:00'): BusinessHoursSettingRow => ({
 store_id: store, opening_hours: { tuesday: { is_open: true, open_time: '10:00', close_time: '23:00',
 slot_start_times: { morning: '10:00', afternoon, evening } } },
})
const compute = (duration: number, rows = [hours('a')], prep = 60, holiday = false) => computePrivateBookingSlots({
 date: '2030-01-08', storeIds: rows.map(row => row.store_id), businessHoursByStore: new Map(rows.map(row => [row.store_id, row])),
 scenarioTiming: { duration, weekend_duration: null, preparation_minutes_by_store: Object.fromEntries(rows.map(row => [row.store_id, prep])) },
 allStoreEvents: [], isCustomHoliday: () => holiday,
})
describe('平日昼の受付条件', () => {
 it('通常尺は午後、長時間作品は午前', () => {
  expect(compute(180).map(slot => slot.key)).toEqual(['afternoon','evening'])
  expect(compute(360).map(slot => slot.key)).toEqual(['morning','evening'])
 })
 it('準備時間0を継承と区別する', () => {
  expect(compute(360,undefined,0).map(slot => slot.key)).toEqual(['afternoon','evening'])
 })
 it('店舗独自の開始時刻を使う', () => {
  expect(compute(180,[hours('a','15:00','18:00')]).map(slot => slot.key)).toEqual(['morning','evening'])
 })
 it('店舗Aが午前、店舗Bが午後を受け付ける場合は両方残す', () => {
  const slots = compute(180,[hours('a','15:00','18:00'),hours('b')])
  expect(slots.map(slot => slot.key)).toEqual(['morning','afternoon','evening'])
  expect(slots.find(slot => slot.key === 'afternoon')?.startTime).toBe('13:00')
 })
 it('最早店舗が夕方締切を超えても別店舗の午後を残す', () => {
  const rows = [hours('a','13:00','17:00'),hours('b','15:00','20:00')]
  const slots = computePrivateBookingSlots({
   date: '2030-01-08', storeIds: ['a','b'], businessHoursByStore: new Map(rows.map(row => [row.store_id,row])),
   scenarioTiming: { duration: 180, weekend_duration: null, preparation_minutes_by_store: { a:60,b:60 } },
   allStoreEvents: [{ date:'2030-01-08',store_id:'a',start_time:'12:00',end_time:'13:30' }], isCustomHoliday: () => false,
  })
  expect(slots.find(slot => slot.key === 'afternoon')).toEqual({key:'afternoon',label:'午後',startTime:'15:00',endTime:'18:00'})
 })
 it('独自休日は平日の排他条件を適用しない', () => {
  expect(compute(180,undefined,60,true).map(slot => slot.key)).toEqual(['morning','afternoon','evening'])
 })
})

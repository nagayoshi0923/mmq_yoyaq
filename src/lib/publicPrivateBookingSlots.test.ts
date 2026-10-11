import { describe, expect, it } from 'vitest'
import { getPublicPrivateBookingSlotOptions } from './publicPrivateBookingSlots'
import { computePrivateBookingSlots } from './computePrivateBookingSlots'
import type { BusinessHoursSettingRow } from './privateGroupCandidateSlots'

const date = '2030-01-08'
const row = (store_id: string, day = {}): BusinessHoursSettingRow => ({ store_id, opening_hours: {
  tuesday: { is_open: true, open_time: '13:00', close_time: '22:00', available_slots: ['afternoon', 'evening'], slot_start_times: { morning: '10:00', afternoon: '14:30', evening: '19:30' }, ...day },
} })
const options = (slot: 'morning' | 'afternoon' | 'evening', rows = [row('a')], blocked = [] as { date: string; store_id: string; time_slot: string }[], events = [] as { date: string; store_id: string; start_time: string; end_time: string }[]) => getPublicPrivateBookingSlotOptions(date, slot, rows.map(r => r.store_id), new Map(rows.map(r => [r.store_id, r])), blocked, events, () => false)

describe('公開スケジュールの貸切受付', () => {
  it('無効な朝枠を追加せず店舗設定の開始時刻を使う', () => {
    expect(options('morning')).toEqual([])
    expect(options('afternoon')).toEqual([{storeId:'a',startTime:'14:30'}])
  })
  it('定休日・特別休業日・旧休日指定では出さない', () => {
    expect(options('afternoon', [row('a', {is_open:false})])).toEqual([])
    expect(options('afternoon', [{...row('a'), special_closed_days:[{date}]}])).toEqual([])
    expect(options('afternoon', [{...row('a'), holidays:[date]}])).toEqual([])
  })
  it('すべての枠を無効にした店では出さない', () => {
    expect(options('evening', [row('a', {available_slots:[]})])).toEqual([])
  })
  it('開店前に開始せず閉店後の枠を出さない', () => {
    expect(options('afternoon', [row('a', {open_time:'16:00'})])).toEqual([{storeId:'a',startTime:'16:00'}])
    expect(options('evening', [row('a', {close_time:'18:00'})])).toEqual([])
  })
  it('複数店舗から停止店だけを除き、全店停止なら非表示', () => {
    const blocked = [{date,store_id:'a',time_slot:'afternoon'}]
    expect(options('afternoon', [row('a'), row('b')], blocked)).toEqual([{storeId:'b',startTime:'14:30'}])
    expect(options('afternoon', [row('a')], blocked)).toEqual([])
  })
  it('非公開の占有公演も除外する', () => {
    expect(options('afternoon', [row('a')], [], [{date,store_id:'a',start_time:'15:00',end_time:'18:00'}])).toEqual([])
  })
  it('設定開始より早い同時間帯の公演も占有として扱う', () => {
    expect(options('afternoon', [row('a')], [], [{date,store_id:'a',start_time:'13:30',end_time:'16:00'}])).toEqual([])
    expect(options('evening', [row('a')], [], [{date,store_id:'a',start_time:'18:30',end_time:'21:00'}])).toEqual([])
  })
  it('選択後の作品候補でも停止した最早店舗を使わない', () => {
    const a = row('a', {slot_start_times:{afternoon:'13:00',evening:'19:00'}})
    const b = row('b', {slot_start_times:{afternoon:'15:00',evening:'21:00'}})
    const slots = computePrivateBookingSlots({date,storeIds:['a','b'],businessHoursByStore:new Map([['a',a],['b',b]]),scenarioTiming:{duration:120,weekend_duration:null},allStoreEvents:[],isCustomHoliday:()=>false,blockedSlots:[{date,store_id:'a',time_slot:'afternoon'}]})
    expect(slots.find(slot=>slot.key==='afternoon')?.startTime).toBe('15:00')
    expect(slots.some(slot=>slot.key==='morning')).toBe(false)
  })
})

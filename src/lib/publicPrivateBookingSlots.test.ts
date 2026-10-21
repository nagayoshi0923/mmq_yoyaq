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
  // 2026-10-21 issue #1200（社長の仕様訂正）: 開店時刻は枠の可否・開始を決めない。枠の可否は available_slots（I2）。DB と同じ
  it('開店時刻より前でも有効な枠は設定の開始時刻で出し、閉店後の枠は出さない', () => {
    expect(options('afternoon', [row('a', {open_time:'16:00'})])).toEqual([{storeId:'a',startTime:'14:30'}])
    expect(options('evening', [row('a', {close_time:'18:00'})])).toEqual([])
  })
  it('平日 開店 13:00 でも朝を有効にした店（東京の店舗と同じ）は朝 10:00 を出し、朝が無効な店（札幌店と同じ）は出さない', () => {
    const tokyo = row('t', {available_slots:['morning', 'afternoon', 'evening'], slot_start_times:{morning:'10:00', afternoon:'13:00', evening:'19:00'}})
    const sapporo = row('s', {slot_start_times:{morning:'10:00', afternoon:'13:00', evening:'19:00'}})
    expect(options('morning', [tokyo])).toEqual([{storeId:'t',startTime:'10:00'}])
    expect(options('morning', [sapporo])).toEqual([])
    expect(options('morning', [tokyo, sapporo])).toEqual([{storeId:'t',startTime:'10:00'}])
    expect(options('afternoon', [sapporo])).toEqual([{storeId:'s',startTime:'13:00'}])
    expect(options('evening', [sapporo])).toEqual([{storeId:'s',startTime:'19:00'}])
  })
  // データ修正 supabase/data-fixes/20261021_queens_waltz_weekday_morning_off.sql を当てた後の東京 7 店の形（平日の available_slots から朝だけを外す）。
  // 平日の朝は出さず、昼 13:00・夜 19:00 はそのまま。土曜は朝 09:00 も出す（PR #1201、2026-10-21）
  it('平日の朝を外した東京の店（データ修正後）は平日の朝を出さず、昼・夜と土曜の朝は出す', () => {
    const after = (store_id: string): BusinessHoursSettingRow => ({ store_id, opening_hours: {
      tuesday: { is_open: true, open_time: '13:00', close_time: '23:00', available_slots: ['afternoon', 'evening'], slot_start_times: { evening: '19:00', morning: '10:00', afternoon: '13:00' } },
      saturday: { is_open: true, open_time: '09:00', close_time: '23:00', available_slots: ['morning', 'afternoon', 'evening'], slot_start_times: { evening: '19:00', morning: '09:00', afternoon: '14:00' } },
    } })
    const at = (day: string, slot: 'morning' | 'afternoon' | 'evening') => getPublicPrivateBookingSlotOptions(day, slot, ['q'], new Map([['q', after('q')]]), [], [], () => false)
    expect(at(date, 'morning')).toEqual([])
    expect(at(date, 'afternoon')).toEqual([{storeId:'q',startTime:'13:00'}])
    expect(at(date, 'evening')).toEqual([{storeId:'q',startTime:'19:00'}])
    expect(at('2030-01-12', 'morning')).toEqual([{storeId:'q',startTime:'09:00'}])
  })
  it('営業設定が無い店は DB の合成と同じく平日も 3 枠（朝 10:00）', () => {
    expect(options('morning', [{store_id:'n', opening_hours:null}])).toEqual([{storeId:'n',startTime:'10:00'}])
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

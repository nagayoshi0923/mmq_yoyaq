import { describe, expect, it } from 'vitest'
import { computePrivateBookingSlots } from './computePrivateBookingSlots'
import type { BusinessHoursSettingRow } from './privateGroupCandidateSlots'
import type { ScenarioSlotStartTimes } from './privateBookingSlotStartTimes'

// 2030-01-08 は火曜、2030-01-12 は土曜
const row = (extra: Partial<BusinessHoursSettingRow> = {}): BusinessHoursSettingRow => ({
  store_id: 'a',
  opening_hours: {
    tuesday: { is_open: true, open_time: '10:00', close_time: '23:00', slot_start_times: { morning: '10:00', afternoon: '13:00', evening: '19:00' } },
    saturday: { is_open: true, open_time: '09:00', close_time: '23:00', available_slots: ['morning', 'afternoon', 'evening'], slot_start_times: { morning: '09:00', afternoon: '14:00', evening: '19:00' } },
    sunday: { is_open: true, open_time: '09:00', close_time: '23:00', available_slots: ['morning', 'afternoon', 'evening'], slot_start_times: { morning: '09:00', afternoon: '14:00', evening: '19:00' } },
  },
  ...extra,
})
const compute = (date: string, times: ScenarioSlotStartTimes | null, opts: { events?: { date: string; store_id: string; start_time: string; end_time: string }[]; title?: string; hours?: BusinessHoursSettingRow } = {}) =>
  computePrivateBookingSlots({
    date, storeIds: ['a'], businessHoursByStore: new Map([['a', opts.hours ?? row()]]),
    scenarioTiming: { duration: 180, weekend_duration: null, preparation_minutes_by_store: { a: 60 } },
    allStoreEvents: opts.events ?? [], isCustomHoliday: () => false,
    scenarioTitle: opts.title, scenarioSlotStartTimes: times,
  })
const start = (slots: ReturnType<typeof compute>, key: string) => slots.find(slot => slot.key === key)?.startTime

describe('作品ごとの貸切開始時刻', () => {
  it('設定が無ければ店舗の開始時刻のまま', () => {
    const slots = compute('2030-01-08', null)
    expect(start(slots, 'afternoon')).toBe('13:00')
    expect(start(slots, 'evening')).toBe('19:00')
  })

  it('平日の設定は平日だけに効き、未設定の枠は店舗の時刻', () => {
    const times = { weekday: { evening: '18:30' }, weekend: {} }
    expect(start(compute('2030-01-08', times), 'evening')).toBe('18:30')
    expect(start(compute('2030-01-08', times), 'afternoon')).toBe('13:00')
    expect(start(compute('2030-01-12', times), 'evening')).toBe('19:00')
  })

  it('土日祝の設定は土日祝に効く', () => {
    const slots = compute('2030-01-12', { weekday: {}, weekend: { morning: '10:00', afternoon: '14:30' } })
    expect(start(slots, 'morning')).toBe('10:00')
    expect(start(slots, 'afternoon')).toBe('14:30')
  })

  it('店舗の特別営業日（平日を土日扱い）は土日祝の設定を使う', () => {
    const hours = row({ special_open_days: [{ date: '2030-01-08' }] })
    const slots = compute('2030-01-08', { weekday: { evening: '18:00' }, weekend: { evening: '19:30' } }, { hours })
    expect(start(slots, 'evening')).toBe('19:30')
  })

  it('前の公演との間隔は今までどおり守る（設定時刻より前の公演が延びていれば後ろへずらす）', () => {
    const events = [{ date: '2030-01-08', store_id: 'a', start_time: '15:00', end_time: '18:00' }]
    const slots = compute('2030-01-08', { weekday: { evening: '18:00' }, weekend: {} }, { events })
    expect(start(slots, 'evening')).toBe('19:00')
  })

  it('土日祝夜の開始下限（戦塵のレガストリア 19:30）は作品設定より優先して守る', () => {
    const slots = compute('2030-01-12', { weekday: {}, weekend: { evening: '18:00' } }, { title: '戦塵のレガストリア' })
    expect(start(slots, 'evening')).toBe('19:30')
  })

  it('店舗の休業日・特別休業日は作品設定があっても枠を出さない', () => {
    const times = { weekday: { evening: '18:00' }, weekend: { evening: '18:00' } }
    expect(compute('2030-01-08', times, { hours: row({ special_closed_days: [{ date: '2030-01-08' }] }) })).toEqual([])
    const closed = row()
    closed.opening_hours!.saturday = { ...closed.opening_hours!.saturday, is_open: false }
    expect(start(compute('2030-01-12', times, { hours: closed }), 'evening')).toBeUndefined()
  })
})

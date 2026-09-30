import { describe, expect, it } from 'vitest'
import {
  pickScenarioSlotStartTime,
  parseScenarioSlotStartTimes,
  applyScenarioSlotStartTimesToRow,
  scenarioSlotStartTimesForSave,
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

describe('保存と店舗設定への上書き', () => {
  it('すべて店舗設定なら null で保存する', () => {
    expect(scenarioSlotStartTimesForSave({ weekday: { morning: null }, weekend: {} })).toBeNull()
    expect(scenarioSlotStartTimesForSave({ weekday: { evening: '19:30' }, weekend: {} })).toEqual({
      weekday: { morning: null, afternoon: null, evening: '19:30' }, weekend: { morning: null, afternoon: null, evening: null },
    })
  })
  it('開始時刻だけを各曜日ブロックへ上書きし、営業日・受付枠は変えない', () => {
    const row = { store_id: 'a', opening_hours: { monday: { is_open: false, available_slots: ['evening'], slot_start_times: { evening: '19:00' } } } }
    const out = applyScenarioSlotStartTimesToRow(row, { weekday: { evening: '18:30' } }, false)
    expect(out?.opening_hours?.monday).toEqual({ is_open: false, available_slots: ['evening'], slot_start_times: { evening: '18:30' } })
    expect(row.opening_hours.monday.slot_start_times.evening).toBe('19:00')
    expect(applyScenarioSlotStartTimesToRow(row, { weekend: { evening: '18:30' } }, false)).toBe(row)
  })
})

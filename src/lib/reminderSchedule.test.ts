import { describe, expect, it } from 'vitest'
import { dueReminderSchedules } from '../../supabase/functions/_shared/reminder-schedule'
describe('継承後のリマインド日程', () => {
  const schedules = [
    { days_before: 1, time: '09:00', enabled: true },
    { days_before: 7, time: '10:00', enabled: true },
    { days_before: 1, time: '10:00', enabled: false },
  ]
  it('UTC日付ではなく日本時間の日付と時刻で判定する', () => {
    expect(dueReminderSchedules('2099-01-02','10:00',schedules,new Date('2099-01-01T00:00:00Z'))).toEqual([schedules[0]])
    expect(dueReminderSchedules('2099-01-02','10:00',schedules,new Date('2098-12-31T23:59:00Z'))).toEqual([])
  })
  it('当日分だけを処理し、過去の日程をまとめて再送しない', () => {
    expect(dueReminderSchedules('2099-01-02','10:00',schedules,new Date('2099-01-02T00:00:00Z'))).toEqual([])
  })
  it('同じ日数・時刻の重複行は一つにする', () => {
    expect(dueReminderSchedules('2099-01-02','10:00',[schedules[0],schedules[0]],new Date('2099-01-01T00:00:00Z'))).toHaveLength(1)
  })
  it('公演開始後には送らず、開始前の当日指定は使える', () => {
    const sameDay = [{ days_before: 0, time: '09:00', enabled: true }]
    expect(dueReminderSchedules('2099-01-02','10:00',sameDay,new Date('2099-01-02T00:00:00Z'))).toHaveLength(1)
    expect(dueReminderSchedules('2099-01-02','10:00',sameDay,new Date('2099-01-02T01:00:00Z'))).toHaveLength(0)
  })
})

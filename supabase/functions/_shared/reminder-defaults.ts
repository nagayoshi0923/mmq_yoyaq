import type { ReminderSchedule } from './reminder-schedule.ts'

/** 移行前から本番で動いていた既定。設定未保存時も前日9時を維持する。 */
export const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule[] = [
  { days_before: 1, time: '09:00', enabled: true },
]
export const DEFAULT_REMINDER_ENABLED = true

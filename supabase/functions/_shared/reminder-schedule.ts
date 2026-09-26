export interface ReminderSchedule { days_before: number; time: string; enabled: boolean; template?: string }
/** 日本時間の暦日を基準にする。時刻を過ぎた当日の分だけが対象。 */
export function dueReminderSchedules(eventDate: string, eventStartTime: string, schedules: ReminderSchedule[], now: Date): ReminderSchedule[] {
  const jst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  const [today, time] = jst.split(' ')
  const dayDifference = (Date.parse(`${eventDate}T00:00:00+09:00`) - Date.parse(`${today}T00:00:00+09:00`)) / 86400000
  if (now.getTime() >= Date.parse(`${eventDate}T${eventStartTime.slice(0, 5)}:00+09:00`)) return []
  const seen = new Set<string>()
  return schedules.filter(schedule => {
    if (!schedule.enabled || schedule.days_before !== dayDifference || schedule.time > time) return false
    const key = `${schedule.days_before}:${schedule.time}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

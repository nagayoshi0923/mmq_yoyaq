export interface MissingCheckinEvent {
  id: string
  organization_id: string
  store_id: string
  store_name: string
  date: string
  start_time: string
  scenario: string
  gms: unknown
  status?: string | null
  is_cancelled?: boolean | null
}

export interface CheckinStaff {
  id: string
  organization_id: string
  name: string
  status?: string | null
}

export interface CheckinRecord {
  staff_id: string
  store_id: string
  organization_id: string
  checked_in_at: string
}

export interface MissingCheckinCandidate {
  event: MissingCheckinEvent
  staff: CheckinStaff
}

const JST_OFFSET_MINUTES = 9 * 60
const MISSING_CHECKIN_NOTIFICATION_LEAD_TIME_MS = 55 * 60 * 1000

function parseDateParts(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function parseTimeParts(value: string): [number, number, number] | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] ?? '0')
  if (hour > 23 || minute > 59 || second > 59) return null
  return [hour, minute, second]
}

/** schedule_events の日付・時刻をJSTの壁時計として解釈する。 */
export function parseJstDateTime(date: string, time: string): Date | null {
  const dateParts = parseDateParts(date)
  const timeParts = parseTimeParts(time)
  if (!dateParts || !timeParts) return null
  const [year, month, day] = dateParts
  const [hour, minute, second] = timeParts
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - JST_OFFSET_MINUTES * 60 * 1000)
}

export function getJstDate(instant: string | Date): string | null {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  if (!values.year || !values.month || !values.day) return null
  return `${values.year}-${values.month}-${values.day}`
}

export function isMissingCheckinEventDue(event: MissingCheckinEvent, now: Date): boolean {
  if (event.is_cancelled === true) return false
  const status = event.status?.trim().toLowerCase()
  if (status === 'cancelled' || status === 'canceled') return false
  const startAt = parseJstDateTime(event.date, event.start_time)
  if (!startAt || !Number.isFinite(now.getTime())) return false
  return now.getTime() >= startAt.getTime() - MISSING_CHECKIN_NOTIFICATION_LEAD_TIME_MS
}

function getAssignedStaff(event: MissingCheckinEvent, staff: CheckinStaff[]): CheckinStaff[] {
  if (!Array.isArray(event.gms)) return []
  const matched = new Map<string, CheckinStaff>()
  for (const rawName of event.gms) {
    if (typeof rawName !== 'string' || !rawName.trim()) continue
    const displayName = rawName.trim()
    const member = staff.find(candidate => candidate.name.trim() === displayName)
    if (member && member.organization_id === event.organization_id && !matched.has(member.id)) {
      matched.set(member.id, member)
    }
  }
  return [...matched.values()]
}

export function findMissingCheckinCandidates(
  events: MissingCheckinEvent[],
  staff: CheckinStaff[],
  checkins: CheckinRecord[],
  now: Date,
): MissingCheckinCandidate[] {
  const checkinKeys = new Set(
    checkins
      .filter(checkin => checkin.organization_id && checkin.staff_id && checkin.store_id)
      .map(checkin => `${checkin.organization_id}:${checkin.store_id}:${checkin.staff_id}:${getJstDate(checkin.checked_in_at)}`),
  )

  return events.flatMap(event => {
    if (!event.organization_id || !event.store_id || !isMissingCheckinEventDue(event, now)) return []
    const assignedStaff = getAssignedStaff(
      event,
      staff.filter(member => member.organization_id === event.organization_id && member.status !== 'inactive'),
    )
    return assignedStaff
      .filter(member => !checkinKeys.has(`${event.organization_id}:${event.store_id}:${member.id}:${event.date}`))
      .map(member => ({ event, staff: member }))
  })
}

export function getJstDateRange(now: Date): [string, string] {
  const today = getJstDate(now)
  if (!today) throw new Error('現在時刻をJST日付へ変換できません')
  const [year, month, day] = parseDateParts(today)!
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1))
  return [today, nextDay.toISOString().slice(0, 10)]
}

export function buildDedupeKey(candidate: MissingCheckinCandidate): string {
  return `${candidate.event.id}:${candidate.staff.id}:${candidate.event.date}`
}

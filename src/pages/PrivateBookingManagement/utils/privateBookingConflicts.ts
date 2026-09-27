import { normalizeToJapanCalendarYmd } from '@/lib/japanCalendarDate'
import { resolvePreparationMinutes, type PreparationSettings } from '../../../../supabase/functions/_shared/preparation-settings'

export interface ConflictEvent {
  id: string
  date: string
  start_time: string
  end_time: string
  store_id: string | null
  reservation_id?: string | null
  scenario_master_id?: string | null
  scenario_id?: string | null
  organization_scenario_id?: string | null
  scenario?: string | null
  gms?: string[] | null
}
export interface ConflictCandidate {
  date: string
  startTime: string
  endTime: string
}
export function candidateConflictKey(requestId: string, order: number, resourceId: string): string {
  return `${requestId}:${order}:${resourceId}`
}

export function conflictInterval(date: string, start: string, end: string): [number, number] {
  date = normalizeToJapanCalendarYmd(date) || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(start) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(end)) {
    throw new Error('競合確認に必要な日時が不正です')
  }
  const base = Date.parse(`${date}T00:00:00Z`)
  const minute = (time: string) => {
    const [h, m, s = 0] = time.split(':').map(Number)
    if (h > 24 || m > 59 || s > 59 || (h === 24 && (m !== 0 || s !== 0))) throw new Error('競合確認に必要な時刻が不正です')
    return h * 60 + m + s / 60
  }
  const a = minute(start), b = minute(end)
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 10) !== date || a === b) throw new Error('競合確認に必要な日時が不正です')
  return [base + a * 60000, base + (b < a ? b + 1440 : b) * 60000]
}

export function hasGmTimeConflict(candidate: ConflictCandidate, event: ConflictEvent, requestId: string): boolean {
  if (event.reservation_id === requestId) return false
  const [start, end] = conflictInterval(candidate.date, candidate.startTime, candidate.endTime)
  const [eventStart, eventEnd] = conflictInterval(event.date, event.start_time, event.end_time)
  return start < eventEnd && end > eventStart
}

/** Same directional preparation intervals as approve_private_booking. */
export function hasStoreTimeConflict(
  candidate: ConflictCandidate, event: ConflictEvent, requestId: string,
  storeId: string, scenarioId: string | null | undefined, settings: PreparationSettings,
): boolean {
  if (event.reservation_id === requestId || event.store_id !== storeId) return false
  const [start, end] = conflictInterval(candidate.date, candidate.startTime, candidate.endTime)
  const [eventStart, eventEnd] = conflictInterval(event.date, event.start_time, event.end_time)
  const candidatePreparation = resolvePreparationMinutes(settings, { storeId, scenarioMasterId: scenarioId })
  const eventPreparation = resolvePreparationMinutes(settings, {
    storeId: event.store_id, scenarioId: event.organization_scenario_id,
    scenarioMasterId: event.scenario_master_id || event.scenario_id, eventId: event.id,
  })
  return eventStart < end + eventPreparation * 60000 && eventEnd > start - candidatePreparation * 60000
}

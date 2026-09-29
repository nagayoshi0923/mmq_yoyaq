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
  status?: string
}
export interface ConflictDateRange {
  from: string
  to: string
}

const APPROVAL_RELEVANT_STATUSES = new Set([
  'pending',
  'pending_gm',
  'gm_confirmed',
  'pending_store',
  'confirmed',
])

export function isApprovalRelevantStatus(status: string | null | undefined): boolean {
  return Boolean(status && APPROVAL_RELEVANT_STATUSES.has(status))
}

function shiftedDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** 確定印が無い旧データは先頭候補へフォールバック（useScheduleEventsQuery と同じ） */
export function pickConfirmedConflictCandidate<T extends ConflictCandidate>(
  candidates: T[],
): T | undefined {
  if (!candidates.length) return undefined
  const confirmed = candidates.filter(candidate => candidate.status === 'confirmed')
  return (confirmed.length > 0 ? confirmed : candidates)[0]
}

export function buildConflictDateRanges(candidateDates: string[], padDays = 2): ConflictDateRange[] {
  if (!candidateDates.length) return []
  const windows = [...new Set(candidateDates)]
    .sort()
    .map(date => ({ from: shiftedDate(date, -padDays), to: shiftedDate(date, padDays) }))
  const merged: ConflictDateRange[] = [{ ...windows[0] }]
  for (let i = 1; i < windows.length; i++) {
    const last = merged[merged.length - 1]
    const next = windows[i]
    if (next.from <= shiftedDate(last.to, 1)) {
      if (next.to > last.to) last.to = next.to
    } else {
      merged.push({ ...next })
    }
  }
  return merged
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

function canAffectCandidate(candidate: ConflictCandidate, event: ConflictEvent): boolean {
  const candidateDate = normalizeToJapanCalendarYmd(candidate.date)
  const eventDate = normalizeToJapanCalendarYmd(event.date)
  if (!candidateDate || !eventDate) return true
  return Math.abs(Date.parse(`${candidateDate}T00:00:00Z`) - Date.parse(`${eventDate}T00:00:00Z`)) <= 2 * 86400000
}

export function hasGmTimeConflict(candidate: ConflictCandidate, event: ConflictEvent, requestId: string): boolean {
  if (event.reservation_id === requestId || !canAffectCandidate(candidate, event)) return false
  const [start, end] = conflictInterval(candidate.date, candidate.startTime, candidate.endTime)
  const [eventStart, eventEnd] = conflictInterval(event.date, event.start_time, event.end_time)
  return start < eventEnd && end > eventStart
}

/** Same directional preparation intervals as approve_private_booking. */
export function hasStoreTimeConflict(
  candidate: ConflictCandidate, event: ConflictEvent, requestId: string,
  storeId: string, scenarioId: string | null | undefined, settings: PreparationSettings,
): boolean {
  if (event.reservation_id === requestId || event.store_id !== storeId || !canAffectCandidate(candidate, event)) return false
  const [start, end] = conflictInterval(candidate.date, candidate.startTime, candidate.endTime)
  const [eventStart, eventEnd] = conflictInterval(event.date, event.start_time, event.end_time)
  const candidatePreparation = resolvePreparationMinutes(settings, { storeId, scenarioMasterId: scenarioId })
  const eventPreparation = resolvePreparationMinutes(settings, {
    storeId: event.store_id, scenarioId: event.organization_scenario_id,
    scenarioMasterId: event.scenario_master_id || event.scenario_id, eventId: event.id,
  })
  return eventStart < end + eventPreparation * 60000 && eventEnd > start - candidatePreparation * 60000
}

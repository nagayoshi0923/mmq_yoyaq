import { normalizeToJapanCalendarYmd } from '@/lib/japanCalendarDate'
import { toJstYmd } from '@/utils/jstDate'
import { useQuery } from '@tanstack/react-query'
import { privateBookingMgmtReadApi } from '@/lib/api/privateBookingMgmtReadApi'
import { usePreparationSettings } from '@/hooks/usePreparationSettings'
import { kitApi } from '@/lib/api/kitApi'
import { computeKitShortageForDay, countUsableKits } from '@/utils/scheduleWarnings'
import type { ScheduleEvent } from '@/types/schedule'
import type { Store } from '@/types'
import type { PrivateBookingRequest } from './usePrivateBookingData'
import {
  buildConflictDateRanges,
  conflictInterval,
  hasGmTimeConflict,
  hasStoreTimeConflict,
  isApprovalRelevantStatus,
  pickConfirmedConflictCandidate,
  type ConflictCandidate,
  type ConflictEvent,
} from '../utils/privateBookingConflicts'

function isValidYmd(date: string | null | undefined): date is string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

function shiftJstYmd(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

export function usePrivateBookingConflicts(organizationId: string | null, requests: PrivateBookingRequest[]) {
  const preparation = usePreparationSettings()
  // 競合を確かめるのは、これから承認しうる日付だけ（昨日以降）。過去の確定履歴まで範囲にすると、
  // 範囲ごとの問い合わせが積み上がって表示が遅くなる（#690）。却下済み（cancelled）も再承認できるので含める。
  // 形式だけ合う不正な日付（2027-99-99 など）は範囲計算で例外になり画面ごと落ちるため除く。
  const earliestRelevantDate = shiftJstYmd(toJstYmd(new Date()), -1)
  const candidateDates = [...new Set(
    requests
      .filter(request => isApprovalRelevantStatus(request.status) || request.status === 'cancelled')
      .flatMap(request =>
        request.candidate_datetimes?.candidates?.map(candidate => normalizeToJapanCalendarYmd(candidate.date)).filter((date): date is string => isValidYmd(date)) || []
      ),
  )].filter(date => date >= earliestRelevantDate).sort()
  const dateRanges = buildConflictDateRanges(candidateDates, 2)
  const query = useQuery({
    queryKey: ['private-booking-conflicts', organizationId, requests.map(r => [r.id, r.status, r.candidate_datetimes])],
    enabled: Boolean(organizationId && dateRanges.length),
    staleTime: 0,
    queryFn: async () => {
      if (!organizationId || !dateRanges.length) return [] as ConflictEvent[]
      const events: ConflictEvent[] = []
      for (const range of dateRanges) {
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await privateBookingMgmtReadApi.listEventsForConflicts(organizationId, range.from, range.to, offset)
          if (error) throw error
          events.push(...(data || []))
          if (!data || data.length < 500) break
        }
      }
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await privateBookingMgmtReadApi.listConfirmedPrivateWithoutEvent(organizationId, offset)
        if (error) throw error
        for (const booking of data || []) {
          const candidate = pickConfirmedConflictCandidate(booking.candidate_datetimes?.candidates || [])
          if (!candidate) continue
          const date = normalizeToJapanCalendarYmd(candidate.date)
          if (!date || !dateRanges.some(range => date >= range.from && date <= range.to)) continue
          events.push({
            id: `reservation:${booking.id}`,
            reservation_id: booking.id,
            store_id: booking.store_id,
            date,
            start_time: candidate.startTime,
            end_time: candidate.endTime,
            scenario_master_id: booking.scenario_master_id,
            gms: booking.gm_staff ? [`staff:${booking.gm_staff}`] : [],
          })
        }
        if (!data || data.length < 500) break
      }
      return events
    },
  })
  // 承認しうる申込の作品ごとの使用可能なキット数（その日のキット不足の警告用、#376）
  const kitScenarioIds = [...new Set(requests
    .filter(request => isApprovalRelevantStatus(request.status) || request.status === 'cancelled')
    .map(request => request.scenario_master_id)
    .filter((id): id is string => Boolean(id)))].sort()
  const kits = useQuery({
    queryKey: ['private-booking-kits', organizationId, kitScenarioIds],
    enabled: Boolean(organizationId && kitScenarioIds.length),
    queryFn: async () => Object.fromEntries(await Promise.all(kitScenarioIds.map(async id =>
      [id, countUsableKits(await kitApi.getKitLocationsByScenario(id))] as const))) as Record<string, number>,
  })
  const ready = Boolean(query.data && preparation.data && !query.isError && !preparation.isError && !query.isFetching && !preparation.isFetching)
  const error = query.error || preparation.error
  const storeConflict = (request: PrivateBookingRequest, candidate: ConflictCandidate, storeId: string) => {
    if (!ready) return undefined
    try {
      conflictInterval(candidate.date, candidate.startTime, candidate.endTime)
      return query.data!.some(event => hasStoreTimeConflict(candidate, event, request.id, storeId, request.scenario_master_id, preparation.data!))
    } catch { return undefined }
  }
  const gmConflict = (request: PrivateBookingRequest, candidate: ConflictCandidate, staffId: string, name: string) => {
    if (!ready) return undefined
    try {
      conflictInterval(candidate.date, candidate.startTime, candidate.endTime)
      return query.data!.some(event => (event.gms?.includes(name) || event.gms?.includes(`staff:${staffId}`)) && hasGmTimeConflict(candidate, event, request.id))
    } catch { return undefined }
  }
  /** その日に同じ作品を公演する店舗に対してキットが足りない場合だけ返す。確かめられないときは null（警告しない） */
  const kitShortage = (request: PrivateBookingRequest, candidate: ConflictCandidate, storeId: string, stores: Store[]) => {
    if (!ready || !kits.data || !request.scenario_master_id) return null
    const date = normalizeToJapanCalendarYmd(candidate.date)
    if (!date) return null
    const events = query.data!
      .filter(event => event.reservation_id !== request.id)
      .map(event => ({ ...event, venue: event.store_id ?? '', is_cancelled: false }) as unknown as ScheduleEvent)
    return computeKitShortageForDay(
      { date, venueId: storeId, scenarioId: request.scenario_master_id, category: 'private' },
      events, kits.data[request.scenario_master_id] ?? 0, stores,
    )
  }
  return { ready, error, storeConflict, gmConflict, kitShortage, retry: () => Promise.all([query.refetch(), preparation.refetch()]) }
}

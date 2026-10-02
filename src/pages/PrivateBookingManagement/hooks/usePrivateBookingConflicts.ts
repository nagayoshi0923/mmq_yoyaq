import { normalizeToJapanCalendarYmd } from '@/lib/japanCalendarDate'
import { useQuery } from '@tanstack/react-query'
import { privateBookingMgmtReadApi } from '@/lib/api/privateBookingMgmtReadApi'
import { usePreparationSettings } from '@/hooks/usePreparationSettings'
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

export function usePrivateBookingConflicts(organizationId: string | null, requests: PrivateBookingRequest[]) {
  const preparation = usePreparationSettings()
  const candidateDates = [...new Set(
    requests
      .filter(request => isApprovalRelevantStatus(request.status))
      .flatMap(request =>
        request.candidate_datetimes?.candidates?.map(candidate => normalizeToJapanCalendarYmd(candidate.date)).filter((date): date is string => Boolean(date)) || []
      ),
  )].sort()
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
  return { ready, error, storeConflict, gmConflict, retry: () => Promise.all([query.refetch(), preparation.refetch()]) }
}

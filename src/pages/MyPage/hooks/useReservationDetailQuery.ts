import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { reservationApi } from '@/lib/reservationApi'
import { logger } from '@/utils/logger'

export const reservationDetailKeys = {
  detail: (reservationId: string) => ['reservation-detail', reservationId] as const,
  seats: (scheduleEventId: string) => ['reservation-detail', 'seats', scheduleEventId] as const,
}

export function useReservationDetailQuery(reservationId: string | undefined) {
  return useQuery({
    queryKey: reservationDetailKeys.detail(reservationId ?? ''),
    enabled: !!reservationId,
    queryFn: async () => {
      const { data: resData, error: resError } = await supabase
        .from('reservations')
        .select(`id, reservation_number, title, requested_datetime, participant_count, unit_price, final_price, status, payment_status, notes, scenario_id, scenario_master_id, store_id, organization_id, created_at, schedule_event_id, reservation_source, candidate_datetimes, customer_name, customer_email, customer_phone`)
        .eq('id', reservationId!)
        .maybeSingle()

      if (resError || !resData) {
        logger.warn('Reservation fetch failed or not accessible')
        return null
      }

      let scheduleEvent = null
      let eventStoreId: string | null = null
      if (resData.schedule_event_id) {
        const { data: eventData, error: eventError } = await supabase
          .from('schedule_events_public')
          .select('date, start_time, category, current_participants, max_participants, store_id')
          .eq('id', resData.schedule_event_id)
          .maybeSingle()
        if (!eventError && eventData) {
          scheduleEvent = { date: eventData.date, start_time: eventData.start_time, is_private_booking: eventData.category === 'private', current_participants: eventData.current_participants, max_participants: eventData.max_participants }
          eventStoreId = eventData.store_id
        }
      }

      const reservation = { ...resData, schedule_events: scheduleEvent || undefined }

      const storeIdToUse = eventStoreId || resData.store_id
      let store = null, cancellationPolicy = null, cancelDeadlineHours = 24
      if (storeIdToUse) {
        const { data: storeData } = await supabase.from('stores').select('id, name, address').eq('id', storeIdToUse).single()
        if (storeData) store = storeData
        const { data: settingsData } = await supabase.from('reservation_settings').select('cancellation_policy, cancellation_deadline_hours').eq('store_id', storeIdToUse).maybeSingle()
        if (settingsData) { cancellationPolicy = settingsData.cancellation_policy || null; cancelDeadlineHours = settingsData.cancellation_deadline_hours || 24 }
      }

      let organization = null
      if (resData.organization_id) {
        const { data: orgData } = await supabase.from('organizations').select('id, slug').eq('id', resData.organization_id).single()
        if (orgData) organization = orgData
      }

      let scenario = null
      const scenarioMasterId = resData.scenario_master_id
      if (scenarioMasterId) {
        if (resData.organization_id) {
          const { data: viewData } = await supabase.from('organization_scenarios_with_master').select('id, title, slug, key_visual_url, duration, player_count_min, player_count_max').eq('id', scenarioMasterId).eq('organization_id', resData.organization_id).maybeSingle()
          if (viewData) {
            scenario = { ...viewData, slug: viewData.slug ?? viewData.id }
          } else {
            const { data: sd } = await supabase.from('scenario_masters').select('id, title, key_visual_url, official_duration, player_count_min, player_count_max').eq('id', scenarioMasterId).single()
            if (sd) scenario = { id: sd.id, title: sd.title, slug: sd.id, key_visual_url: sd.key_visual_url, duration: sd.official_duration ?? null, player_count_min: sd.player_count_min, player_count_max: sd.player_count_max }
          }
        } else {
          const { data: sd } = await supabase.from('scenario_masters').select('id, title, key_visual_url, official_duration, player_count_min, player_count_max').eq('id', scenarioMasterId).single()
          if (sd) scenario = { id: sd.id, title: sd.title, slug: sd.id, key_visual_url: sd.key_visual_url, duration: sd.official_duration ?? null, player_count_min: sd.player_count_min, player_count_max: sd.player_count_max }
        }
      }

      return { reservation, store, organization, scenario, cancellationPolicy, cancelDeadlineHours }
    },
  })
}

export function useCurrentSeatsQuery(scheduleEventId: string | undefined, participantCount: number, maxParticipants: number, enabled: boolean) {
  return useQuery({
    queryKey: reservationDetailKeys.seats(scheduleEventId ?? ''),
    enabled: enabled && !!scheduleEventId,
    queryFn: async () => {
      const { data: sumData } = await supabase.from('reservations').select('participant_count').eq('schedule_event_id', scheduleEventId!).eq('status', 'confirmed')
      const currentParticipants = sumData?.reduce((sum, r) => sum + (r.participant_count || 0), 0) ?? 0
      const otherParticipants = currentParticipants - participantCount
      return maxParticipants - otherParticipants
    },
  })
}

export function useCancelReservationMutation(reservationId: string, onSuccess: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => reservationApi.cancel(reservationId, 'お客様によるキャンセル'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reservationDetailKeys.detail(reservationId) })
      onSuccess()
    },
    onError: (error) => {
      logger.error('予約キャンセルエラー:', error)
    },
  })
}

export function useUpdateParticipantCountMutation(reservationId: string, scheduleEventId: string | null | undefined, organizationId: string | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ newCount, oldCount, reservation }: { newCount: number; oldCount: number; reservation: any }) => {
      await reservationApi.updateParticipantCount(reservationId, newCount)
      const countDiff = newCount - oldCount
      if (countDiff < 0 && scheduleEventId) {
        try {
          const { data: eventData } = await supabase.from('schedule_events_public').select('date, start_time, end_time, scenario, venue, organization_id').eq('id', scheduleEventId).single()
          const orgId = organizationId || eventData?.organization_id
          if (eventData && orgId) {
            await supabase.functions.invoke('notify-waitlist', {
              body: { organizationId: orgId, scheduleEventId, freedSeats: Math.abs(countDiff), scenarioTitle: reservation.title || eventData.scenario || '', eventDate: eventData.date, startTime: eventData.start_time, endTime: eventData.end_time, storeName: eventData.venue || '' }
            })
          }
        } catch (waitlistError) {
          logger.error('キャンセル待ち通知エラー:', waitlistError)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reservationDetailKeys.detail(reservationId) })
    },
    onError: (error) => {
      logger.error('人数変更エラー:', error)
    },
  })
}

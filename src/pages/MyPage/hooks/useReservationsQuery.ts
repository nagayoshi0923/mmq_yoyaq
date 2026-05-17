import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { reservationApi } from '@/lib/reservationApi'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { logger } from '@/utils/logger'
import type { RpcChangeReservationScheduleParams } from '@/lib/rpcTypes'
import type { Reservation, Waitlist, Store } from '@/types'

export const reservationsKeys = {
  all: (userId: string, email: string) => ['mypage-reservations', userId, email] as const,
  availableEvents: (scenarioMasterId: string, currentEventId: string) =>
    ['mypage-available-events', scenarioMasterId, currentEventId] as const,
  eventSeats: (scheduleEventId: string) => ['mypage-event-seats', scheduleEventId] as const,
}

interface ReservationsData {
  reservations: Reservation[]
  waitlist: Waitlist[]
  scenarioImages: Record<string, string>
  scenarioInfo: Record<string, { min: number; max: number }>
  scenarioTitles: Record<string, string>
  stores: Record<string, Store>
  storeDeadlines: Record<string, number>
  storePrivateDeadlines: Record<string, number>
}

export function useReservationsQuery(userId: string | undefined, email: string | undefined) {
  return useQuery({
    queryKey: reservationsKeys.all(userId ?? '', email ?? ''),
    enabled: !!userId || !!email,
    queryFn: async (): Promise<ReservationsData> => {
      // 顧客情報取得
      let customer = null
      if (userId) {
        const { data } = await supabase.from('customers').select('id, user_id').eq('user_id', userId).maybeSingle()
        if (data) customer = data
      }
      if (!customer && email) {
        const { data, error } = await supabase.from('customers').select('id, user_id').ilike('email', email).maybeSingle()
        if (error && error.code !== 'PGRST116') throw error
        if (data) {
          customer = data
          if (!data.user_id && userId) {
            supabase.from('customers').update({ user_id: userId }).eq('id', data.id).then(() => {})
          }
        }
      }

      if (!customer) return { reservations: [], waitlist: [], scenarioImages: {}, scenarioInfo: {}, scenarioTitles: {}, stores: {}, storeDeadlines: {}, storePrivateDeadlines: {} }

      const [waitlistResult, reservationsResult] = await Promise.all([
        supabase.from('waitlist').select('*, schedule_events(id, date, start_time, end_time, venue, scenario)').eq('customer_email', email!).in('status', ['waiting', 'notified']).order('created_at', { ascending: false }),
        supabase.from('reservations').select('*, payment_method, payment_status, schedule_events!schedule_event_id(id, date, start_time, current_participants, max_participants, category)').eq('customer_id', customer.id).order('requested_datetime', { ascending: false }),
      ])

      if (waitlistResult.error) logger.error('キャンセル待ち取得エラー:', waitlistResult.error)
      if (reservationsResult.error) throw reservationsResult.error

      const reservations = reservationsResult.data || []
      const waitlist = waitlistResult.data || []

      const scenarioImages: Record<string, string> = {}
      const scenarioInfo: Record<string, { min: number; max: number }> = {}
      const scenarioTitles: Record<string, string> = {}
      const stores: Record<string, Store> = {}
      const storeDeadlines: Record<string, number> = {}
      const storePrivateDeadlines: Record<string, number> = {}

      if (reservations.length > 0) {
        const storeIds = new Set<string>()
        reservations.forEach(r => {
          if (r.store_id) storeIds.add(r.store_id)
          if (r.candidate_datetimes) {
            const cd = r.candidate_datetimes as any
            if (cd.confirmedStore?.storeId) storeIds.add(cd.confirmedStore.storeId)
            if (cd.requestedStores) cd.requestedStores.forEach((s: any) => { if (s.storeId) storeIds.add(s.storeId) })
          }
        })
        const storeIdsArray = Array.from(storeIds)

        const orgToScenarioIds = new Map<string, Set<string>>()
        const idsWithoutOrg = new Set<string>()
        reservations.forEach(r => {
          const masterId = r.scenario_master_id
          if (!masterId) return
          if (r.organization_id) {
            if (!orgToScenarioIds.has(r.organization_id)) orgToScenarioIds.set(r.organization_id, new Set())
            orgToScenarioIds.get(r.organization_id)!.add(masterId)
          } else {
            idsWithoutOrg.add(masterId)
          }
        })

        const scenarioViewQueries = Array.from(orgToScenarioIds.entries()).map(([orgId, ids]) =>
          supabase.from('organization_scenarios_with_master').select('id, title, key_visual_url, player_count_min, player_count_max').in('id', Array.from(ids)).eq('organization_id', orgId)
        )
        if (idsWithoutOrg.size > 0) {
          scenarioViewQueries.push(supabase.from('scenario_masters').select('id, title, key_visual_url, player_count_min, player_count_max').in('id', Array.from(idsWithoutOrg)) as any)
        }

        const [scenarioResults, storesResult, settingsResult] = await Promise.all([
          scenarioViewQueries.length > 0 ? Promise.all(scenarioViewQueries) : Promise.resolve([]),
          storeIdsArray.length > 0 ? supabase.from('stores').select('id, name, address, color').in('id', storeIdsArray) : Promise.resolve({ data: null, error: null }),
          storeIdsArray.length > 0 ? supabase.from('reservation_settings').select('store_id, cancellation_deadline_hours, private_cancellation_deadline_hours').in('store_id', storeIdsArray) : Promise.resolve({ data: null, error: null }),
        ])

        const allScenarioData = (scenarioResults as { data: { id: string; title: string; key_visual_url: string | null; player_count_min: number; player_count_max: number }[] | null }[]).flatMap(r => r.data ?? [])
        allScenarioData.forEach(s => {
          if (s.key_visual_url) scenarioImages[s.id] = s.key_visual_url
          if (s.title) scenarioTitles[s.id] = s.title
          scenarioInfo[s.id] = { min: s.player_count_min || 1, max: s.player_count_max || 8 }
        })

        if (storesResult.data) {
          storesResult.data.forEach(store => { stores[store.id] = store as Store })
        }
        if (settingsResult.data) {
          settingsResult.data.forEach(setting => {
            if (setting.store_id != null) {
              if (setting.cancellation_deadline_hours != null) storeDeadlines[setting.store_id] = setting.cancellation_deadline_hours
              if (setting.private_cancellation_deadline_hours != null) storePrivateDeadlines[setting.store_id] = setting.private_cancellation_deadline_hours
            }
          })
        }
      }

      return { reservations, waitlist, scenarioImages, scenarioInfo, scenarioTitles, stores, storeDeadlines, storePrivateDeadlines }
    },
  })
}

export function useEventSeatsQuery(scheduleEventId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: reservationsKeys.eventSeats(scheduleEventId ?? ''),
    enabled: enabled && !!scheduleEventId,
    queryFn: async () => {
      const { data } = await supabase.from('schedule_events_public').select('max_participants, current_participants').eq('id', scheduleEventId!).single()
      return data
    },
  })
}

export function useAvailableEventsQuery(scenarioMasterId: string | undefined, currentEventId: string | null | undefined, participantCount: number, enabled: boolean) {
  return useQuery({
    queryKey: reservationsKeys.availableEvents(scenarioMasterId ?? '', currentEventId ?? ''),
    enabled: enabled && !!scenarioMasterId,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data: events, error } = await supabase.from('schedule_events_public').select('id, date, start_time, end_time, max_participants, current_participants, store_id').eq('scenario_master_id', scenarioMasterId!).gte('date', today).eq('is_cancelled', false).neq('id', currentEventId || '').order('date', { ascending: true }).order('start_time', { ascending: true })
      if (error) throw error

      const storeIds = [...new Set((events || []).map(e => e.store_id).filter(Boolean))]
      const storeMap = new Map<string, { id: string; name: string }>()
      if (storeIds.length > 0) {
        const { data: storesData } = await supabase.from('stores_public').select('id, name').in('id', storeIds)
        for (const s of storesData || []) storeMap.set(s.id, s)
      }

      return (events || [])
        .filter(e => (e.max_participants || 0) - (e.current_participants || 0) >= participantCount)
        .map(e => ({
          id: e.id, date: e.date, start_time: e.start_time, end_time: e.end_time,
          max_participants: e.max_participants || 0, current_participants: e.current_participants || 0,
          store_name: storeMap.get(e.store_id)?.name || '未定', store_id: e.store_id || '',
        }))
    },
  })
}

export function useCancelReservationMutation(userId: string | undefined, email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reservationId: string) => reservationApi.cancel(reservationId, 'お客様によるキャンセル'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reservationsKeys.all(userId ?? '', email ?? '') }),
    onError: (error) => logger.error('予約キャンセルエラー:', error),
  })
}

export function useUpdateParticipantsMutation(userId: string | undefined, email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ reservation, newCount }: { reservation: Reservation; newCount: number }) => {
      let pricePerPerson = reservation.unit_price
      if (!pricePerPerson && reservation.participant_count > 0) pricePerPerson = Math.round(((reservation as any).base_price || 0) / reservation.participant_count)
      if (!pricePerPerson && reservation.scenario_master_id) {
        const { data: sd } = await supabase.from('organization_scenarios_with_master').select('participation_fee').eq('id', reservation.scenario_master_id).eq('organization_id', reservation.organization_id).maybeSingle()
        if (sd?.participation_fee) pricePerPerson = sd.participation_fee
      }

      await reservationApi.updateParticipantsWithLock(reservation.id, newCount, (reservation as any).customer_id ?? null)

      if (reservation.schedule_event_id) {
        try { await recalculateCurrentParticipants(reservation.schedule_event_id) } catch (e) { logger.error('参加者数の更新エラー:', e) }
      }

      const countDiff = newCount - reservation.participant_count
      if (countDiff < 0 && reservation.schedule_event_id) {
        try {
          const { data: eventData } = await supabase.from('schedule_events_public').select('date, start_time, end_time, scenario, venue, organization_id').eq('id', reservation.schedule_event_id).single()
          const orgId = reservation.organization_id || eventData?.organization_id
          if (eventData && orgId) {
            await supabase.functions.invoke('notify-waitlist', { body: { organizationId: orgId, scheduleEventId: reservation.schedule_event_id, freedSeats: Math.abs(countDiff), scenarioTitle: reservation.title || eventData.scenario || '', eventDate: eventData.date, startTime: eventData.start_time, endTime: eventData.end_time, storeName: eventData.venue || '' } })
          }
        } catch (e) { logger.error('キャンセル待ち通知エラー:', e) }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reservationsKeys.all(userId ?? '', email ?? '') }),
    onError: (error) => logger.error('予約更新エラー:', error),
  })
}

export function useCancelWaitlistMutation(userId: string | undefined, email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (waitlistId: string) => {
      const { error } = await supabase.from('waitlist').delete().eq('id', waitlistId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reservationsKeys.all(userId ?? '', email ?? '') }),
    onError: (error) => logger.error('キャンセル待ち解除エラー:', error),
  })
}

export function useChangeDateMutation(userId: string | undefined, email: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ reservation, newEventId, newEvent, userEmail }: { reservation: Reservation; newEventId: string; newEvent: any; userEmail: string | undefined }) => {
      const { data: customer } = await supabase.from('customers').select('id').eq('user_id', userId!).single()
      if (!customer) throw new Error('顧客情報が取得できません')

      const params: RpcChangeReservationScheduleParams = { p_reservation_id: reservation.id, p_new_schedule_event_id: newEventId, p_customer_id: customer.id }
      const { error } = await supabase.rpc('change_reservation_schedule', params)
      if (error) {
        if (error.code === 'P0020') throw new Error('選択した公演が見つかりません')
        if (error.code === 'P0021') throw new Error('選択した公演に空席がありません')
        if (error.code === 'P0007') throw new Error('予約が見つかりません')
        if (error.code === 'P0010') throw new Error('この予約を変更する権限がありません')
        throw error
      }

      try {
        await supabase.functions.invoke('send-booking-change-confirmation', { body: { reservationId: reservation.id, customerEmail: userEmail, customerName: reservation.customer_name, scenarioTitle: reservation.title, oldDate: reservation.requested_datetime?.split('T')[0], newDate: newEvent.date, newStartTime: newEvent.start_time, storeName: newEvent.store_name, participantCount: reservation.participant_count } })
      } catch (e) { logger.error('メール送信エラー:', e) }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reservationsKeys.all(userId ?? '', email ?? '') }),
    onError: (error) => logger.error('日程変更エラー:', error),
  })
}

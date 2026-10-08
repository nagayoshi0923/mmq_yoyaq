import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { myPageReservationReadApi } from '@/lib/api/myPageReadApi'
import { reservationApi } from '@/lib/reservationApi'
import { invalidateEverywhere } from '@/lib/queryInvalidation'
import { PRIVATE_REQUEST_WITHDRAWN_REASON } from '@/lib/constants/reservationStatus'
import { logger } from '@/utils/logger'
import type { MyPageData } from './useMyPageDataQuery'
import {
  canCustomerSelfCancel,
  resolveCancellationPolicy,
  resolveCustomerCancelDeadlineHours,
  type CalculableCancellationPolicy,
} from '@/lib/cancellationPolicy'
import {
  DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
  DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS,
} from '@/constants/cancellationPolicyDefaults'

export const reservationDetailKeys = {
  detail: (reservationId: string) => ['reservation-detail', reservationId] as const,
  seats: (scheduleEventId: string) => ['reservation-detail', 'seats', scheduleEventId] as const,
}

export function useReservationDetailQuery(reservationId: string | undefined) {
  return useQuery({
    queryKey: reservationDetailKeys.detail(reservationId ?? ''),
    enabled: !!reservationId,
    queryFn: async () => {
      const { data: resData, error: resError } = await myPageReservationReadApi.findReservationDetail(reservationId!)

      if (resError || !resData) {
        logger.warn('Reservation fetch failed or not accessible')
        return null
      }

      let scheduleEvent = null
      let eventStoreId: string | null = null
      if (resData.schedule_event_id) {
        const { data: eventData, error: eventError } = await myPageReservationReadApi.findPublicEvent(resData.schedule_event_id)
        if (!eventError && eventData) {
          scheduleEvent = {
            date: eventData.date,
            start_time: eventData.start_time,
            is_private_booking: eventData.category === 'private',
            current_participants: eventData.current_participants,
            max_participants: eventData.max_participants,
          }
          eventStoreId = eventData.store_id
        }
      }

      const reservation = { ...resData, schedule_events: scheduleEvent || undefined }

      const storeIdToUse = eventStoreId || resData.store_id
      let store = null
      let cancellationPolicy = null
      let openDeadlineHours = DEFAULT_OPEN_CANCEL_DEADLINE_HOURS
      let privateDeadlineHours = DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS
      if (storeIdToUse) {
        const { data: storeData } = await myPageReservationReadApi.findStore(storeIdToUse)
        if (storeData) store = storeData
        const { data: settingsData } = await myPageReservationReadApi.findReservationSettings(storeIdToUse)
        if (settingsData) {
          cancellationPolicy = settingsData.cancellation_policy || null
          openDeadlineHours = settingsData.cancellation_deadline_hours
            ?? DEFAULT_OPEN_CANCEL_DEADLINE_HOURS
          privateDeadlineHours = settingsData.private_cancellation_deadline_hours
            ?? DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS
        }
      }

      let organization = null
      if (resData.organization_id) {
        const { data: orgData } = await myPageReservationReadApi.findOrganization(resData.organization_id)
        if (orgData) organization = orgData
      }

      let scenario = null
      const scenarioMasterId = resData.scenario_master_id
      if (scenarioMasterId) {
        if (resData.organization_id) {
          const { data: viewData } = await myPageReservationReadApi.findOrganizationScenarioView(scenarioMasterId, resData.organization_id)
          if (viewData) {
            scenario = { ...viewData, slug: viewData.slug ?? viewData.id }
          } else {
            const { data: sd } = await myPageReservationReadApi.findScenarioMaster(scenarioMasterId)
            if (sd) scenario = { id: sd.id, title: sd.title, slug: sd.id, key_visual_url: sd.key_visual_url, duration: sd.official_duration ?? null, player_count_min: sd.player_count_min, player_count_max: sd.player_count_max }
          }
        } else {
          const { data: sd } = await myPageReservationReadApi.findScenarioMaster(scenarioMasterId)
          if (sd) scenario = { id: sd.id, title: sd.title, slug: sd.id, key_visual_url: sd.key_visual_url, duration: sd.official_duration ?? null, player_count_min: sd.player_count_min, player_count_max: sd.player_count_max }
        }
      }

      const isPrivate = Boolean(scheduleEvent?.is_private_booking || resData.private_group_id)
      const resolvedPolicy = resolveCancellationPolicy(reservation)
      let cancelDeadlineHours = isPrivate ? privateDeadlineHours : openDeadlineHours
      let canCancelByPolicy = false

      if (resolvedPolicy.status === 'pending') {
        // 未完成 snapshot は顧客セルフ操作不可
        cancelDeadlineHours = isPrivate
          ? DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS
          : DEFAULT_OPEN_CANCEL_DEADLINE_HOURS
      } else if (scheduleEvent?.date && scheduleEvent?.start_time) {
        const policyForCustomer: CalculableCancellationPolicy = resolvedPolicy.source === 'legacy_default'
          ? {
              ...resolvedPolicy,
              deadlineHours: isPrivate ? privateDeadlineHours : openDeadlineHours,
            }
          : resolvedPolicy

        cancelDeadlineHours = resolveCustomerCancelDeadlineHours(policyForCustomer)
        const participantTotal = reservation.final_price
          ?? reservation.total_price
          ?? ((reservation.unit_price || 0) * (reservation.participant_count || 0))
        canCancelByPolicy = canCustomerSelfCancel({
          performanceDate: scheduleEvent.date,
          performanceStartTime: scheduleEvent.start_time,
          now: new Date(),
          policy: policyForCustomer,
          basisAmounts: {
            participant_total: participantTotal || 0,
            performance_total: participantTotal || 0,
          },
        })
      }

      const changeHours = resData.reservation_change_deadline_hours_snapshot
      const performanceStart = scheduleEvent?.date && scheduleEvent?.start_time
        ? new Date(`${scheduleEvent.date}T${scheduleEvent.start_time}+09:00`).getTime()
        : new Date(resData.requested_datetime).getTime()
      const changeDeadline = changeHours == null || !Number.isFinite(performanceStart)
        ? null : new Date(performanceStart - changeHours * 3600000).toISOString()
      const canChangeByPolicy = changeHours == null || (changeDeadline !== null && Date.now() < Date.parse(changeDeadline))
      return {
        changeDeadline,
        canChangeByPolicy,
        reservation,
        store,
        organization,
        scenario,
        cancellationPolicy,
        cancelDeadlineHours,
        canCancelByPolicy,
      }
    },
  })
}

export function useCurrentSeatsQuery(scheduleEventId: string | undefined, participantCount: number, maxParticipants: number, enabled: boolean) {
  return useQuery({
    queryKey: reservationDetailKeys.seats(scheduleEventId ?? ''),
    enabled: enabled && !!scheduleEventId,
    queryFn: async () => {
      const { data: seat } = await myPageReservationReadApi.findPublicEventSeatCounts(scheduleEventId!)
      const currentParticipants = seat?.current_participants ?? 0
      const effectiveMax = seat?.max_participants ?? maxParticipants
      // 自分の予約分を除いた「他の方の人数」を引く＝自分が選び直せる上限
      const otherParticipants = Math.max(0, currentParticipants - participantCount)
      return Math.max(0, effectiveMax - otherParticipants)
    },
  })
}

export function useCancelReservationMutation(reservationId: string, onSuccess: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => reservationApi.cancel(reservationId, 'お客様によるキャンセル'),
    onSuccess: async (cancelledReservation) => {
      // 取消前の取得結果が後着して保存済み状態を上書きしないよう、先に停止する。
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['mypage-data'] }),
        queryClient.cancelQueries({ queryKey: reservationDetailKeys.detail(reservationId) }),
      ])
      queryClient.setQueriesData<MyPageData>({ queryKey: ['mypage-data'] }, (cached) => {
        if (!cached?.reservations.some((reservation) => reservation.id === reservationId)) return cached
        return {
          ...cached,
          reservations: cached.reservations.map((reservation) => reservation.id === reservationId
            ? { ...reservation, ...cancelledReservation }
            : reservation),
        }
      })
      queryClient.setQueryData<NonNullable<ReturnType<typeof useReservationDetailQuery>['data']>>(
        reservationDetailKeys.detail(reservationId),
        (cached) => cached ? {
          ...cached,
          reservation: {
            ...cached.reservation,
            ...cancelledReservation,
            schedule_events: cached.reservation.schedule_events,
          },
          canCancelByPolicy: false,
          canChangeByPolicy: false,
        } : cached,
      )
      // 一覧を即時更新してから戻る。再取得の失敗は取消失敗にしない。
      void invalidateEverywhere(queryClient, reservationDetailKeys.detail(reservationId), ['mypage-data'])
        .catch((error) => logger.warn('予約取消は保存済み・画面再取得に失敗:', error))
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
          const { data: eventData } = await myPageReservationReadApi.findPublicEventForNotice(scheduleEventId)
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
      invalidateEverywhere(queryClient, ['mypage-data'])
    },
    onError: (error) => {
      logger.error('人数変更エラー:', error)
    },
  })
}

/** 申込中の貸切リクエスト（公演未確定）をお客様自身が取り下げる。予約とグループをまとめて取消する */
export function useWithdrawPrivateRequestMutation(reservationId: string, onSuccess: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => // 本人確認は DB 側が auth.uid() で行うため customer_id は不要
      reservationApi.cancelWithGroupLock(reservationId, null, PRIVATE_REQUEST_WITHDRAWN_REASON),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mypage-data'] }),
        queryClient.invalidateQueries({ queryKey: reservationDetailKeys.detail(reservationId) }),
      ])
      onSuccess()
    },
  })
}

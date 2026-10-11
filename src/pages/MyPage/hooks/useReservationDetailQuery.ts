import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { myPageReservationReadApi } from '@/lib/api/myPageReadApi'
import { reservationApi } from '@/lib/reservationApi'
import { invalidateEverywhere } from '@/lib/queryInvalidation'
import { PRIVATE_REQUEST_WITHDRAWN_REASON } from '@/lib/constants/reservationStatus'
import { logger } from '@/utils/logger'
import { trackPendingNotification } from '@/lib/pendingNotifications'
import type { Reservation } from '@/types'
import type { MyPageData } from './useMyPageDataQuery'
import {
  feeStepsText,
  freeSelfCancelDeadline,
  freeSelfCancelHours,
} from '@/lib/cancellationSummary'
import {
  canCustomerSelfCancel,
  parseJstPerformanceStart,
  resolveCancellationPolicy,
  resolveCustomerCancelDeadlineHours,
  type CalculableCancellationPolicy,
} from '@/lib/cancellationPolicy'
import {
  DEFAULT_OPEN_CANCEL_DEADLINE_HOURS,
  DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS,
} from '@/constants/cancellationPolicyDefaults'

/**
 * 保存が済んだ時点（onSaved）で解決し、残り（通知）は裏で続ける。
 * 保存前の失敗はそのまま失敗として返す。続きはタブを閉じようとしたら確認を出す。
 */
export function resolveWhenSaved<T>(run: (onSaved: (value: T) => void) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let saved = false
    const work = run((value) => { saved = true; resolve(value) })
    trackPendingNotification(work).then(
      (value) => { if (!saved) resolve(value) },
      (error) => {
        if (!saved) reject(error)
        else logger.warn('保存後の通知処理でエラー（保存は完了）:', error)
      },
    )
  })
}

export const reservationDetailKeys = {
  detail: (reservationId: string) => ['reservation-detail', reservationId] as const,
  seats: (scheduleEventId: string) => ['reservation-detail', 'seats', scheduleEventId] as const,
}

/** 人数変更の期限の既定（店舗設定の既定値と同じ 24 時間前） */
export const DEFAULT_RESERVATION_CHANGE_DEADLINE_HOURS = 24

async function loadScenario(scenarioMasterId: string | null | undefined, organizationId: string | null | undefined) {
  if (!scenarioMasterId) return null
  if (organizationId) {
    const { data: viewData } = await myPageReservationReadApi.findOrganizationScenarioView(scenarioMasterId, organizationId)
    if (viewData) return { ...viewData, slug: viewData.slug ?? viewData.id }
  }
  const { data: sd } = await myPageReservationReadApi.findScenarioMaster(scenarioMasterId)
  return sd
    ? { id: sd.id, title: sd.title, slug: sd.id, key_visual_url: sd.key_visual_url, duration: sd.official_duration ?? null, player_count_min: sd.player_count_min, player_count_max: sd.player_count_max }
    : null
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

      // 公演・組織・作品は互いに依存しないので同時に取る（点検 36: 直列の待ちを減らす）
      const organizationPromise = resData.organization_id
        ? myPageReservationReadApi.findOrganization(resData.organization_id)
        : Promise.resolve({ data: null })
      const scenarioPromise = loadScenario(resData.scenario_master_id, resData.organization_id)
      const eventResult = resData.schedule_event_id
        ? await myPageReservationReadApi.findPublicEvent(resData.schedule_event_id)
        : null

      let scheduleEvent = null
      let eventStoreId: string | null = null
      if (eventResult) {
        const { data: eventData, error: eventError } = eventResult
        if (!eventError && eventData) {
          scheduleEvent = {
            date: eventData.date,
            start_time: eventData.start_time,
            end_time: eventData.end_time ?? null,
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
        const [{ data: storeData }, { data: settingsData }] = await Promise.all([
          myPageReservationReadApi.findStore(storeIdToUse),
          myPageReservationReadApi.findReservationSettings(storeIdToUse),
        ])
        if (storeData) store = storeData
        if (settingsData) {
          cancellationPolicy = settingsData.cancellation_policy || null
          openDeadlineHours = settingsData.cancellation_deadline_hours
            ?? DEFAULT_OPEN_CANCEL_DEADLINE_HOURS
          privateDeadlineHours = settingsData.private_cancellation_deadline_hours
            ?? DEFAULT_PRIVATE_CANCEL_DEADLINE_HOURS
        }
      }

      const [{ data: orgData }, scenario] = await Promise.all([organizationPromise, scenarioPromise])
      const organization = orgData ?? null

      const isPrivate = Boolean(scheduleEvent?.is_private_booking || resData.private_group_id)
      const resolvedPolicy = resolveCancellationPolicy(reservation)
      let cancelDeadlineHours = isPrivate ? privateDeadlineHours : openDeadlineHours
      let canCancelByPolicy = false
      let freeCancelDeadline: string | null = null
      let cancelFeeSteps = ''

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
        // 「無料で取消できる期限」と料金の段（点検 39・41）。取消判定と同じ規定から出す
        const freeHours = freeSelfCancelHours(cancelDeadlineHours, policyForCustomer.fees)
        freeCancelDeadline = freeSelfCancelDeadline(
          parseJstPerformanceStart(scheduleEvent.date, scheduleEvent.start_time.slice(0, 5)), freeHours,
        ).toISOString()
        cancelFeeSteps = feeStepsText(policyForCustomer.fees)
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
      // 人数を減らせる期限はキャンセルポリシーの「人数変更は24時間前まで」に合わせる（社長決定 2026-10-11、点検 5）。
      // 予約時に固定した変更期限が無い旧い予約は既定の 24 時間前。
      const decreaseHours = changeHours ?? DEFAULT_RESERVATION_CHANGE_DEADLINE_HOURS
      const decreaseDeadline = Number.isFinite(performanceStart)
        ? new Date(performanceStart - decreaseHours * 3600000).toISOString() : null
      const canDecreaseByPolicy = decreaseDeadline !== null && Date.now() < Date.parse(decreaseDeadline)
      return {
        changeDeadline,
        canChangeByPolicy,
        decreaseDeadline,
        canDecreaseByPolicy,
        freeCancelDeadline,
        cancelFeeSteps,
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
    // 取消の保存が済んだ時点で画面を進める。確認メール・キャンセル待ちへの通知は同じ順で裏で続ける（点検 36）
    mutationFn: () => resolveWhenSaved<Reservation>((onSaved) =>
      reservationApi.cancel(reservationId, 'お客様によるキャンセル', { onSaved })),
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
    // 人数の保存が済んだ時点で画面を進める。確認メール・キャンセル待ちへの通知は裏で続ける（点検 36）
    mutationFn: ({ newCount, oldCount, reservation }: { newCount: number; oldCount: number; reservation: any }) => {
      const countDiff = newCount - oldCount
      const notifyWaitlist = async () => {
        if (countDiff >= 0 || !scheduleEventId) return
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
      return resolveWhenSaved<void>((onSaved) =>
        reservationApi.updateParticipantCount(reservationId, newCount, true, { onSaved: () => onSaved(undefined), afterSaved: notifyWaitlist })
          .then(() => undefined))
    },
    onSuccess: (_data, { newCount, reservation }) => {
      // 再取得を待たずに人数と合計を画面へ出す（点検 36: 不要な待ちを減らす）
      queryClient.setQueryData<NonNullable<ReturnType<typeof useReservationDetailQuery>['data']>>(
        reservationDetailKeys.detail(reservationId),
        (cached) => cached ? {
          ...cached,
          reservation: {
            ...cached.reservation,
            participant_count: newCount,
            // 割引のある予約はサーバーが割引を付け直すので、金額は再取得を待つ（単価×人数で上書きしない）
            ...(reservation?.unit_price && !(Number(reservation?.discount_amount) > 0)
              ? { final_price: reservation.unit_price * newCount, total_price: reservation.unit_price * newCount }
              : {}),
          },
        } : cached,
      )
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

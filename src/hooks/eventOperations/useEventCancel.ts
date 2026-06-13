/**
 * 公演の中止・復活操作（Phase 4-3 で useEventOperations から分割）
 *
 * - handleCancelConfirmPerformance: 中止の入口。
 *     有効予約あり: F-1 と同じ2ステップダイアログ（①キャンセル確認 → ②メール送信
 *       確認）→ 一括キャンセル＋中止。従来の中止確認モーダルは出さない
 *       （削除フローと作法を統一・オーナー指示 2026-06-13）
 *     有効予約なし: 確認ダイアログなしで即中止（復活できる操作のため・同日指示）
 * - executeCancelPerformance: 中止の実体
 *     貸切: 予約をキャンセル（メールあり: reservationApi.cancel / なし: cancelWithLock）
 *     通常: scheduleApi.toggleCancel で中止化 + 紐づく予約のキャンセル
 *       （メール送信は選択制）+ 履歴
 * - handleUncancelPerformance: 中止の取り消し（復活）+ 履歴
 */
import { useState, useCallback, useRef } from 'react'
import { scheduleApi } from '@/lib/api'
import {
  reservationApi,
  RESERVATION_WITH_CUSTOMER_SELECT_FIELDS,
  joinedCustomerFromReservation,
} from '@/lib/reservationApi'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import type { ScheduleEvent } from '@/types/schedule'
import type { RpcAdminUpdateReservationFieldsParams } from '@/lib/rpcTypes'
import {
  DEFAULT_CANCELLATION_REASON,
  fetchActiveReservations,
  formatCustomerLabel,
  isPendingSaveEvent,
  PENDING_SAVE_MESSAGE,
  buildCancelMailComposer,
} from '@/hooks/eventOperations/useEventDelete'
import type { DeleteCancelPrompt, DeleteCancelDecision } from '@/components/schedule/DeleteEventCancelDialog'

interface UseEventCancelProps {
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  organizationId: string | null
  fetchSchedule?: () => Promise<void> | void
}

export function useEventCancel({ setEvents, organizationId, fetchSchedule }: UseEventCancelProps) {
  // F-1 と同型の2ステップ確認ダイアログ（variant: 'cancel'）。
  // Promise の resolver は ref に保持（useEventDelete と同じパターン）
  const [cancelEventPrompt, setCancelEventPrompt] = useState<DeleteCancelPrompt | null>(null)
  const cancelEventResolveRef = useRef<((decision: DeleteCancelDecision | null) => void) | null>(null)

  /** ダイアログを開いてユーザーの決定（実行 or 中断）を待つ */
  const askCancelDecision = useCallback(
    (info: Omit<DeleteCancelPrompt, 'defaultReason' | 'variant'>) =>
      new Promise<DeleteCancelDecision | null>(resolve => {
        cancelEventResolveRef.current = resolve
        setCancelEventPrompt({ ...info, variant: 'cancel', defaultReason: DEFAULT_CANCELLATION_REASON })
      }),
    []
  )

  /** ダイアログ側から決定を受け取る（null = やめる） */
  const resolveCancelEventPrompt = useCallback((decision: DeleteCancelDecision | null) => {
    setCancelEventPrompt(null)
    const resolve = cancelEventResolveRef.current
    cancelEventResolveRef.current = null
    resolve?.(decision)
  }, [])

  /**
   * 中止の実体（貸切 or 通常）。
   * @param sendMail false の場合、予約はキャンセルするがメールは送らない
   */
  const executeCancelPerformance = useCallback(async (
    targetEvent: ScheduleEvent,
    reason: string,
    sendMail: boolean,
    customBodies?: Record<string, string>
  ): Promise<void> => {
    if (targetEvent.is_private_request && targetEvent.reservation_id) {
      // 予約情報を取得（存在＋組織境界の確認）
      let reservationQuery = supabase
        .from('reservations')
        .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
        .eq('id', targetEvent.reservation_id)
      if (organizationId) {
        reservationQuery = reservationQuery.eq('organization_id', organizationId)
      }
      const { data: reservation, error: fetchError } = await reservationQuery.single()

      if (fetchError) throw fetchError

      if (sendMail) {
        // 予約をキャンセル（在庫返却 + システムメッセージ + メール送信まで一括）
        // スタッフ起点の公演中止なので店舗都合（件名・文面を「公演中止」系に）
        await reservationApi.cancel(targetEvent.reservation_id, reason, {
          customEmailBody: customBodies?.[targetEvent.reservation_id],
          cancelledBy: 'store',
        })
      } else {
        // メールなし: ロックつきキャンセルのみ（在庫返却あり・通知なし）
        await reservationApi.cancelWithLock(
          targetEvent.reservation_id,
          reservation.customer_id ?? null,
          reason
        )
      }

      setEvents(prev => prev.map(e =>
        e.reservation_id === targetEvent.reservation_id ? { ...e, is_cancelled: true } : e
      ))
    } else {
      // 通常公演の中止処理
      // 中止前にフル状態スナップショットを取得（履歴用）
      const cancelOldSnapshot = organizationId
        ? await fetchEventSnapshot(targetEvent.id, organizationId)
        : null

      await scheduleApi.toggleCancel(targetEvent.id, true, reason)
      setEvents(prev => prev.map(e =>
        e.id === targetEvent.id ? { ...e, is_cancelled: true, cancellation_reason: reason } : e
      ))

      // 履歴を記録（中止）
      if (organizationId) {
        try {
          const cancelNewSnapshot = await fetchEventSnapshot(targetEvent.id, organizationId)
          const cellTimeSlot =
            (cancelNewSnapshot?.time_slot as string | null | undefined) ??
            (cancelOldSnapshot?.time_slot as string | null | undefined) ??
            targetEvent.time_slot ??
            null
          void createEventHistory(
            targetEvent.id,
            organizationId,
            'cancel',
            cancelOldSnapshot ?? { is_cancelled: false },
            cancelNewSnapshot ?? { is_cancelled: true },
            {
              date: targetEvent.date,
              storeId: targetEvent.venue,
              timeSlot: cellTimeSlot
            }
          )
        } catch (historyError) {
          logger.error('履歴記録エラー（中止）:', historyError)
        }
      }

      // 通常公演の場合、予約者全員の予約をキャンセル（＋選択時はメール送信）
      try {
        let reservationsQuery = supabase
          .from('reservations')
          .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
          .eq('schedule_event_id', targetEvent.id)
          // 確認ダイアログの件数（fetchActiveReservations = キャンセル済み以外）と
          // 揃える。従来の in('confirmed','pending') では gm_confirmed が漏れていた
          .neq('status', 'cancelled')
        if (organizationId) {
          reservationsQuery = reservationsQuery.eq('organization_id', organizationId)
        }
        const { data: reservations, error: resError } = await reservationsQuery

        if (resError) throw resError

        if (reservations && reservations.length > 0) {
          // 各予約をキャンセル状態に更新＋（選択時）メール送信
          const cancelPromises = reservations.map(async (reservation) => {
            // 予約ステータスをcancelledに更新
            try {
              await reservationApi.cancelWithLock(
                reservation.id,
                reservation.customer_id ?? null,
                reason
              )
              logger.log(`予約${reservation.reservation_number}をキャンセル済みに更新`)
            } catch (cancelError) {
              logger.error(`予約${reservation.reservation_number}のキャンセル更新エラー:`, cancelError)
            }

            if (!sendMail) return
            const perfCancelCustomer = joinedCustomerFromReservation(reservation.customers)
            if (!perfCancelCustomer) return

            try {
              await supabase.functions.invoke('send-cancellation-confirmation', {
                body: {
                  organizationId: organizationId,
                  storeId: targetEvent.store_id,
                  reservationId: reservation.id,
                  customerEmail: perfCancelCustomer.email,
                  customerName: perfCancelCustomer.name,
                  scenarioTitle: reservation.title || targetEvent.scenario,
                  eventDate: targetEvent.date,
                  startTime: targetEvent.start_time,
                  endTime: targetEvent.end_time,
                  storeName: targetEvent.venue,
                  participantCount: reservation.participant_count,
                  totalPrice: reservation.total_price || 0,
                  reservationNumber: reservation.reservation_number,
                  cancelledBy: 'store',
                  cancellationReason: reason,
                  // ダイアログで全文編集された本文（あればテンプレート生成より優先）
                  customEmailBody: customBodies?.[reservation.id]
                }
              })
            } catch (emailErr) {
              logger.error(`予約${reservation.reservation_number}へのメール送信エラー:`, emailErr)
            }
          })

          await Promise.all(cancelPromises)
          logger.log(`${reservations.length}件の予約をキャンセル処理完了`)
        }
      } catch (emailError) {
        logger.error('予約キャンセル処理エラー:', emailError)
        // 処理失敗しても公演中止は続行
      }
    }
  }, [setEvents, organizationId])

  // 中止の入口（右クリックメニュー等から）。
  // 有効予約がある場合は削除（F-1）と同じ
  //   ① 予約キャンセルの確認 → ② メール送信の確認 → 一括キャンセル → 中止実行
  // の2ステップダイアログを通す。予約ゼロのときは確認ダイアログなしで即中止
  // （中止は復活できる操作のため・オーナー指示 2026-06-13）。
  const handleCancelConfirmPerformance = useCallback(async (event: ScheduleEvent) => {
    if (isPendingSaveEvent(event)) {
      showToast.warning(PENDING_SAVE_MESSAGE)
      return
    }
    try {
      let active = await fetchActiveReservations(event, organizationId)

      // 未承認の貸切リクエスト（実公演がまだ無い擬似イベント）は schedule_event_id
      // からは予約を辿れないが、申込者本人が有効な予約として存在する。
      // 数え漏らすと申込者がいるのに無確認・メールなしで中止されてしまう。
      if (active.length === 0 && event.is_private_request && event.reservation_id) {
        let mainQuery = supabase
          .from('reservations')
          .select('id, customer_name, customer_email, reservation_number, participant_count, total_price, payment_method')
          .eq('id', event.reservation_id)
          .neq('status', 'cancelled')
        if (organizationId) {
          mainQuery = mainQuery.eq('organization_id', organizationId)
        }
        const { data: mainReservation } = await mainQuery.maybeSingle()
        if (mainReservation) active = [mainReservation]
      }

      if (active.length === 0) {
        // 予約なし: 確認ダイアログなしで即中止（復活可能なので軽い操作でよい）
        await executeCancelPerformance(event, DEFAULT_CANCELLATION_REASON, false)
        showToast.success('公演を中止しました')
        return
      }
      // 予約あり: 2ステップダイアログが中止の確定を兼ねる
      const composer = await buildCancelMailComposer(event, active)
      const decision = await askCancelDecision({
        count: active.length,
        customers: active.map(formatCustomerLabel),
        ...composer,
      })
      if (!decision) return
      const reason = decision.reason.trim() || DEFAULT_CANCELLATION_REASON
      showToast.info(`${active.length}件の予約をキャンセルしています…`)
      await executeCancelPerformance(event, reason, decision.sendMail, decision.bodies)
      showToast.success(
        `公演を中止し、${active.length}件の予約をキャンセルしました` +
        (decision.sendMail ? '（メール送信済み）' : '（メール送信なし）')
      )
    } catch (error) {
      logger.error('公演中止エラー:', error)
      showToast.error(getSafeErrorMessage(error, '公演の中止処理に失敗しました'))
    }
  }, [organizationId, askCancelDecision, executeCancelPerformance])

  // 公演をキャンセル解除
  const handleUncancelPerformance = useCallback(async (event: ScheduleEvent) => {
    try {
      // 復活前にフル状態スナップショットを取得（履歴用）
      const restoreOldSnapshot = organizationId
        ? await fetchEventSnapshot(event.id, organizationId)
        : null

      // schedule_events.is_cancelled を必ず false に更新
      await scheduleApi.toggleCancel(event.id, false)

      // 貸切予約の場合は予約ステータスも更新
      if (event.is_private_request && event.reservation_id) {
        const uncancelParams: RpcAdminUpdateReservationFieldsParams = {
          p_reservation_id: event.reservation_id,
          p_updates: { status: 'gm_confirmed' },
        }
        const { error } = await supabase.rpc('admin_update_reservation_fields', uncancelParams)

        if (error) {
          logger.error('予約ステータス更新エラー:', error)
          // エラーでも公演自体は復活済みなので続行
        }
      }

      // ローカル状態を更新
      setEvents(prev => prev.map(e => {
        if (event.reservation_id && e.reservation_id === event.reservation_id) {
          return { ...e, is_cancelled: false }
        }
        if (e.id === event.id) {
          return { ...e, is_cancelled: false }
        }
        return e
      }))

      // 履歴を記録（復活）
      if (organizationId) {
        try {
          const restoreNewSnapshot = await fetchEventSnapshot(event.id, organizationId)
          const cellTimeSlot =
            (restoreNewSnapshot?.time_slot as string | null | undefined) ??
            (restoreOldSnapshot?.time_slot as string | null | undefined) ??
            event.time_slot ??
            null
          void createEventHistory(
            event.id,
            organizationId,
            'restore',
            restoreOldSnapshot ?? { is_cancelled: true },
            restoreNewSnapshot ?? { is_cancelled: false },
            {
              date: event.date,
              storeId: event.venue,
              timeSlot: cellTimeSlot
            }
          )
        } catch (historyError) {
          logger.error('履歴記録エラー（復活）:', historyError)
        }
      }
      
      showToast.success('公演を復活しました')
    } catch (error) {
      logger.error('公演キャンセル解除エラー:', error)
      showToast.error('公演のキャンセル解除処理に失敗しました')
    }
  }, [setEvents, organizationId])

  return {
    handleCancelConfirmPerformance,
    handleUncancelPerformance,
    // F-1 と同型の2ステップ確認ダイアログ（DeleteEventCancelDialog に渡す）
    cancelEventPrompt,
    resolveCancelEventPrompt,
  }
}

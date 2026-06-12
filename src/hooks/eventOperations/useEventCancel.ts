/**
 * 公演の中止・復活操作（Phase 4-3 で useEventOperations から分割）
 *
 * - handleCancelConfirmPerformance: 中止確認ダイアログを開く（理由入力をリセット）
 * - handleConfirmCancel: 中止の実行
 *     貸切: 予約をキャンセル（キャンセルメール送信を含む reservationApi.cancel 系）
 *     通常: scheduleApi.toggleCancel で中止化 + 紐づく予約のキャンセル + 履歴
 * - handleUncancelPerformance: 中止の取り消し（復活）+ 履歴
 */
import { useState, useCallback } from 'react'
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

interface UseEventCancelProps {
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  organizationId: string | null
  fetchSchedule?: () => Promise<void> | void
}

export function useEventCancel({ setEvents, organizationId, fetchSchedule }: UseEventCancelProps) {
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancellingEvent, setCancellingEvent] = useState<ScheduleEvent | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')

  // 中止確認ダイアログを開く
  const handleCancelConfirmPerformance = useCallback((event: ScheduleEvent) => {
    setCancellingEvent(event)
    setCancellationReason('')  // リセット
    setIsCancelDialogOpen(true)
  }, [])

  // 中止を実行
  const handleConfirmCancel = useCallback(async () => {
    if (!cancellingEvent) return

    try {
      if (cancellingEvent.is_private_request && cancellingEvent.reservation_id) {
        // 予約情報を取得
        let reservationQuery = supabase
          .from('reservations')
          .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
          .eq('id', cancellingEvent.reservation_id)
        if (organizationId) {
          reservationQuery = reservationQuery.eq('organization_id', organizationId)
        }
        const { data: reservation, error: fetchError } = await reservationQuery.single()

        if (fetchError) throw fetchError

        // 予約をキャンセル（在庫返却 + 通知）
        const reason = cancellationReason || '誠に申し訳ございませんが、やむを得ない事情により公演を中止させていただくこととなりました。'
        await reservationApi.cancel(
          cancellingEvent.reservation_id,
          reason
        )
        
        setEvents(prev => prev.map(e => 
          e.reservation_id === cancellingEvent.reservation_id ? { ...e, is_cancelled: true } : e
        ))

        // キャンセル確認メールは reservationApi.cancel() 内で送信済み
      } else {
        // 通常公演の中止処理
        // 中止前にフル状態スナップショットを取得（履歴用）
        const cancelOldSnapshot = organizationId
          ? await fetchEventSnapshot(cancellingEvent.id, organizationId)
          : null

        const reason = cancellationReason || '誠に申し訳ございませんが、やむを得ない事情により公演を中止させていただくこととなりました。'
        await scheduleApi.toggleCancel(cancellingEvent.id, true, reason)
        setEvents(prev => prev.map(e =>
          e.id === cancellingEvent.id ? { ...e, is_cancelled: true, cancellation_reason: reason } : e
        ))

        // 履歴を記録（中止）
        if (organizationId) {
          try {
            const cancelNewSnapshot = await fetchEventSnapshot(cancellingEvent.id, organizationId)
            const cellTimeSlot =
              (cancelNewSnapshot?.time_slot as string | null | undefined) ??
              (cancelOldSnapshot?.time_slot as string | null | undefined) ??
              cancellingEvent.time_slot ??
              null
            void createEventHistory(
              cancellingEvent.id,
              organizationId,
              'cancel',
              cancelOldSnapshot ?? { is_cancelled: false },
              cancelNewSnapshot ?? { is_cancelled: true },
              {
                date: cancellingEvent.date,
                storeId: cancellingEvent.venue,
                timeSlot: cellTimeSlot
              }
            )
          } catch (historyError) {
            logger.error('履歴記録エラー（中止）:', historyError)
          }
        }

        // 通常公演の場合、予約者全員の予約をキャンセル＆メール送信
        try {
          let reservationsQuery = supabase
            .from('reservations')
            .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
            .eq('schedule_event_id', cancellingEvent.id)
            .in('status', ['confirmed', 'pending'])
          if (organizationId) {
            reservationsQuery = reservationsQuery.eq('organization_id', organizationId)
          }
          const { data: reservations, error: resError } = await reservationsQuery

          if (resError) throw resError

          if (reservations && reservations.length > 0) {
            // 各予約をキャンセル状態に更新＋メール送信
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
              
              const perfCancelCustomer = joinedCustomerFromReservation(reservation.customers)
              if (!perfCancelCustomer) return

              try {
                await supabase.functions.invoke('send-cancellation-confirmation', {
                  body: {
                    organizationId: organizationId,
                    storeId: cancellingEvent.store_id,
                    reservationId: reservation.id,
                    customerEmail: perfCancelCustomer.email,
                    customerName: perfCancelCustomer.name,
                    scenarioTitle: reservation.title || cancellingEvent.scenario,
                    eventDate: cancellingEvent.date,
                    startTime: cancellingEvent.start_time,
                    endTime: cancellingEvent.end_time,
                    storeName: cancellingEvent.venue,
                    participantCount: reservation.participant_count,
                    totalPrice: reservation.total_price || 0,
                    reservationNumber: reservation.reservation_number,
                    cancelledBy: 'store',
                    cancellationReason: reason
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

      setIsCancelDialogOpen(false)
      setCancellingEvent(null)
    } catch (error) {
      logger.error('公演中止エラー:', error)
      showToast.error('公演の中止処理に失敗しました')
    }
  }, [cancellingEvent, cancellationReason, setEvents, organizationId])

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
    isCancelDialogOpen,
    setIsCancelDialogOpen,
    cancellingEvent,
    cancellationReason,
    setCancellationReason,
    handleCancelConfirmPerformance,
    handleConfirmCancel,
    handleUncancelPerformance,
  }
}

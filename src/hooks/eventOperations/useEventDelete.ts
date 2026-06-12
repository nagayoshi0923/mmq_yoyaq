/**
 * 公演の削除操作（Phase 4-3 で useEventOperations から分割）
 *
 * - handleDeletePerformance: 削除確認ダイアログを開く
 * - handleConfirmDelete: ダイアログからの削除実行
 *     貸切: 予約RPC削除 + 紐づく schedule_events 削除 + 履歴
 *     通常: 有効予約があれば拒否（中止を案内）/ なければ削除 + 履歴
 * - deleteEventDirectly: 確認ダイアログなしの直接削除（予約一覧モーダルから使用）
 *
 * NOTE: handleConfirmDelete と deleteEventDirectly の貸切削除ロジックは
 * 分割前から重複している（挙動保存のためそのまま移動）。統合は別コミットで行う。
 */
import { useState, useCallback } from 'react'
import { scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import type { ScheduleEvent } from '@/types/schedule'
import type { RpcAdminDeleteReservationsByIdsParams } from '@/lib/rpcTypes'

interface UseEventDeleteProps {
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  organizationId: string | null
}

export function useEventDelete({ setEvents, organizationId }: UseEventDeleteProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingEvent, setDeletingEvent] = useState<ScheduleEvent | null>(null)

  // 削除確認ダイアログを開く
  const handleDeletePerformance = useCallback(async (event: ScheduleEvent) => {
    setDeletingEvent(event)
    setIsDeleteDialogOpen(true)
  }, [])

  // 公演を削除
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingEvent) return

    try {
      // 貸切予約の判定:
      // - is_private_request フラグ（未承認の擬似イベント）
      // - 合成ID（`private-UUID-n` / `UUID-n` 形式）
      // - 承認済み貸切: category='private' かつ予約リンク(reservation_id)あり
      //   （承認RPCが作る本物のUUID行は上2つに合致せず、通常公演扱いで
      //     「有効予約があるため削除不可」に誤って弾かれていた 2026-06-12修正）
      const isPrivateBooking = deletingEvent.is_private_request ||
                               deletingEvent.id.startsWith('private-') ||
                               (deletingEvent.id.includes('-') && deletingEvent.id.split('-').length > 5) ||
                               (deletingEvent.category === 'private' && !!deletingEvent.reservation_id)
      
      if (isPrivateBooking) {
        // reservation_idが直接指定されている場合、それを使用
        // そうでない場合、IDからUUID部分を抽出
        let reservationId = deletingEvent.reservation_id
        if (!reservationId) {
          if (deletingEvent.id.startsWith('private-')) {
            // `private-UUID-数字`形式の場合、`private-`を除去してUUID部分を取得
            const parts = deletingEvent.id.replace(/^private-/, '').split('-')
            reservationId = parts.slice(0, 5).join('-')
          } else if (deletingEvent.id.includes('-') && deletingEvent.id.split('-').length > 5) {
            // `UUID-数字`形式の場合、UUID部分（最初の5つの要素）を取得
            reservationId = deletingEvent.id.split('-').slice(0, 5).join('-')
          } else {
            reservationId = deletingEvent.id
          }
        }
        
        // まず予約情報を取得してschedule_event_idを確認
        let reservationQuery = supabase
          .from('reservations')
          .select('schedule_event_id')
          .eq('id', reservationId)
        if (organizationId) {
          reservationQuery = reservationQuery.eq('organization_id', organizationId)
        }
        const { data: reservation, error: fetchError } = await reservationQuery.single()
        
        if (fetchError) {
          logger.error('予約情報取得エラー:', fetchError)
        }
        
        // 予約を削除
        const deleteParams1: RpcAdminDeleteReservationsByIdsParams = { p_reservation_ids: [reservationId] }
        const { error } = await supabase.rpc('admin_delete_reservations_by_ids', deleteParams1)

        if (error) throw error

        // schedule_event_idが紐付いている場合、schedule_eventsも削除
        if (reservation?.schedule_event_id) {
          // 削除前にイベント情報を取得（履歴用）
          let eventQuery = supabase
            .from('schedule_events_staff_view')
            .select('id, organization_id, date, venue, store_id, scenario, scenario_master_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, reservation_name, time_slot, venue_rental_fee')
            .eq('id', reservation.schedule_event_id)
          if (organizationId) {
            eventQuery = eventQuery.eq('organization_id', organizationId)
          }
          const { data: eventToDelete } = await eventQuery.single()

          let scheduleDeleteQuery = supabase
            .from('schedule_events')
            .delete()
            .eq('id', reservation.schedule_event_id)
          if (organizationId) {
            scheduleDeleteQuery = scheduleDeleteQuery.eq('organization_id', organizationId)
          }
          const { error: scheduleError } = await scheduleDeleteQuery
          
          if (scheduleError) {
            logger.error('schedule_events削除エラー:', scheduleError)
            // エラーでも処理は続行（予約は削除済み）
          }
          
          // 履歴を記録（貸切予約削除）
          if (organizationId && eventToDelete) {
            try {
              void createEventHistory(
                null,  // 削除後なのでnull
                organizationId,
                'delete',
                eventToDelete,
                {},
                {
                  date: eventToDelete.date,
                  storeId: eventToDelete.store_id || deletingEvent.venue,
                  timeSlot: eventToDelete.time_slot || null
                },
                {
                  deletedEventScenario: eventToDelete.scenario || deletingEvent.scenario
                }
              )
            } catch (historyError) {
              logger.error('履歴記録エラー（貸切予約削除）:', historyError)
            }
          }
        }
        
        setEvents(prev => prev.filter(event => {
          // イベントのreservation_idを取得（複合IDの場合はUUID部分を抽出）
          let eventReservationId = event.reservation_id
          if (!eventReservationId) {
            if (event.id.startsWith('private-')) {
              const parts = event.id.replace(/^private-/, '').split('-')
              eventReservationId = parts.slice(0, 5).join('-')
            } else if (event.id.includes('-') && event.id.split('-').length > 5) {
              eventReservationId = event.id.split('-').slice(0, 5).join('-')
            }
          }
          return eventReservationId !== reservationId
        }))
      } else {
        // 通常の公演を削除する前に、アクティブな予約の有無をチェック
        // キャンセル済みの予約は除外して確認
        let reservationsCheckQuery = supabase
          .from('reservations')
          .select('id')
          .eq('schedule_event_id', deletingEvent.id)
          .neq('status', 'cancelled')  // キャンセル済みは除外
        if (organizationId) {
          reservationsCheckQuery = reservationsCheckQuery.eq('organization_id', organizationId)
        }
        const { data: reservations, error: checkError } = await reservationsCheckQuery
        
        if (checkError) {
          logger.error('予約チェックエラー:', checkError)
          throw new Error('予約情報の確認に失敗しました')
        }
        
        if (reservations && reservations.length > 0) {
          // アクティブな予約がある場合は削除を拒否
          showToast.warning(`この公演には${reservations.length}件の有効な予約が紐付いているため削除できません`, '代わりに「中止」機能を使用してください。中止にすると、予約者に通知され、公演は非表示になります。')
          setIsDeleteDialogOpen(false)
          setDeletingEvent(null)
          return
        }
        
        // 予約がない場合のみ削除を実行
        // 削除前にイベント情報を取得（履歴用）
        let eventQuery = supabase
          .from('schedule_events_staff_view')
          .select('id, organization_id, date, venue, store_id, scenario, scenario_master_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, reservation_name, time_slot, venue_rental_fee')
          .eq('id', deletingEvent.id)
        if (organizationId) {
          eventQuery = eventQuery.eq('organization_id', organizationId)
        }
        const { data: eventToDelete } = await eventQuery.single()
        
        await scheduleApi.delete(deletingEvent.id)
        
        // 履歴を記録（削除）
        if (organizationId && eventToDelete) {
          try {
            void createEventHistory(
              null,  // 削除後なのでnull
              organizationId,
              'delete',
              eventToDelete,
              {},
              {
                date: eventToDelete.date,
                storeId: eventToDelete.store_id || deletingEvent.venue,
                timeSlot: eventToDelete.time_slot || null
              },
              {
                deletedEventScenario: eventToDelete.scenario || deletingEvent.scenario
              }
            )
          } catch (historyError) {
            logger.error('履歴記録エラー（削除）:', historyError)
          }
        }
        
        setEvents(prev => prev.filter(event => event.id !== deletingEvent.id))
      }

      setIsDeleteDialogOpen(false)
      setDeletingEvent(null)
    } catch (error) {
      logger.error('公演削除エラー:', error)

      // エラーメッセージを詳細化
      showToast.error(getSafeErrorMessage(error, '公演の削除に失敗しました'))
      
      setIsDeleteDialogOpen(false)
      setDeletingEvent(null)
    }
  }, [deletingEvent, setEvents, organizationId])

  // 貸切公演を直接削除（確認ダイアログなし - ReservationListから呼び出し用）
  const deleteEventDirectly = useCallback(async (eventToDelete: ScheduleEvent) => {
    try {
      // 貸切予約の判定（handleConfirmDelete と同条件。2026-06-12 に承認済み貸切の判定を追加）
      const isPrivateBooking = eventToDelete.is_private_request ||
                               eventToDelete.id.startsWith('private-') ||
                               (eventToDelete.id.includes('-') && eventToDelete.id.split('-').length > 5) ||
                               (eventToDelete.category === 'private' && !!eventToDelete.reservation_id)
      
      if (isPrivateBooking) {
        // reservation_idが直接指定されている場合、それを使用
        // そうでない場合、IDからUUID部分を抽出
        let reservationId = eventToDelete.reservation_id
        if (!reservationId) {
          if (eventToDelete.id.startsWith('private-')) {
            // `private-UUID-数字`形式の場合、`private-`を除去してUUID部分を取得
            const parts = eventToDelete.id.replace(/^private-/, '').split('-')
            reservationId = parts.slice(0, 5).join('-')
          } else if (eventToDelete.id.includes('-') && eventToDelete.id.split('-').length > 5) {
            // `UUID-数字`形式の場合、UUID部分（最初の5つの要素）を取得
            reservationId = eventToDelete.id.split('-').slice(0, 5).join('-')
          } else {
            reservationId = eventToDelete.id
          }
        }
        
        // まず予約情報を取得してschedule_event_idを確認
        let reservationQuery = supabase
          .from('reservations')
          .select('schedule_event_id')
          .eq('id', reservationId)
        if (organizationId) {
          reservationQuery = reservationQuery.eq('organization_id', organizationId)
        }
        const { data: reservation, error: fetchError } = await reservationQuery.single()
        
        if (fetchError) {
          logger.error('予約情報取得エラー:', fetchError)
        }
        
        // 予約を削除
        const deleteParams2: RpcAdminDeleteReservationsByIdsParams = { p_reservation_ids: [reservationId] }
        const { error } = await supabase.rpc('admin_delete_reservations_by_ids', deleteParams2)

        if (error) throw error

        // schedule_event_idが紐付いている場合、schedule_eventsも削除
        if (reservation?.schedule_event_id) {
          // 削除前にイベント情報を取得（履歴用）
          let eventQuery = supabase
            .from('schedule_events_staff_view')
            .select('id, organization_id, date, venue, store_id, scenario, scenario_master_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, reservation_name, time_slot, venue_rental_fee')
            .eq('id', reservation.schedule_event_id)
          if (organizationId) {
            eventQuery = eventQuery.eq('organization_id', organizationId)
          }
          const { data: scheduleEventToDelete } = await eventQuery.single()
          
          let scheduleDeleteQuery = supabase
            .from('schedule_events')
            .delete()
            .eq('id', reservation.schedule_event_id)
          if (organizationId) {
            scheduleDeleteQuery = scheduleDeleteQuery.eq('organization_id', organizationId)
          }
          const { error: scheduleError } = await scheduleDeleteQuery
          
          if (scheduleError) {
            logger.error('schedule_events削除エラー:', scheduleError)
          }
          
          // 履歴を記録（貸切予約削除）
          if (organizationId && scheduleEventToDelete) {
            try {
              void createEventHistory(
                null,
                organizationId,
                'delete',
                scheduleEventToDelete,
                {},
                {
                  date: scheduleEventToDelete.date,
                  storeId: scheduleEventToDelete.store_id || eventToDelete.venue,
                  timeSlot: scheduleEventToDelete.time_slot || null
                },
                {
                  deletedEventScenario: scheduleEventToDelete.scenario || eventToDelete.scenario
                }
              )
            } catch (historyError) {
              logger.error('履歴記録エラー（貸切予約削除）:', historyError)
            }
          }
        }
        
        setEvents(prev => prev.filter(event => {
          // イベントのreservation_idを取得（複合IDの場合はUUID部分を抽出）
          let eventReservationId = event.reservation_id
          if (!eventReservationId) {
            if (event.id.startsWith('private-')) {
              const parts = event.id.replace(/^private-/, '').split('-')
              eventReservationId = parts.slice(0, 5).join('-')
            } else if (event.id.includes('-') && event.id.split('-').length > 5) {
              eventReservationId = event.id.split('-').slice(0, 5).join('-')
            }
          }
          return eventReservationId !== reservationId
        }))
      } else {
        // 通常の公演の場合
        // 削除前にフル状態スナップショットを取得（履歴用）
        const eventToDeleteSnapshot = organizationId
          ? await fetchEventSnapshot(eventToDelete.id, organizationId)
          : null

        await scheduleApi.delete(eventToDelete.id)

        // 履歴を記録（削除）
        if (organizationId) {
          try {
            void createEventHistory(
              null,
              organizationId,
              'delete',
              eventToDeleteSnapshot ?? (eventToDelete as unknown as Record<string, unknown>),
              {},
              {
                date: eventToDelete.date,
                storeId: eventToDelete.store_id || eventToDelete.venue,
                timeSlot: eventToDelete.time_slot || null
              },
              {
                deletedEventScenario: eventToDelete.scenario
              }
            )
          } catch (historyError) {
            logger.error('履歴記録エラー（削除）:', historyError)
          }
        }
        
        setEvents(prev => prev.filter(event => event.id !== eventToDelete.id))
      }
    } catch (error) {
      logger.error('公演削除エラー:', error)
      throw error
    }
  }, [setEvents, organizationId])

  return {
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    deletingEvent,
    handleDeletePerformance,
    handleConfirmDelete,
    deleteEventDirectly,
  }
}

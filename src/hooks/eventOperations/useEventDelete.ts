/**
 * 公演の削除操作（Phase 4-3 で useEventOperations から分割）
 *
 * - handleDeletePerformance: 削除確認ダイアログを開く
 * - handleConfirmDelete: ダイアログからの削除実行
 *     貸切: 公演を削除し、申込（reservations）は**キャンセル状態で保持** + 履歴
 *     通常: 有効予約があれば拒否（中止を案内）/ なければ削除 + 履歴
 * - deleteEventDirectly: 確認ダイアログなしの直接削除（予約一覧モーダルから使用）
 *
 * 2026-06-12 仕様変更（オーナー指示）:
 *   貸切削除時に申込レコードを物理削除（admin_delete_reservations_by_ids）して
 *   いたが、顧客との取引記録が消えるのは台帳管理上問題のため、
 *   status='cancelled' への更新（記録保持）に変更。
 *   あわせて履歴用スナップショットを「削除の前」に取得する順序へ修正
 *   （従来は予約削除→公演参照の順だったため参照が空振りし、削除履歴が
 *   記録されないことがあった）。
 */
import { useState, useCallback } from 'react'
import { scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import type { ScheduleEvent } from '@/types/schedule'
import type { RpcAdminUpdateReservationFieldsParams } from '@/lib/rpcTypes'

interface UseEventDeleteProps {
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  organizationId: string | null
}

/**
 * 貸切イベントかどうかの判定。
 * - is_private_request フラグ（未承認の擬似イベント）
 * - 合成ID（`private-UUID-n` / `UUID-n` 形式）
 * - 承認済み貸切: category='private' かつ予約リンク(reservation_id)あり
 *   （承認RPCが作る本物のUUID行は上2つに合致せず、通常公演扱いで
 *     「有効予約があるため削除不可」に誤って弾かれていた 2026-06-12修正）
 */
function isPrivateBookingEvent(event: ScheduleEvent): boolean {
  return Boolean(
    event.is_private_request ||
    event.id.startsWith('private-') ||
    (event.id.includes('-') && event.id.split('-').length > 5) ||
    (event.category === 'private' && event.reservation_id)
  )
}

/** イベント（合成IDの場合あり）から予約IDを解決する */
function resolveReservationId(event: { id: string; reservation_id?: string | null }): string {
  if (event.reservation_id) return event.reservation_id
  if (event.id.startsWith('private-')) {
    // `private-UUID-数字`形式: `private-` を除去して UUID 部分を取得
    return event.id.replace(/^private-/, '').split('-').slice(0, 5).join('-')
  }
  if (event.id.includes('-') && event.id.split('-').length > 5) {
    // `UUID-数字`形式: UUID 部分（最初の5要素）を取得
    return event.id.split('-').slice(0, 5).join('-')
  }
  return event.id
}

/** 本物の schedule_events 行の UUID か（合成IDでないか） */
function isRealScheduleEventId(id: string): boolean {
  return !id.startsWith('private-') && id.split('-').length === 5
}

/**
 * 貸切公演の削除（共通実装）:
 * ① 履歴用スナップショットを先に取得（mutation の前！）
 * ② 申込を物理削除せず status='cancelled' に更新（顧客記録を保持）
 * ③ schedule_events 行を削除
 * ④ 削除履歴を記録
 * ⑤ ローカル state から除去
 */
async function deletePrivateBookingEventCore(
  targetEvent: ScheduleEvent,
  organizationId: string | null,
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
): Promise<void> {
  const reservationId = resolveReservationId(targetEvent)

  // 予約情報を取得（schedule_event_id とステータス確認）
  let reservationQuery = supabase
    .from('reservations')
    .select('id, schedule_event_id, status')
    .eq('id', reservationId)
  if (organizationId) {
    reservationQuery = reservationQuery.eq('organization_id', organizationId)
  }
  const { data: reservation, error: fetchError } = await reservationQuery.maybeSingle()
  if (fetchError) {
    logger.error('予約情報取得エラー:', fetchError)
  }

  // 削除対象の schedule_events 行を解決
  const scheduleEventId =
    reservation?.schedule_event_id ||
    (isRealScheduleEventId(targetEvent.id) ? targetEvent.id : null)

  // ① スナップショットは mutation の前に取得（履歴の空振り防止）
  const snapshot = scheduleEventId && organizationId
    ? await fetchEventSnapshot(scheduleEventId, organizationId)
    : null

  // ② 申込はキャンセル状態で保持（物理削除しない）
  if (reservation && reservation.status !== 'cancelled') {
    const cancelParams: RpcAdminUpdateReservationFieldsParams = {
      p_reservation_id: reservationId,
      p_updates: { status: 'cancelled' },
    }
    const { error: cancelError } = await supabase.rpc('admin_update_reservation_fields', cancelParams)
    if (cancelError) {
      logger.error('貸切申込のキャンセル更新エラー:', cancelError)
      throw cancelError
    }
  }

  // ③ 公演行を削除
  if (scheduleEventId) {
    let deleteQuery = supabase
      .from('schedule_events')
      .delete()
      .eq('id', scheduleEventId)
    if (organizationId) {
      deleteQuery = deleteQuery.eq('organization_id', organizationId)
    }
    const { error: scheduleError } = await deleteQuery
    if (scheduleError) {
      logger.error('schedule_events削除エラー:', scheduleError)
      // 申込はキャンセル済みのため処理は続行（公演はリロードで再同期される）
    }
  }

  // ④ 履歴を記録（スナップショットが取れなかった場合は画面上の情報で代替）
  if (organizationId) {
    try {
      const fallback = {
        scenario: targetEvent.scenario,
        date: targetEvent.date,
        store_id: targetEvent.venue,
        start_time: targetEvent.start_time,
        end_time: targetEvent.end_time,
        gms: targetEvent.gms,
        reservation_name: targetEvent.reservation_name || '',
      }
      void createEventHistory(
        null,  // 削除後なのでnull
        organizationId,
        'delete',
        snapshot ?? fallback,
        {},
        {
          date: targetEvent.date,
          storeId: (snapshot?.store_id as string | undefined) || targetEvent.venue,
          timeSlot: (snapshot?.time_slot as string | null | undefined) ?? targetEvent.time_slot ?? null,
        },
        {
          deletedEventScenario: (snapshot?.scenario as string | undefined) || targetEvent.scenario,
          notes: '貸切公演を削除（申込はキャンセルとして保持）',
        }
      )
    } catch (historyError) {
      logger.error('履歴記録エラー（貸切公演削除）:', historyError)
    }
  }

  // ⑤ ローカル state から除去（本物ID・合成IDの両形式に対応）
  setEvents(prev => prev.filter(event => {
    if (event.id === targetEvent.id) return false
    return resolveReservationId(event) !== reservationId
  }))
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
      if (isPrivateBookingEvent(deletingEvent)) {
        await deletePrivateBookingEventCore(deletingEvent, organizationId, setEvents)
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
        // 削除前にフル状態スナップショットを取得（履歴用）
        const snapshot = organizationId
          ? await fetchEventSnapshot(deletingEvent.id, organizationId)
          : null

        await scheduleApi.delete(deletingEvent.id)

        // 履歴を記録（削除）
        if (organizationId) {
          try {
            void createEventHistory(
              null,  // 削除後なのでnull
              organizationId,
              'delete',
              snapshot ?? (deletingEvent as unknown as Record<string, unknown>),
              {},
              {
                date: deletingEvent.date,
                storeId: (snapshot?.store_id as string | undefined) || deletingEvent.venue,
                timeSlot: (snapshot?.time_slot as string | null | undefined) ?? deletingEvent.time_slot ?? null,
              },
              {
                deletedEventScenario: (snapshot?.scenario as string | undefined) || deletingEvent.scenario,
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
      if (isPrivateBookingEvent(eventToDelete)) {
        await deletePrivateBookingEventCore(eventToDelete, organizationId, setEvents)
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

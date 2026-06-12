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
import { reservationApi } from '@/lib/reservationApi'
import type { ScheduleEvent } from '@/types/schedule'
import type { RpcAdminUpdateReservationFieldsParams } from '@/lib/rpcTypes'
import { getEventTimeSlot } from '@/utils/eventOperationUtils'
import { timeSlotEnToSchedule } from '@/lib/timeSlot'

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

/** 公演中止・削除時のキャンセルメール既定文（useEventCancel と同文） */
const DEFAULT_CANCELLATION_REASON =
  '誠に申し訳ございませんが、やむを得ない事情により公演を中止させていただくこととなりました。'

/**
 * F-1: 削除前に有効予約を処理する統合フロー（2026-06-13 オーナー指示で実装）
 *
 * 対象公演に有効な予約（貸切の主申込・参加者・通常予約すべて）が残っている場合:
 *   ① 件数つきの警告で削除続行を確認
 *   ② キャンセルメールを送信するか選択
 *   ③ 全予約をキャンセル（メールあり: reservationApi.cancel = サーバー側で
 *      キャンセル+システムメッセージ+メール送信まで一括 / メールなし:
 *      admin_update_reservation_fields でステータスのみ更新）
 *
 * @returns true = 削除を続行してよい / false = ユーザーが中断
 * @throws 予約キャンセルに失敗した場合（削除は実行しない）
 */
async function handleActiveReservationsBeforeDelete(
  targetEvent: ScheduleEvent,
  organizationId: string | null
): Promise<boolean> {
  // 対象の schedule_events 行を解決（合成IDの未承認貸切は実公演が無いので対象外）
  let scheduleEventId: string | null = isRealScheduleEventId(targetEvent.id) ? targetEvent.id : null
  if (!scheduleEventId && targetEvent.reservation_id) {
    const { data } = await supabase
      .from('reservations')
      .select('schedule_event_id')
      .eq('id', targetEvent.reservation_id)
      .maybeSingle()
    scheduleEventId = data?.schedule_event_id ?? null
  }
  if (!scheduleEventId) return true

  let activeQuery = supabase
    .from('reservations')
    .select('id, customer_name, reservation_source')
    .eq('schedule_event_id', scheduleEventId)
    .neq('status', 'cancelled')
  if (organizationId) {
    activeQuery = activeQuery.eq('organization_id', organizationId)
  }
  const { data: activeReservations, error: activeError } = await activeQuery
  if (activeError) {
    logger.error('有効予約チェックエラー:', activeError)
    throw new Error('予約情報の確認に失敗しました')
  }
  if (!activeReservations || activeReservations.length === 0) return true

  // ① 警告
  const proceed = window.confirm(
    `⚠️ この公演には ${activeReservations.length} 件の有効な予約があります。\n\n` +
    `削除を続行すると、すべての予約をキャンセルした上で公演を削除します。\n` +
    `（予約の記録はキャンセル済みとして残ります）\n\n続行しますか？`
  )
  if (!proceed) return false

  // ② メール送信の選択
  const sendMail = window.confirm(
    `予約者 ${activeReservations.length} 名にキャンセルのご連絡メールを送信しますか？\n\n` +
    `「OK」= メールを送信してキャンセル\n` +
    `「キャンセル」= メールを送らずにキャンセル（後から個別連絡する場合）`
  )

  // ③ 全予約をキャンセル
  logger.log('🗑 F-1: 削除前の予約一括キャンセル開始', {
    scheduleEventId, count: activeReservations.length, sendMail,
  })
  const failures: string[] = []
  for (const r of activeReservations) {
    try {
      if (sendMail) {
        await reservationApi.cancel(r.id, DEFAULT_CANCELLATION_REASON, { skipGroupCancel: true })
      } else {
        const params: RpcAdminUpdateReservationFieldsParams = {
          p_reservation_id: r.id,
          p_updates: { status: 'cancelled' },
        }
        const { error } = await supabase.rpc('admin_update_reservation_fields', params)
        if (error) throw error
      }
    } catch (e) {
      logger.error('予約キャンセル失敗:', { reservationId: r.id, error: e })
      failures.push(r.customer_name || r.id)
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `${failures.length}件の予約キャンセルに失敗したため、公演の削除を中止しました（${failures.join('、')}）。` +
      'もう一度お試しください。'
    )
  }
  showToast.success(
    `${activeReservations.length}件の予約をキャンセルしました` + (sendMail ? '（メール送信済み）' : '（メール送信なし）')
  )
  return true
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
  logger.log('🗑 貸切削除 開始:', { eventId: targetEvent.id, reservationId, organizationId })

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
  // 失敗・0件は沈黙させず必ずエラーにする（沈黙すると「削除したのに残る」が
  // 原因不明になる。2026-06-13 のD-5デバッグで強化）
  if (scheduleEventId) {
    let deleteQuery = supabase
      .from('schedule_events')
      .delete()
      .eq('id', scheduleEventId)
    if (organizationId) {
      deleteQuery = deleteQuery.eq('organization_id', organizationId)
    }
    const { data: deletedRows, error: scheduleError } = await deleteQuery.select('id')
    if (scheduleError) {
      logger.error('schedule_events削除エラー:', scheduleError)
      throw scheduleError
    }
    if (!deletedRows || deletedRows.length === 0) {
      logger.error('schedule_events削除が0件:', { scheduleEventId, organizationId })
      throw new Error('公演データの削除が0件でした（権限または対象の不一致の可能性があります）')
    }
    logger.log('🗑 貸切削除 完了:', { scheduleEventId, deleted: deletedRows.length })
  } else {
    logger.warn('🗑 貸切削除: schedule_events の対象IDが解決できませんでした', { eventId: targetEvent.id, reservationId })
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
      await createEventHistory(
        null,  // 削除後なのでnull
        organizationId,
        'delete',
        snapshot ?? fallback,
        {},
        {
          date: targetEvent.date,
          storeId: (snapshot?.store_id as string | undefined) || targetEvent.venue,
          // 承認RPCが作る公演行は time_slot が NULL のことがあり、そのまま記録すると
          // セル履歴タブ（date+store+time_slot で検索）にヒットしない。
          // NULL の場合は開始時刻から時間帯（'朝'/'昼'/'夜'）を導出して記録する。
          timeSlot:
            (snapshot?.time_slot as string | null | undefined) ??
            targetEvent.time_slot ??
            timeSlotEnToSchedule(getEventTimeSlot(targetEvent)),
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
      // F-1: 有効予約があれば「警告 → メール送信選択 → 一括キャンセル」を先に実施
      const proceed = await handleActiveReservationsBeforeDelete(deletingEvent, organizationId)
      if (!proceed) {
        setIsDeleteDialogOpen(false)
        setDeletingEvent(null)
        return
      }
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
      // F-1: 有効予約があれば「警告 → メール送信選択 → 一括キャンセル」を先に実施
      // （予約一覧の全員キャンセル後ルートでは有効予約0のため確認なしで素通りする）
      const proceed = await handleActiveReservationsBeforeDelete(eventToDelete, organizationId)
      if (!proceed) return
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

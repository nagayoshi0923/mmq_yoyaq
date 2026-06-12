/**
 * 公演の削除操作（Phase 4-3 で useEventOperations から分割）
 *
 * - handleDeletePerformance: 削除の入口。
 *     有効予約あり: F-1 ダイアログ（①キャンセル確認 → ②メール送信確認）→ 一括
 *       キャンセル → 削除。通常の削除確認モーダルは出さない（確定が先に見える
 *       順序が不自然、というオーナー指摘 2026-06-13）
 *     有効予約なし: 従来の削除確認モーダルを開く
 * - handleConfirmDelete: 削除確認モーダルからの実行（安全弁として F-1 再チェック）
 * - performDeleteByKind: 削除の実体
 *     貸切: 公演を削除し、申込（reservations）は**キャンセル状態で保持** + 履歴
 *     通常: 削除 + 履歴（有効予約の残存は最後の安全弁で拒否）
 * - deleteEventDirectly: 確認モーダルなしの直接削除（予約一覧モーダルから使用）
 *
 * 2026-06-12 仕様変更（オーナー指示）:
 *   貸切削除時に申込レコードを物理削除（admin_delete_reservations_by_ids）して
 *   いたが、顧客との取引記録が消えるのは台帳管理上問題のため、
 *   status='cancelled' への更新（記録保持）に変更。
 *   あわせて履歴用スナップショットを「削除の前」に取得する順序へ修正
 *   （従来は予約削除→公演参照の順だったため参照が空振りし、削除履歴が
 *   記録されないことがあった）。
 */
import { useState, useCallback, useRef } from 'react'
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
import type { DeleteCancelPrompt, DeleteCancelDecision } from '@/components/schedule/DeleteEventCancelDialog'

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

/** 公演中止・削除時のキャンセルメール既定文（useEventCancel からも使用） */
export const DEFAULT_CANCELLATION_REASON =
  '誠に申し訳ございませんが、やむを得ない事情により公演を中止させていただくこととなりました。'

export interface ActiveReservation {
  id: string
  customer_name: string | null
  customer_email: string | null
}

/** 対象公演に紐づく有効な予約（キャンセル済み以外）を取得する（useEventCancel からも使用） */
export async function fetchActiveReservations(
  targetEvent: ScheduleEvent,
  organizationId: string | null
): Promise<ActiveReservation[]> {
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
  if (!scheduleEventId) return []

  let activeQuery = supabase
    .from('reservations')
    .select('id, customer_name, customer_email')
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
  return activeReservations ?? []
}

/** 予約者の表示名（名前＋メール）を組み立てる（useEventCancel からも使用） */
export function formatCustomerLabel(r: ActiveReservation): string {
  const name = r.customer_name || '名前未登録'
  return r.customer_email ? `${name}（${r.customer_email}）` : name
}

/**
 * F-1: 削除前に有効予約を処理する統合フロー（2026-06-13 オーナー指示で実装）
 *
 * 対象公演に有効な予約（貸切の主申込・参加者・通常予約すべて）が残っている場合:
 *   ① 専用ダイアログ（DeleteEventCancelDialog）で件数警告＋キャンセル理由の編集
 *      ＋メール送信の選択をまとめて確認（予約一覧の「予約をキャンセル」と同じ作法）。
 *      このダイアログが削除の確定を兼ねるため、通常の削除確認モーダルは出さない
 *      （確定モーダルが先に出ると順序が不自然、というオーナー指摘 2026-06-13）
 *   ② 全予約をキャンセル（メールあり: reservationApi.cancel = サーバー側で
 *      キャンセル+システムメッセージ+メール送信まで一括 / メールなし:
 *      admin_update_reservation_fields でステータスのみ更新）
 *
 * @param askDecision ダイアログを開いてユーザーの決定を待つ（null = 中断）
 * @param preFetched 取得済みの有効予約（再クエリを避けたい呼び出し元用）
 * @returns true = 削除を続行してよい / false = ユーザーが中断
 * @throws 予約キャンセルに失敗した場合（削除は実行しない）
 */
async function handleActiveReservationsBeforeDelete(
  targetEvent: ScheduleEvent,
  organizationId: string | null,
  askDecision: (info: Omit<DeleteCancelPrompt, 'defaultReason'>) => Promise<DeleteCancelDecision | null>,
  preFetched?: ActiveReservation[]
): Promise<boolean> {
  const activeReservations = preFetched ?? await fetchActiveReservations(targetEvent, organizationId)
  if (activeReservations.length === 0) return true

  // ① 専用ダイアログで確認（件数・予約者・理由編集・メール送信選択）
  const decision = await askDecision({
    count: activeReservations.length,
    customers: activeReservations.map(formatCustomerLabel),
  })
  if (!decision) return false
  const { sendMail } = decision
  const reason = decision.reason.trim() || DEFAULT_CANCELLATION_REASON

  // ② 全予約をキャンセル
  logger.log('🗑 F-1: 削除前の予約一括キャンセル開始', {
    eventId: targetEvent.id, count: activeReservations.length, sendMail,
  })
  showToast.info(`${activeReservations.length}件の予約をキャンセルしています…`)
  const failures: string[] = []
  for (const r of activeReservations) {
    try {
      if (sendMail) {
        await reservationApi.cancel(r.id, reason, { skipGroupCancel: true })
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

  // F-1: 予約キャンセル確認ダイアログ（DeleteEventCancelDialog）の表示状態。
  // Promise の resolver は state に置くと StrictMode の二重実行で壊れるため ref に保持
  const [deleteCancelPrompt, setDeleteCancelPrompt] = useState<DeleteCancelPrompt | null>(null)
  const deleteCancelResolveRef = useRef<((decision: DeleteCancelDecision | null) => void) | null>(null)

  /** ダイアログを開いてユーザーの決定（実行 or 中断）を待つ */
  const askDeleteCancelDecision = useCallback(
    (info: Omit<DeleteCancelPrompt, 'defaultReason'>) =>
      new Promise<DeleteCancelDecision | null>(resolve => {
        deleteCancelResolveRef.current = resolve
        setDeleteCancelPrompt({ ...info, defaultReason: DEFAULT_CANCELLATION_REASON })
      }),
    []
  )

  /** ダイアログ側から決定を受け取る（null = やめる） */
  const resolveDeleteCancelPrompt = useCallback((decision: DeleteCancelDecision | null) => {
    setDeleteCancelPrompt(null)
    const resolve = deleteCancelResolveRef.current
    deleteCancelResolveRef.current = null
    resolve?.(decision)
  }, [])

  /**
   * 公演種別に応じた削除の実体（貸切 or 通常）。
   * 呼び出し前に有効予約の処理（F-1）が済んでいる前提。
   * ダイアログの開閉には触らない（呼び出し元が責任を持つ）。
   */
  const performDeleteByKind = useCallback(async (targetEvent: ScheduleEvent) => {
    if (isPrivateBookingEvent(targetEvent)) {
      await deletePrivateBookingEventCore(targetEvent, organizationId, setEvents)
      return
    }

    // 通常公演: 念のため有効予約の残存を再確認（F-1 後は0件のはず。
    // 万一残っていたら削除せず中止を案内する＝最後の安全弁）
    let reservationsCheckQuery = supabase
      .from('reservations')
      .select('id')
      .eq('schedule_event_id', targetEvent.id)
      .neq('status', 'cancelled')
    if (organizationId) {
      reservationsCheckQuery = reservationsCheckQuery.eq('organization_id', organizationId)
    }
    const { data: reservations, error: checkError } = await reservationsCheckQuery

    if (checkError) {
      logger.error('予約チェックエラー:', checkError)
      throw new Error('予約情報の確認に失敗しました')
    }

    if (reservations && reservations.length > 0) {
      showToast.warning(`この公演には${reservations.length}件の有効な予約が紐付いているため削除できません`, '代わりに「中止」機能を使用してください。中止にすると、予約者に通知され、公演は非表示になります。')
      return
    }

    // 削除前にフル状態スナップショットを取得（履歴用）
    const snapshot = organizationId
      ? await fetchEventSnapshot(targetEvent.id, organizationId)
      : null

    await scheduleApi.delete(targetEvent.id)

    // 履歴を記録（削除）
    if (organizationId) {
      try {
        void createEventHistory(
          null,  // 削除後なのでnull
          organizationId,
          'delete',
          snapshot ?? (targetEvent as unknown as Record<string, unknown>),
          {},
          {
            date: targetEvent.date,
            storeId: (snapshot?.store_id as string | undefined) || targetEvent.store_id || targetEvent.venue,
            timeSlot: (snapshot?.time_slot as string | null | undefined) ?? targetEvent.time_slot ?? null,
          },
          {
            deletedEventScenario: (snapshot?.scenario as string | undefined) || targetEvent.scenario,
          }
        )
      } catch (historyError) {
        logger.error('履歴記録エラー（削除）:', historyError)
      }
    }

    setEvents(prev => prev.filter(event => event.id !== targetEvent.id))
  }, [setEvents, organizationId])

  // 削除の入口（右クリックメニュー等から）。
  // 有効予約がある場合は通常の削除確認モーダルを出さない——確定モーダルが先に出ると
  // 「もう確定した」ように見えるため（オーナー指摘 2026-06-13）。順序は
  //   ① 予約キャンセルの確認 → ② メール送信の確認 → 一括キャンセル → 削除実行
  // で、F-1 ダイアログが削除の確定を兼ねる。予約ゼロのときだけ従来の確認モーダル。
  const handleDeletePerformance = useCallback(async (event: ScheduleEvent) => {
    try {
      const active = await fetchActiveReservations(event, organizationId)
      if (active.length === 0) {
        // 予約なし: 従来どおりの削除確認モーダル
        setDeletingEvent(event)
        setIsDeleteDialogOpen(true)
        return
      }
      // 予約あり: F-1 フロー（確認②つ → 一括キャンセル）→ 削除実行
      const proceed = await handleActiveReservationsBeforeDelete(
        event, organizationId, askDeleteCancelDecision, active
      )
      if (!proceed) return
      await performDeleteByKind(event)
    } catch (error) {
      logger.error('公演削除エラー:', error)
      showToast.error(getSafeErrorMessage(error, '公演の削除に失敗しました'))
    }
  }, [organizationId, askDeleteCancelDecision, performDeleteByKind])

  // 削除確認モーダル（予約ゼロ経路）からの実行
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingEvent) return

    try {
      // 安全弁: モーダルを開いてから予約が入った場合に備えて F-1 を再チェック
      const proceed = await handleActiveReservationsBeforeDelete(
        deletingEvent, organizationId, askDeleteCancelDecision
      )
      if (proceed) {
        await performDeleteByKind(deletingEvent)
      }
    } catch (error) {
      logger.error('公演削除エラー:', error)
      showToast.error(getSafeErrorMessage(error, '公演の削除に失敗しました'))
    } finally {
      setIsDeleteDialogOpen(false)
      setDeletingEvent(null)
    }
  }, [deletingEvent, organizationId, askDeleteCancelDecision, performDeleteByKind])

  // 公演を直接削除（確認モーダルなし - 予約一覧モーダルから呼び出し用）
  const deleteEventDirectly = useCallback(async (eventToDelete: ScheduleEvent) => {
    try {
      // F-1: 有効予約があれば「キャンセル確認 → メール送信確認 → 一括キャンセル」を先に実施
      // （予約一覧の全員キャンセル後ルートでは有効予約0のため確認なしで素通りする）
      const proceed = await handleActiveReservationsBeforeDelete(
        eventToDelete, organizationId, askDeleteCancelDecision
      )
      if (!proceed) return
      await performDeleteByKind(eventToDelete)
    } catch (error) {
      logger.error('公演削除エラー:', error)
      throw error
    }
  }, [organizationId, askDeleteCancelDecision, performDeleteByKind])

  return {
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    deletingEvent,
    handleDeletePerformance,
    handleConfirmDelete,
    deleteEventDirectly,
    // F-1: 予約キャンセル確認ダイアログ（DeleteEventCancelDialog に渡す）
    deleteCancelPrompt,
    resolveDeleteCancelPrompt,
  }
}

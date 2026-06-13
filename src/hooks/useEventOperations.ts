// 公演の追加・編集・削除・中止・復活などの操作を管理

import { useState, useCallback } from 'react'
import { scheduleApi } from '@/lib/api'
import {
  reservationApi,
  RESERVATION_WITH_CUSTOMER_SELECT_FIELDS,
  joinedCustomerFromReservation,
} from '@/lib/reservationApi' // 追加
import { supabase } from '@/lib/supabase'
import { saveEmptySlotMemo } from '@/components/schedule/SlotMemoInput'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getEventTimeSlot, timeToMinutes, calcEndTime, checkTimeOverlap } from '@/utils/eventOperationUtils'
import { useOrganization } from '@/hooks/useOrganization'
import { useTimeSlotSettings } from '@/hooks/useTimeSlotSettings'
import { useEventDelete } from '@/hooks/eventOperations/useEventDelete'
import { useEventCancel } from '@/hooks/eventOperations/useEventCancel'
import { useEventMisc } from '@/hooks/eventOperations/useEventMisc'
import { useEventModalState } from '@/hooks/eventOperations/useEventModalState'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import { PRIVATE_BOOKING_EVENT_INTERVAL_MINUTES } from '@/lib/privateBookingScenarioTime'
import {
  diffScheduleSnapshotsForCustomerEmail,
  sendPrivateBookingCustomerChangeEmail,
} from '@/lib/privateBookingCustomerChangeEmail'
import type { ScheduleEvent } from '@/types/schedule'
import { scheduleTimeSlotToEn, timeSlotEnToSchedule, scheduleTimeSlotToCandidate, timeSlotEnToLabel } from '@/lib/timeSlot'
import type { RpcAdminUpdateReservationFieldsParams, RpcAdminDeleteReservationsByIdsParams } from '@/lib/rpcTypes'

/** 貸切の予約変更通知メール送信前の確認（OK=送信 / キャンセル=送信しない） */
function confirmSendPrivateBookingChangeEmail(): boolean {
  return confirm(
    'お客様へ予約変更の通知メールを送信しますか？\n\n' +
      '「キャンセル」を選ぶと、保存した内容はそのままでメールだけ送りません。'
  )
}

/**
 * スケジュールイベントの日程・時間変更時に、関連データを同期する。
 * 1. reservations.requested_datetime を schedule_events に合わせて更新
 * 2. 貸切グループの候補日（private_group_candidate_dates）を更新
 */
async function syncRelatedDataOnEventDateChange(
  eventId: string,
  oldDate: string,
  oldStartTime: string,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
  newTimeSlotSchedule: string | null,
  organizationId: string | null
): Promise<void> {
  try {
    // 1. 紐づく全予約の requested_datetime を同期
    const newRequestedDatetime = `${newDate}T${newStartTime}+09:00`
    let resQuery = supabase
      .from('reservations')
      .select('id, private_group_id')
      .eq('schedule_event_id', eventId)
    if (organizationId) {
      resQuery = resQuery.eq('organization_id', organizationId)
    }
    const { data: reservations } = await resQuery
    if (!reservations || reservations.length === 0) return

    for (const reservation of reservations) {
      // eslint-disable-next-line no-restricted-syntax
      const { error: resUpdateError } = await supabase
        .from('reservations')
        .update({ requested_datetime: newRequestedDatetime })
        .eq('id', reservation.id)
      if (resUpdateError) {
        logger.error('予約の requested_datetime 同期エラー:', resUpdateError)
      } else {
        logger.log('✅ 予約の requested_datetime を同期:', {
          reservationId: reservation.id,
          newRequestedDatetime,
        })
      }

      // 2. 貸切グループの候補日を同期
      if (!reservation.private_group_id) continue

      const { data: candidates } = await supabase
        .from('private_group_candidate_dates')
        .select('id, date, start_time')
        .eq('group_id', reservation.private_group_id)
        .eq('date', oldDate)
      if (!candidates || candidates.length === 0) continue

      let targetCandidate = candidates[0]
      for (const c of candidates) {
        if (c.start_time === oldStartTime) {
          targetCandidate = c
          break
        }
      }

      // schedule_events の time_slot(朝/昼/夜) → candidate_dates の time_slot(午前/午後/夜間)
      const candidateTimeSlot = newTimeSlotSchedule ? scheduleTimeSlotToCandidate(newTimeSlotSchedule) : undefined

      const updatePayload: Record<string, string> = {
        date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
      }
      if (candidateTimeSlot) {
        updatePayload.time_slot = candidateTimeSlot
      }

      const { error: cdUpdateError } = await supabase
        .from('private_group_candidate_dates')
        .update(updatePayload)
        .eq('id', targetCandidate.id)

      if (cdUpdateError) {
        logger.error('貸切グループ候補日の同期エラー:', cdUpdateError)
      } else {
        logger.log('✅ 貸切グループ候補日を同期:', {
          groupId: reservation.private_group_id,
          oldDate,
          newDate,
        })
      }
    }
  } catch (err) {
    logger.error('日程変更時の関連データ同期でエラー:', err)
  }
}

interface Store {
  id: string
  name: string
  short_name: string
  is_temporary?: boolean
}

interface Scenario {
  id: string
  title: string
  duration?: number
  player_count_max?: number
  extra_preparation_time?: number // 準備時間（分）
  scenario_master_id?: string | null
}

interface UseEventOperationsProps {
  events: ScheduleEvent[]
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  stores: Store[]
  scenarios: Scenario[]
  fetchSchedule?: () => Promise<void>
}

interface PerformanceData {
  id?: string
  date: string
  store_id?: string
  venue: string
  scenario: string
  scenario_master_id?: string
  category: string
  start_time: string
  end_time: string
  capacity: number
  max_participants?: number
  gms: string[]
  gm_roles?: Record<string, string> // 追加
  notes?: string
  is_cancelled?: boolean
  is_reservation_enabled?: boolean
  is_private_request?: boolean
  reservation_id?: string
  reservation_name?: string // 予約者名（貸切用）
  time_slot?: string | null // 時間帯（朝/昼/夜）
  venue_rental_fee?: number // 場所貸し公演料金
}

export function useEventOperations({
  events,
  setEvents,
  stores,
  scenarios,
  fetchSchedule
}: UseEventOperationsProps) {
  // 組織IDを取得（マルチテナント対応）
  const { organizationId } = useOrganization()
  
  // 公演時間帯設定を取得（組織設定から）
  const { getSlotDefaults } = useTimeSlotSettings()

  const {
    isPerformanceModalOpen,
    setIsPerformanceModalOpen,
    modalMode,
    modalInitialData,
    editingEvent,
    setEditingEvent,
    draggedEvent,
    setDraggedEvent,
    dropTarget,
    setDropTarget,
    isMoveOrCopyDialogOpen,
    setIsMoveOrCopyDialogOpen,
    handleAddPerformance,
    handleEditPerformance,
    handleCloseModal,
    handleDrop,
  } = useEventModalState({ events })
  
  // 削除ダイアログ状態
  // 削除操作はサブフックへ分割（Phase 4-3）
  const {
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    deletingEvent,
    handleDeletePerformance,
    handleConfirmDelete,
    deleteEventDirectly,
    deleteCancelPrompt,
    resolveDeleteCancelPrompt,
  } = useEventDelete({ setEvents, organizationId, fetchSchedule })

  // 中止ダイアログ状態
  // 中止・復活操作はサブフックへ分割（Phase 4-3）
  const {
    handleCancelConfirmPerformance,
    handleUncancelPerformance,
    cancelEventPrompt,
    resolveCancelEventPrompt,
  } = useEventCancel({ setEvents, organizationId, fetchSchedule })
  
  const {
    isPublishDialogOpen,
    publishingEvent,
    setIsPublishDialogOpen,
    handleToggleTentative,
    handleToggleReservation,
    handleConfirmPublishToggle,
    handleConvertToMemo,
    handleParticipantChange,
  } = useEventMisc({ setEvents, organizationId, fetchSchedule })
  
  // 重複警告ダイアログ状態
  const [isConflictWarningOpen, setIsConflictWarningOpen] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<any>(null)
  const [pendingPerformanceData, setPendingPerformanceData] = useState<any>(null)

  // 🚨 CRITICAL: 重複チェック関数（移動・複製・ペースト用）
  const checkConflict = useCallback((date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening', excludeEventId?: string): ScheduleEvent | null => {
    const conflictingEvents = events.filter(event => {
      // 除外するイベントIDがある場合は除外
      if (excludeEventId && event.id === excludeEventId) {
        return false
      }
      
      // 保存された枠を優先して時間帯を判定
      const eventTimeSlot = getEventTimeSlot(event)
      return event.date === date &&
             event.venue === venue &&
             eventTimeSlot === timeSlot &&
             !event.is_cancelled
    })
    
    return conflictingEvents.length > 0 ? conflictingEvents[0] : null
  }, [events])

  // 公演を移動
  const handleMoveEvent = useCallback(async () => {
    if (!draggedEvent || !dropTarget) return

    try {
      // 🚨 CRITICAL: 移動先の重複チェック
      const conflict = checkConflict(dropTarget.date, dropTarget.venue, dropTarget.timeSlot as 'morning' | 'afternoon' | 'evening', draggedEvent.id)
      if (conflict) {
        const timeSlotLabel = timeSlotEnToLabel(dropTarget.timeSlot, 'candidate')
        const storeName = stores.find(s => s.id === dropTarget.venue)?.name || dropTarget.venue

        if (!confirm(
          `移動先の${dropTarget.date} ${storeName} ${timeSlotLabel}には既に「${conflict.scenario}」の公演があります。\n` +
          `既存の公演を削除して移動しますか？`
        )) {
          setDraggedEvent(null)
          setDropTarget(null)
          return
        }
        
        // 既存公演を削除
        await scheduleApi.delete(conflict.id)
        setEvents(prev => prev.filter(e => e.id !== conflict.id))
      }

      // 元の公演の時間帯を取得
      const sourceTimeSlot = getEventTimeSlot(draggedEvent)
      const targetTimeSlot = dropTarget.timeSlot as 'morning' | 'afternoon' | 'evening'
      
      // 移動先の時間を計算（組織設定から取得）
      const defaults = getSlotDefaults(dropTarget.date, targetTimeSlot)
      
      // シナリオIDと所要時間を取得
      let scenarioId = draggedEvent.scenarios?.id || null
      const matchingScenario = scenarios.find(s => s.title === draggedEvent.scenario)
      if (!scenarioId) scenarioId = matchingScenario?.id || null

      // 時間帯が同じなら元の時間を保持、違うならデフォルト開始時刻＋シナリオ所要時間で計算
      const isSameTimeSlot = sourceTimeSlot === targetTimeSlot
      const startTime = isSameTimeSlot ? draggedEvent.start_time : defaults.start_time
      const endTime = isSameTimeSlot
        ? draggedEvent.end_time
        : matchingScenario?.duration
          ? calcEndTime(startTime, matchingScenario.duration)
          : defaults.end_time

      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const isRealEventId = uuidPattern.test(draggedEvent.id)

      // 新しい位置に公演を作成/更新
      // organization_idが取得できない場合はエラー
      if (!organizationId) {
        throw new Error('組織情報が取得できません。再ログインしてください。')
      }
      
      // 時間帯ラベルを移動先に更新
      const timeSlotLabel = timeSlotEnToSchedule(targetTimeSlot)

      const newEventData = {
        date: dropTarget.date,
        store_id: dropTarget.venue,
        venue: stores.find(s => s.id === dropTarget.venue)?.name || '',
        scenario: draggedEvent.scenario,
        scenario_master_id: scenarioId ?? undefined,
        category: draggedEvent.category,
        start_time: startTime,
        end_time: endTime,
        time_slot: timeSlotLabel, // 移動先の時間帯に更新
        capacity: draggedEvent.max_participants,
        gms: draggedEvent.gms,
        gm_roles: draggedEvent.gm_roles, // GMの役割情報を保持
        notes: draggedEvent.notes,
        organization_id: organizationId, // マルチテナント対応
        // 状態フィールドを保持
        is_tentative: draggedEvent.is_tentative || false,
        is_reservation_enabled: draggedEvent.is_reservation_enabled || false,
        venue_rental_fee: draggedEvent.venue_rental_fee,
        // 予約関連フィールドを保持
        reservation_name: draggedEvent.reservation_name || null,
        is_reservation_name_overwritten: draggedEvent.is_reservation_name_overwritten || false,
        is_private_request: draggedEvent.is_private_request || false,
        reservation_id: draggedEvent.reservation_id || null
      }

      if (isRealEventId) {
        const savedEvent = await scheduleApi.update(draggedEvent.id, newEventData)

        const shouldNotifyPrivateMove =
          (draggedEvent.is_private_request || draggedEvent.is_private_booking) &&
          !!draggedEvent.reservation_id
        if (shouldNotifyPrivateMove && draggedEvent.reservation_id) {
          const oldVenueName =
            stores.find((s) => s.id === draggedEvent.venue)?.name || draggedEvent.venue || '—'
          const newVenueName =
            savedEvent.venue ||
            stores.find((s) => s.id === savedEvent.store_id)?.name ||
            newEventData.venue ||
            '—'
          const oldSnap = {
            date: draggedEvent.date,
            start_time: draggedEvent.start_time,
            end_time: draggedEvent.end_time,
            venueDisplay: oldVenueName,
            scenario: draggedEvent.scenario,
            store_id: draggedEvent.store_id || undefined,
          }
          const newSnap = {
            date: savedEvent.date,
            start_time: savedEvent.start_time,
            end_time: savedEvent.end_time,
            venueDisplay: newVenueName,
            scenario: savedEvent.scenario || draggedEvent.scenario,
            store_id: savedEvent.store_id,
          }
          const moveChanges = diffScheduleSnapshotsForCustomerEmail(oldSnap, newSnap)
          if (moveChanges.length > 0 && confirmSendPrivateBookingChangeEmail()) {
            try {
              await sendPrivateBookingCustomerChangeEmail({
                reservationId: draggedEvent.reservation_id,
                organizationId,
                changes: moveChanges,
                currentSchedule: newSnap,
                scenarioTitleHint: newSnap.scenario || draggedEvent.scenario,
              })
            } catch (notifyErr) {
              logger.error('貸切公演移動後の顧客メール送信エラー:', notifyErr)
            }
          }
        }

        // 関連データを同期（日程・時間が変更された場合）
        if (draggedEvent.date !== dropTarget.date || draggedEvent.start_time !== startTime || draggedEvent.end_time !== endTime) {
          await syncRelatedDataOnEventDateChange(
            draggedEvent.id,
            draggedEvent.date,
            draggedEvent.start_time,
            dropTarget.date,
            startTime,
            endTime,
            timeSlotLabel,
            organizationId
          )
        }

        // 履歴を記録（移動）
        if (organizationId) {
          try {
            const srcStoreName = stores.find(s => s.id === (draggedEvent.store_id || draggedEvent.venue))?.name || draggedEvent.venue
            const dstStoreName = stores.find(s => s.id === dropTarget.venue)?.name || dropTarget.venue
            const movedSnapshot = await fetchEventSnapshot(savedEvent.id, organizationId)
            const newSnapshot = movedSnapshot ?? (newEventData as unknown as Record<string, unknown>)
            const oldSnapshot = draggedEvent as unknown as Record<string, unknown>
            // 移動元セル
            void createEventHistory(
              savedEvent.id, organizationId, 'move_out',
              oldSnapshot, newSnapshot,
              { date: draggedEvent.date, storeId: draggedEvent.store_id || draggedEvent.venue, timeSlot: draggedEvent.time_slot || null },
              { notes: `→ ${dropTarget.date} ${dstStoreName}` }
            )
            // 移動先セル
            void createEventHistory(
              savedEvent.id, organizationId, 'move_in',
              oldSnapshot, newSnapshot,
              { date: dropTarget.date, storeId: dropTarget.venue, timeSlot: timeSlotLabel },
              { notes: `← ${draggedEvent.date} ${srcStoreName}` }
            )
          } catch (historyError) {
            logger.error('履歴記録エラー（移動）:', historyError)
          }
        }

        // ローカル状態を更新（scenariosは元のイベントから保持）
        setEvents(prev => prev.map(event => {
          if (event.id !== draggedEvent.id) return event
          return {
            ...savedEvent,
            venue: dropTarget.venue,
            scenarios: draggedEvent.scenarios || savedEvent.scenarios,
            // 状態フィールドを保持
            is_tentative: draggedEvent.is_tentative,
            is_reservation_enabled: draggedEvent.is_reservation_enabled,
            // 予約関連フィールドを保持
            reservation_name: draggedEvent.reservation_name,
            is_reservation_name_overwritten: draggedEvent.is_reservation_name_overwritten,
            is_private_request: draggedEvent.is_private_request,
            reservation_id: draggedEvent.reservation_id,
            gm_roles: draggedEvent.gm_roles,
            venue_rental_fee: draggedEvent.venue_rental_fee
          }
        }))
      } else {
        const savedEvent = await scheduleApi.create(newEventData)

        // 履歴を記録（移動 - 仮IDの場合）
        if (organizationId) {
          try {
            const srcStoreName = stores.find(s => s.id === (draggedEvent.store_id || draggedEvent.venue))?.name || draggedEvent.venue
            const dstStoreName = stores.find(s => s.id === dropTarget.venue)?.name || dropTarget.venue
            const movedSnapshot = await fetchEventSnapshot(savedEvent.id, organizationId)
            const newSnapshot = movedSnapshot ?? (newEventData as unknown as Record<string, unknown>)
            const oldSnapshot = draggedEvent as unknown as Record<string, unknown>
            void createEventHistory(
              null, organizationId, 'move_out',
              oldSnapshot, newSnapshot,
              { date: draggedEvent.date, storeId: draggedEvent.store_id || draggedEvent.venue, timeSlot: draggedEvent.time_slot || null },
              { notes: `→ ${dropTarget.date} ${dstStoreName}` }
            )
            void createEventHistory(
              savedEvent.id, organizationId, 'move_in',
              oldSnapshot, newSnapshot,
              { date: dropTarget.date, storeId: dropTarget.venue, timeSlot: timeSlotLabel },
              { notes: `← ${draggedEvent.date} ${srcStoreName}` }
            )
          } catch (historyError) {
            logger.error('履歴記録エラー（移動）:', historyError)
          }
        }

        // ローカル状態を更新（scenariosは元のイベントから保持）
        setEvents(prev => {
          const filtered = prev.filter(e => e.id !== draggedEvent.id)
          const newEvent: ScheduleEvent = {
            ...savedEvent,
            venue: dropTarget.venue,
            scenarios: draggedEvent.scenarios || savedEvent.scenarios,
            // 状態フィールドを保持
            is_tentative: draggedEvent.is_tentative,
            is_reservation_enabled: draggedEvent.is_reservation_enabled,
            // 予約関連フィールドを保持
            reservation_name: draggedEvent.reservation_name,
            is_reservation_name_overwritten: draggedEvent.is_reservation_name_overwritten,
            is_private_request: draggedEvent.is_private_request,
            reservation_id: draggedEvent.reservation_id,
            gm_roles: draggedEvent.gm_roles,
            venue_rental_fee: draggedEvent.venue_rental_fee
          }
          return [...filtered, newEvent]
        })
      }

      setDraggedEvent(null)
      setDropTarget(null)
    } catch (error) {
      logger.error('公演移動エラー:', error)
      showToast.error('公演の移動に失敗しました')
    }
  }, [draggedEvent, dropTarget, stores, setEvents, setDraggedEvent, setDropTarget, checkConflict, organizationId, getSlotDefaults, scenarios])

  // 公演を複製
  const handleCopyEvent = useCallback(async () => {
    if (!draggedEvent || !dropTarget) return

    try {
      // 🚨 CRITICAL: 複製先の重複チェック
      const targetTimeSlot = dropTarget.timeSlot as 'morning' | 'afternoon' | 'evening'
      const conflict = checkConflict(dropTarget.date, dropTarget.venue, targetTimeSlot)
      if (conflict) {
        const timeSlotLabel = timeSlotEnToLabel(targetTimeSlot, 'candidate')
        const storeName = stores.find(s => s.id === dropTarget.venue)?.name || dropTarget.venue

        if (!confirm(
          `複製先の${dropTarget.date} ${storeName} ${timeSlotLabel}には既に「${conflict.scenario}」の公演があります。\n` +
          `既存の公演を削除して複製しますか？`
        )) {
          setDraggedEvent(null)
          setDropTarget(null)
          return
        }
        
        // 既存公演を削除
        await scheduleApi.delete(conflict.id)
        setEvents(prev => prev.filter(e => e.id !== conflict.id))
      }

      // 元の公演の時間帯を取得
      const sourceTimeSlot = getEventTimeSlot(draggedEvent)
      
      // 複製先の時間を計算（組織設定から取得）
      const defaults = getSlotDefaults(dropTarget.date, targetTimeSlot)
      
      // シナリオIDと所要時間を取得
      let scenarioId = draggedEvent.scenarios?.id || null
      const matchingScenario = scenarios.find(s => s.title === draggedEvent.scenario)
      if (!scenarioId) scenarioId = matchingScenario?.id || null

      // 時間帯が同じなら元の時間を保持、違うならデフォルト開始時刻＋シナリオ所要時間で計算
      const isSameTimeSlot = sourceTimeSlot === targetTimeSlot
      const startTime = isSameTimeSlot ? draggedEvent.start_time : defaults.start_time
      const endTime = isSameTimeSlot
        ? draggedEvent.end_time
        : matchingScenario?.duration
          ? calcEndTime(startTime, matchingScenario.duration)
          : defaults.end_time

      // 新しい位置に公演を作成（元の公演は残す）
      // organization_idが取得できない場合はエラー
      if (!organizationId) {
        throw new Error('組織情報が取得できません。再ログインしてください。')
      }
      
      // 時間帯ラベルを複製先に更新
      const timeSlotLabel = timeSlotEnToSchedule(targetTimeSlot)
      
      const newEventData = {
        date: dropTarget.date,
        store_id: dropTarget.venue,
        venue: stores.find(s => s.id === dropTarget.venue)?.name || '',
        scenario: draggedEvent.scenario,
        scenario_master_id: scenarioId,
        category: draggedEvent.category,
        start_time: startTime,
        end_time: endTime,
        time_slot: timeSlotLabel, // 複製先の時間帯に更新
        capacity: draggedEvent.max_participants,
        gms: draggedEvent.gms,
        gm_roles: draggedEvent.gm_roles, // GMの役割情報を保持
        notes: draggedEvent.notes,
        organization_id: organizationId, // マルチテナント対応
        // 状態フィールドを保持
        is_tentative: draggedEvent.is_tentative || false,
        is_reservation_enabled: draggedEvent.is_reservation_enabled || false,
        venue_rental_fee: draggedEvent.venue_rental_fee,
        // 予約関連フィールドを保持（複製時も元のデータを引き継ぐ）
        reservation_name: draggedEvent.reservation_name || null,
        is_reservation_name_overwritten: draggedEvent.is_reservation_name_overwritten || false,
        is_private_request: draggedEvent.is_private_request || false,
        // 複製時はreservation_idはクリア（別の公演として扱う）
        reservation_id: null
      }

      const savedEvent = await scheduleApi.create(newEventData)

      // 履歴を記録（複製）
      if (organizationId) {
        try {
          const srcStoreName = stores.find(s => s.id === (draggedEvent.store_id || draggedEvent.venue))?.name || draggedEvent.venue
          const copiedSnapshot = await fetchEventSnapshot(savedEvent.id, organizationId)
          void createEventHistory(
            savedEvent.id, organizationId, 'copy',
            null, copiedSnapshot ?? (newEventData as unknown as Record<string, unknown>),
            { date: dropTarget.date, storeId: dropTarget.venue, timeSlot: timeSlotLabel },
            { notes: `← ${draggedEvent.date} ${srcStoreName} から複製` }
          )
        } catch (historyError) {
          logger.error('履歴記録エラー（複製）:', historyError)
        }
      }

      // ローカル状態を更新（元の公演は残す、scenariosは元のイベントから保持）
      const newEvent: ScheduleEvent = {
        ...savedEvent,
        venue: dropTarget.venue,
        scenarios: draggedEvent.scenarios || savedEvent.scenarios,
        // 状態フィールドを保持
        is_tentative: draggedEvent.is_tentative,
        is_reservation_enabled: draggedEvent.is_reservation_enabled,
        // 予約関連フィールドを保持
        reservation_name: draggedEvent.reservation_name,
        is_reservation_name_overwritten: draggedEvent.is_reservation_name_overwritten,
        is_private_request: draggedEvent.is_private_request
      }
      setEvents(prev => [...prev, newEvent])

      setDraggedEvent(null)
      setDropTarget(null)
    } catch (error) {
      logger.error('公演複製エラー:', error)
      showToast.error('公演の複製に失敗しました')
    }
  }, [draggedEvent, dropTarget, stores, setEvents, setDraggedEvent, setDropTarget, checkConflict, organizationId, getSlotDefaults, scenarios])

  // 🚨 CRITICAL: 公演保存時の重複チェック機能（タイムスロット + 実時間 + 準備時間）
  const handleSavePerformance = useCallback(async (performanceData: PerformanceData): Promise<boolean> => {
    // タイムスロットを判定（保存された枠time_slotを優先、なければstart_timeから判定）
    let timeSlot: 'morning' | 'afternoon' | 'evening'
    const savedSlot = scheduleTimeSlotToEn(performanceData.time_slot)
    if (savedSlot) {
      timeSlot = savedSlot
    } else {
      const startHour = parseInt(performanceData.start_time.split(':')[0])
      if (startHour < 12) {
        timeSlot = 'morning'
      } else if (startHour < 17) {
        timeSlot = 'afternoon'
      } else {
        timeSlot = 'evening'
      }
    }
    
    // 重複チェック1：同じ日時・店舗・時間帯に既に公演があるか（タイムスロット単位）
    const slotConflictingEvents = events.filter(event => {
      // 編集中の公演自身は除外
      if (modalMode === 'edit' && event.id === performanceData.id) {
        return false
      }
      
      // 既存イベントの時間帯も保存された枠を優先
      const eventTimeSlot = getEventTimeSlot(event)
      return event.date === performanceData.date &&
             event.venue === performanceData.venue &&
             eventTimeSlot === timeSlot &&
             !event.is_cancelled
    })
    
    if (slotConflictingEvents.length > 0) {
      const conflictingEvent = slotConflictingEvents[0]
      const timeSlotLabel = timeSlotEnToLabel(timeSlot, 'candidate')
      const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
      
      // 重複警告モーダルを表示
      setConflictInfo({
        date: performanceData.date,
        storeName,
        timeSlot: timeSlotLabel,
        conflictingEvent: {
          scenario: conflictingEvent.scenario,
          gms: conflictingEvent.gms,
          start_time: conflictingEvent.start_time,
          end_time: conflictingEvent.end_time
        }
      })
      setPendingPerformanceData(performanceData)
      setIsConflictWarningOpen(true)
      return false
    }
    
    // 重複チェック2：実際の時間の重複（準備時間を考慮）
    // 同じ日・同じ店舗の全公演と時間を比較
    
    // 新規公演のシナリオから準備時間を取得
    const newScenario = scenarios.find(s => s.title === performanceData.scenario)
    const newPrepMinutes = newScenario?.extra_preparation_time || 0
    
    logger.log('🔍 準備時間チェック:', JSON.stringify({
      scenarioTitle: performanceData.scenario,
      foundScenario: !!newScenario,
      extra_preparation_time: newScenario?.extra_preparation_time,
      newPrepMinutes
    }))
    
    let timeConflict: { event: ScheduleEvent; reason: string } | null = null
    
    for (const event of events) {
      // 編集中の公演自身は除外
      if (modalMode === 'edit' && event.id === performanceData.id) {
        continue
      }
      
      // 同じ日・同じ店舗の公演のみ対象
      if (event.date !== performanceData.date || event.venue !== performanceData.venue || event.is_cancelled) {
        continue
      }
      
      // 既存公演のシナリオから準備時間を取得
      const existingScenario = scenarios.find(s => s.title === event.scenario)
      const existingPrepMinutes = existingScenario?.extra_preparation_time || 0
      
      // 時間の重複をチェック（両方向の準備時間を考慮）
      const result = checkTimeOverlap(
        event.start_time,
        event.end_time,
        performanceData.start_time,
        performanceData.end_time,
        existingPrepMinutes,
        newPrepMinutes
      )
      
      if (result.overlap) {
        timeConflict = { event, reason: result.reason || '時間が重複' }
        break
      }
    }
    
    if (timeConflict) {
      const conflictingEvent = timeConflict.event
      const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
      
      // 重複警告モーダルを表示
      setConflictInfo({
        date: performanceData.date,
        storeName,
        timeSlot: `${conflictingEvent.start_time.slice(0, 5)}〜${conflictingEvent.end_time.slice(0, 5)}（${timeConflict.reason}）`,
        conflictingEvent: {
          scenario: conflictingEvent.scenario,
          gms: conflictingEvent.gms,
          start_time: conflictingEvent.start_time,
          end_time: conflictingEvent.end_time
        }
      })
      setPendingPerformanceData(performanceData)
      setIsConflictWarningOpen(true)
      return false  // 重複警告表示時はダイアログを閉じない
    }
    
    // 重複がない場合は直接保存
    return await doSavePerformance(performanceData)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSavePerformanceは後で定義されるため意図的に省略
  }, [events, stores, scenarios, modalMode])

  // 実際の保存処理（重複チェックなし）
  const doSavePerformance = useCallback(async (performanceData: PerformanceData): Promise<boolean> => {
    try {
      // メモに変換する場合の特別処理
      if (performanceData.category === 'memo') {
        // シナリオ名とGM名をテキストに変換
        const memoLines: string[] = []
        if (performanceData.scenario) {
          memoLines.push(`【${performanceData.scenario}】`)
        }
        if (performanceData.gms && performanceData.gms.length > 0) {
          const gmNames = performanceData.gms.filter((gm: string) => gm.trim() !== '')
          if (gmNames.length > 0) {
            memoLines.push(`GM: ${gmNames.join(', ')}`)
          }
        }
        if (performanceData.notes) {
          memoLines.push(performanceData.notes)
        }
        const memoText = memoLines.join('\n')
        
        // 店舗IDを取得
        const storeId = performanceData.venue
        
        // スロットメモとして保存（localStorage）
        // time_slotを英語形式に変換（'朝'→'morning', '昼'→'afternoon', '夜'→'evening'）
        const timeSlotKey: 'morning' | 'afternoon' | 'evening' = scheduleTimeSlotToEn(performanceData.time_slot) ?? 'afternoon'

        void saveEmptySlotMemo(performanceData.date, storeId, timeSlotKey, memoText)
        logger.log('✅ スロットメモ保存成功:', performanceData.date, storeId, timeSlotKey, memoText.substring(0, 50))
        
        // 編集モードの場合、元の公演を削除
        if (modalMode === 'edit' && performanceData.id) {
          await scheduleApi.delete(performanceData.id)
          showToast.success('公演をメモに変換しました')
        } else {
          showToast.success('メモを保存しました')
        }
        
        // モーダルを閉じる
        setIsPerformanceModalOpen(false)
        setEditingEvent(null)
        
        // スケジュールを再読み込み（fetchScheduleがsetEventsを行うので重複を避ける）
        if (fetchSchedule) {
          await fetchSchedule()
        }
        return true
      }
      
      if (modalMode === 'add') {
        // 新規追加
        // performanceData.venueは店舗ID（UUID）
        // 店舗の存在確認（通常の店舗 or 臨時会場）
        let storeQuery = supabase
          .from('stores')
          .select('id, name')
          .eq('id', performanceData.venue)
        if (organizationId) {
          storeQuery = storeQuery.eq('organization_id', organizationId)
        }
        const { data: storeData, error: storeError } = await storeQuery.single()
        
        if (storeError || !storeData) {
          throw new Error(`店舗ID「${performanceData.venue}」が見つかりません。先に店舗管理で店舗を追加してください。`)
        }
        
        const storeName = storeData.name
        
        // シナリオIDを取得
        let scenarioId = null
        if (performanceData.scenario) {
          const matchingScenario = scenarios.find(s => s.title === performanceData.scenario)
          scenarioId = matchingScenario?.id || null
        }
        
        // Supabaseに保存するデータ形式に変換
        // 全ての公演は最初は非公開、公開ボタンを押すまで公開しない
        
        // organization_idが取得できない場合はエラー
        if (!organizationId) {
          throw new Error('組織情報が取得できません。再ログインしてください。')
        }
        
        const eventData = {
          date: performanceData.date,
          store_id: storeData.id,
          venue: storeName,
          scenario: performanceData.scenario || '',
          scenario_master_id: scenarioId,
          category: performanceData.category,
          start_time: performanceData.start_time,
          end_time: performanceData.end_time,
          capacity: performanceData.max_participants,
          // gmsには名前のみ保存（空文字とUUIDを除外）
          gms: (() => {
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            return performanceData.gms.filter((gm: string) => gm.trim() !== '' && !uuidPattern.test(gm))
          })(),
          // gm_rolesからもUUIDキーを除外
          gm_roles: (() => {
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            const roles = performanceData.gm_roles || {}
            const cleanedRoles: Record<string, string> = {}
            Object.entries(roles).forEach(([key, value]) => {
              if (!uuidPattern.test(key)) {
                cleanedRoles[key] = value
              }
            })
            return cleanedRoles
          })(),
          notes: performanceData.notes || undefined,
          time_slot: performanceData.time_slot || null, // 時間帯（朝/昼/夜）
          venue_rental_fee: performanceData.venue_rental_fee, // 場所貸し公演料金
          is_reservation_enabled: false, // 最初は非公開、公開ボタンで公開
          organization_id: organizationId, // マルチテナント対応
          reservation_name: performanceData.reservation_name || null, // 予約者名（貸切用）
          is_reservation_name_overwritten: !!performanceData.reservation_name // 手動入力は上書きとみなす
        }

        // 楽観的 insert: 保存完了前にセルへ表示し、ユーザの不安感を解消する
        // 失敗時は finally ブロックで除外、成功時は real id に置き換える
        const matchedScenarioForOptimistic = scenarios.find(s => s.title === performanceData.scenario)
        const tempEventId = `temp-${crypto.randomUUID()}`
        const optimisticEvent: ScheduleEvent = {
          id: tempEventId,
          date: performanceData.date,
          venue: storeData.id,
          scenario: performanceData.scenario || '',
          scenarios: matchedScenarioForOptimistic ? {
            id: matchedScenarioForOptimistic.id,
            title: matchedScenarioForOptimistic.title,
            player_count_max: matchedScenarioForOptimistic.player_count_max ?? 8
          } : undefined,
          gms: performanceData.gms || [],
          gm_roles: performanceData.gm_roles || {},
          start_time: performanceData.start_time,
          end_time: performanceData.end_time,
          category: performanceData.category as ScheduleEvent['category'],
          is_cancelled: false,
          current_participants: 0,
          max_participants: performanceData.max_participants,
          notes: performanceData.notes || ''
        }
        setEvents(prev => [...prev, optimisticEvent])

        // Supabaseに保存
        let savedEvent
        try {
          savedEvent = await scheduleApi.create(eventData)
        } catch (saveError) {
          // 楽観的 insert を rollback
          setEvents(prev => prev.filter(e => e.id !== tempEventId))
          throw saveError
        }

        // 楽観的 insert の temp event を即座に real event へ置き換える。
        // ここを後続処理（履歴記録・スタッフ予約同期＝ネットワーク往復）の後に
        // 置くと、その間ずっと仮ID（temp-）のセルが見えてしまい、右クリックの
        // 中止・削除が「存在しないID」で失敗する（2026-06-13 テストで発覚）
        const matchedScenario = scenarios.find(s => s.title === performanceData.scenario)
        const effectiveMax = matchedScenario?.player_count_max || savedEvent.capacity || 8
        const formattedEvent: ScheduleEvent = {
          id: savedEvent.id,
          date: savedEvent.date,
          venue: savedEvent.store_id,
          scenario: savedEvent.scenario || '',
          scenarios: matchedScenario ? {
            id: matchedScenario.id,
            title: matchedScenario.title,
            player_count_max: matchedScenario.player_count_max ?? 8
          } : undefined,
          gms: savedEvent.gms || [],
          gm_roles: performanceData.gm_roles || {},
          start_time: savedEvent.start_time,
          end_time: savedEvent.end_time,
          category: savedEvent.category,
          is_cancelled: savedEvent.is_cancelled || false,
          current_participants: savedEvent.current_participants || 0,
          max_participants: effectiveMax,
          notes: savedEvent.notes || ''
        }
        setEvents(prev => prev.map(e => e.id === tempEventId ? formattedEvent : e))

        // 履歴を記録（新規作成）
        try {
          const createdSnapshot = await fetchEventSnapshot(savedEvent.id, organizationId)
          void createEventHistory(
            savedEvent.id,
            organizationId,
            'create',
            null,
            createdSnapshot ?? eventData,
            {
              date: eventData.date,
              storeId: eventData.store_id,
              timeSlot: eventData.time_slot || null
            }
          )
        } catch (historyError) {
          logger.error('履歴記録エラー（新規作成）:', historyError)
          // 履歴記録の失敗は保存処理に影響させない
        }

        // GM欄で「スタッフ参加」を選択した場合、予約も作成する
        if (performanceData.gm_roles && Object.values(performanceData.gm_roles).includes('staff')) {
          await reservationApi.syncStaffReservations(
            savedEvent.id,
            performanceData.gms || [],
            performanceData.gm_roles,
            {
              date: performanceData.date,
              start_time: performanceData.start_time,
              scenario_master_id: scenarioId || undefined,
              scenario_title: performanceData.scenario,
              store_id: storeData.id
            }
          )
        }
        
      } else {
        // 編集更新
        
        // 貸切リクエストの場合は reservations テーブルを更新
        logger.log('🔍 貸切判定:', { 
          is_private_request: performanceData.is_private_request, 
          reservation_id: performanceData.reservation_id,
          reservation_name: performanceData.reservation_name 
        })
        if (performanceData.is_private_request && performanceData.reservation_id) {
          let beforeQuery = supabase
            .from('reservations')
            .select(
              `
              store_id,
              display_customer_name,
              schedule_events!schedule_event_id (
                date,
                start_time,
                end_time,
                venue,
                scenario,
                store_id
              )
            `
            )
            .eq('id', performanceData.reservation_id)
          if (organizationId) {
            beforeQuery = beforeQuery.eq('organization_id', organizationId)
          }
          const { data: beforeRow } = await beforeQuery.maybeSingle()

          // performanceData.venueは店舗ID（UUID）
          // 店舗の存在確認（通常の店舗 or 臨時会場）
          let storeQuery = supabase
            .from('stores')
            .select('id, name')
            .eq('id', performanceData.venue)
          if (organizationId) {
            storeQuery = storeQuery.eq('organization_id', organizationId)
          }
          const { data: storeData } = await storeQuery.single()
          
          const storeId = storeData?.id || performanceData.venue
          
          // reservations テーブルを更新（店舗と編集された予約者名）
          // customer_name は元のMMQ予約者名として保持し、display_customer_name に編集後の名前を保存
          const updateStoreParams: RpcAdminUpdateReservationFieldsParams = {
            p_reservation_id: performanceData.reservation_id,
            p_updates: {
              store_id: storeId,
              display_customer_name: performanceData.reservation_name || null,
            },
          }
          const { error: reservationError } = await supabase.rpc('admin_update_reservation_fields', updateStoreParams)
          
          if (reservationError) {
            logger.error('❌ reservations更新エラー:', reservationError)
            throw new Error('貸切リクエストの更新に失敗しました')
          }
          
          logger.log('✅ reservations更新成功:', { reservation_id: performanceData.reservation_id })

          const reservationChanges: Array<{ field: string; label: string; oldValue: string; newValue: string }> = []
          if ((beforeRow?.store_id || '') !== storeId) {
            const oldStoreLabel = beforeRow?.store_id
              ? stores.find((s) => s.id === beforeRow.store_id)?.name || beforeRow.store_id
              : '—'
            reservationChanges.push({
              field: 'store',
              label: '店舗',
              oldValue: oldStoreLabel,
              newValue: storeData?.name || storeId,
            })
          }

          const oldDisplay = (beforeRow?.display_customer_name ?? '').trim()
          const newDisplay = (performanceData.reservation_name ?? '').trim()
          if (oldDisplay !== newDisplay) {
            reservationChanges.push({
              field: 'display_customer_name',
              label: '表示予約者名',
              oldValue: oldDisplay || '—',
              newValue: newDisplay || '—',
            })
          }

          const seRaw = beforeRow?.schedule_events
          const se = Array.isArray(seRaw) ? seRaw[0] : seRaw
          const currentSchedule =
            se != null
              ? {
                  date: se.date,
                  start_time: se.start_time,
                  end_time: se.end_time,
                  venueDisplay: storeData?.name || se.venue || '—',
                  scenario: se.scenario || undefined,
                  store_id: storeId,
                }
              : null

          if (reservationChanges.length > 0 && confirmSendPrivateBookingChangeEmail()) {
            try {
              await sendPrivateBookingCustomerChangeEmail({
                reservationId: performanceData.reservation_id,
                organizationId,
                changes: reservationChanges,
                currentSchedule,
                scenarioTitleHint: performanceData.scenario || se?.scenario,
              })
            } catch (notifyErr) {
              logger.error('貸切予約更新後の顧客メール送信エラー:', notifyErr)
            }
          }
          
          // ローカル状態を更新（店舗と予約者名）
          setEvents(prev => prev.map(event => 
            event.reservation_id === performanceData.reservation_id 
              ? { ...event, venue: storeId, reservation_name: performanceData.reservation_name || '' } 
              : event
          ))
        } else {
          // 編集モードでは必ずIDが存在するはず
          if (!performanceData.id) {
            throw new Error('公演IDが存在しません')
          }
          const eventId = performanceData.id
          
          // シナリオIDを取得
          let scenarioId = null
          if (performanceData.scenario) {
            const matchingScenario = scenarios.find(s => s.title === performanceData.scenario)
            scenarioId = matchingScenario?.id || null
          }
          
          // 通常公演の場合は schedule_events テーブルを更新
          // 店舗名を取得（storesには臨時会場が含まれていないのでDBから取得）
          const storeData = stores.find(s => s.id === performanceData.venue)
          let storeName = storeData?.name || ''
          let isTemporaryVenue = storeData?.is_temporary || false
          
          // storesに見つからない場合はDBから直接取得（臨時会場の場合）
          if (!storeData && performanceData.venue) {
            let storeQuery = supabase
              .from('stores')
              .select('id, name, short_name, is_temporary, temporary_dates, temporary_venue_names')
              .eq('id', performanceData.venue)
            if (organizationId) {
              storeQuery = storeQuery.eq('organization_id', organizationId)
            }
            const { data: dbStoreData } = await storeQuery.single()
            
            if (dbStoreData) {
              storeName = dbStoreData.name || dbStoreData.short_name || ''
              isTemporaryVenue = dbStoreData.is_temporary || false
            }
          }
          
          // 臨時会場で日付が変更された場合、移動先に臨時会場があるかチェック
          if (isTemporaryVenue && performanceData.id) {
            // 元のイベントから日付を取得
            let originalEventQuery = supabase
              .from('schedule_events')
              .select('date')
              .eq('id', performanceData.id)
            if (organizationId) {
              originalEventQuery = originalEventQuery.eq('organization_id', organizationId)
            }
            const { data: originalEvent } = await originalEventQuery.single()
            
            const originalDate = originalEvent?.date
            const newDate = performanceData.date
            
            // 日付が変更されている場合
            if (originalDate && newDate && originalDate !== newDate) {
              // 店舗の臨時会場情報を取得
              let tempVenueQuery = supabase
                .from('stores')
                .select('temporary_dates')
                .eq('id', performanceData.venue)
              if (organizationId) {
                tempVenueQuery = tempVenueQuery.eq('organization_id', organizationId)
              }
              const { data: tempVenueData } = await tempVenueQuery.single()
              
              if (tempVenueData) {
                const currentDates = tempVenueData.temporary_dates || []
                
                // 移動先の日付に臨時会場がない場合は警告して中止
                if (!currentDates.includes(newDate)) {
                  showToast.warning(`移動先の日付（${newDate}）に臨時会場「${storeName}」が追加されていません。先に臨時会場を追加してください。`)
                  return false
                }
              }
            }
          }
          
          // gmsからUUIDを除外（gmsには名前のみ保存）
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          const cleanedGms = (performanceData.gms || []).filter((gm: string) => gm.trim() !== '' && !uuidPattern.test(gm))
          const cleanedRoles: Record<string, string> = {}
          Object.entries(performanceData.gm_roles || {}).forEach(([key, value]) => {
            if (!uuidPattern.test(key)) {
              cleanedRoles[key] = value
            }
          })
          
          // 履歴用: 更新前の値を取得
          let oldEventQuery = supabase
            .from('schedule_events_staff_view')
            .select('id, organization_id, date, venue, store_id, scenario, scenario_master_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, reservation_name, time_slot, venue_rental_fee')
            .eq('id', performanceData.id)
          if (organizationId) {
            oldEventQuery = oldEventQuery.eq('organization_id', organizationId)
          }
          const { data: oldEventData } = await oldEventQuery.single()
          
          // 予約者名の変更を検出：DBの現在値と異なる場合のみ上書きフラグを立てる
          let isNameChanged = false
          if (performanceData.reservation_name) {
            if (oldEventData) {
              const dbReservationName = oldEventData.reservation_name || ''
              const newReservationName = performanceData.reservation_name || ''
              // 現在DBの値と入力値が異なる場合、上書きとみなす
              isNameChanged = dbReservationName !== newReservationName
            }
          }
          
          const updateData = {
            date: performanceData.date, // 日程移動用
            store_id: performanceData.venue, // 店舗移動用（store_id）
            venue: storeName, // 店舗名
            scenario: performanceData.scenario,
            scenario_master_id: scenarioId ?? undefined,
            category: performanceData.category,
            start_time: performanceData.start_time,
            end_time: performanceData.end_time,
            capacity: performanceData.max_participants,
            gms: cleanedGms,
            gm_roles: cleanedRoles,
            notes: performanceData.notes,
            time_slot: performanceData.time_slot || null, // 時間帯（朝/昼/夜）
            venue_rental_fee: performanceData.venue_rental_fee, // 場所貸し公演料金
            reservation_name: performanceData.reservation_name || null, // 予約者名（貸切用）
            // 名前が変更された場合のみ上書きフラグを更新
            ...(isNameChanged ? { is_reservation_name_overwritten: true } : {})
          }
          
          await scheduleApi.update(performanceData.id, updateData)

          // 関連データを同期（日程・時間が変更された場合）
          if (oldEventData && (oldEventData.date !== updateData.date || oldEventData.start_time !== updateData.start_time || oldEventData.end_time !== updateData.end_time)) {
            await syncRelatedDataOnEventDateChange(
              performanceData.id!,
              oldEventData.date,
              oldEventData.start_time,
              updateData.date,
              updateData.start_time,
              updateData.end_time,
              updateData.time_slot || null,
              organizationId
            )
          }

          const notifySchedulePrivateCustomer =
            !!performanceData.reservation_id &&
            (performanceData.category === 'private' || oldEventData?.category === 'private')
          if (notifySchedulePrivateCustomer && oldEventData) {
            const oldSnap = {
              date: oldEventData.date,
              start_time: oldEventData.start_time,
              end_time: oldEventData.end_time,
              venueDisplay: oldEventData.venue || '—',
              scenario: oldEventData.scenario || undefined,
              store_id: oldEventData.store_id,
            }
            const newSnap = {
              date: updateData.date,
              start_time: updateData.start_time,
              end_time: updateData.end_time,
              venueDisplay: updateData.venue || '—',
              scenario: updateData.scenario || undefined,
              store_id: updateData.store_id,
            }
            const scheduleChanges = diffScheduleSnapshotsForCustomerEmail(oldSnap, newSnap)
            if (scheduleChanges.length > 0 && confirmSendPrivateBookingChangeEmail()) {
              try {
                await sendPrivateBookingCustomerChangeEmail({
                  reservationId: performanceData.reservation_id!,
                  organizationId,
                  changes: scheduleChanges,
                  currentSchedule: newSnap,
                  scenarioTitleHint: newSnap.scenario || performanceData.scenario,
                })
              } catch (notifyErr) {
                logger.error('貸切公演（スケジュール更新）後の顧客メール送信エラー:', notifyErr)
              }
            }
          }
          
          // 履歴を記録（更新）
          if (organizationId) {
            try {
              const updatedSnapshot = await fetchEventSnapshot(performanceData.id!, organizationId)
              void createEventHistory(
                performanceData.id!,
                organizationId,
                'update',
                oldEventData || null,
                updatedSnapshot ?? updateData,
                {
                  date: updateData.date,
                  storeId: updateData.store_id,
                  timeSlot: updateData.time_slot || null
                }
              )
            } catch (historyError) {
              logger.error('履歴記録エラー（更新）:', historyError)
              // 履歴記録の失敗は保存処理に影響させない
            }
          }

          // GM欄で「スタッフ参加」を選択した場合、予約も同期する
          if (performanceData.gm_roles) {
            await reservationApi.syncStaffReservations(
              performanceData.id!,
              performanceData.gms || [],
              performanceData.gm_roles,
              {
                date: performanceData.date,
                start_time: performanceData.start_time,
                scenario_master_id: scenarioId || undefined,
                scenario_title: performanceData.scenario,
                store_id: performanceData.venue || undefined
              }
            )
          }

          // ローカル状態を更新（scenariosは元のデータを保持）
          setEvents(prev => prev.map(event => 
            event.id === performanceData.id 
              ? { ...event, ...performanceData, scenarios: event.scenarios, id: performanceData.id! } as ScheduleEvent 
              : event
          ))
        }
      }

      showToast.success('保存しました')
      // ダイアログは閉じない（ユーザーが明示的に閉じる）
      return true
    } catch (error) {
      logger.error('公演保存エラー:', error)
      showToast.error(modalMode === 'add' ? '公演の追加に失敗しました' : '公演の更新に失敗しました')
      return false
    }
  }, [modalMode, stores, scenarios, setEvents, setEditingEvent, setIsPerformanceModalOpen, organizationId, fetchSchedule])

  // 重複警告からの続行処理
  const handleConflictContinue = useCallback(async () => {
    if (!pendingPerformanceData || !conflictInfo) return
    
    try {
      // タイムスロットを判定（保存された枠time_slotを優先）
      let timeSlot: 'morning' | 'afternoon' | 'evening'
      const savedSlot = scheduleTimeSlotToEn(pendingPerformanceData.time_slot)
      if (savedSlot) {
        timeSlot = savedSlot
      } else {
        const startHour = parseInt(pendingPerformanceData.start_time.split(':')[0])
        if (startHour < 12) {
          timeSlot = 'morning'
        } else if (startHour < 18) {
          timeSlot = 'afternoon'
        } else {
          timeSlot = 'evening'
        }
      }
      
      // 既存の重複公演を削除
      const conflictingEvents = events.filter(event => {
        if (modalMode === 'edit' && event.id === pendingPerformanceData.id) {
          return false
        }
        
        // 既存イベントの時間帯も保存された枠を優先
        const eventTimeSlot = getEventTimeSlot(event)
        return event.date === pendingPerformanceData.date &&
               event.venue === pendingPerformanceData.venue &&
               eventTimeSlot === timeSlot &&
               !event.is_cancelled
      })
      
      // 既存公演を削除
      for (const conflictEvent of conflictingEvents) {
        if (conflictEvent.is_private_request && conflictEvent.reservation_id) {
          await supabase.rpc('admin_delete_reservations_by_ids', {
            p_reservation_ids: [conflictEvent.reservation_id],
          } as RpcAdminDeleteReservationsByIdsParams)
        } else {
          await scheduleApi.delete(conflictEvent.id)
        }
      }
      
      // ローカル状態から削除
      setEvents(prev => prev.filter(event => {
        // 既存イベントの時間帯も保存された枠を優先
        const eventTimeSlot = getEventTimeSlot(event)
        const isConflict = event.date === pendingPerformanceData.date &&
                          event.venue === pendingPerformanceData.venue &&
                          eventTimeSlot === timeSlot &&
                          !event.is_cancelled &&
                          event.id !== pendingPerformanceData.id
        return !isConflict
      }))
      
      // 新しい公演を保存
      await doSavePerformance(pendingPerformanceData)
      setPendingPerformanceData(null)
      setIsConflictWarningOpen(false)
      setConflictInfo(null)
    } catch (error) {
      logger.error('既存公演の削除エラー:', error)
      showToast.error('既存公演の削除に失敗しました')
    }
  }, [pendingPerformanceData, conflictInfo, events, modalMode, setEvents, doSavePerformance])

  return {
    // モーダル状態
    isPerformanceModalOpen,
    modalMode,
    modalInitialData,
    editingEvent,
    
    // 削除ダイアログ状態
    isDeleteDialogOpen,
    deletingEvent,

    // 公開ダイアログ状態
    isPublishDialogOpen,
    publishingEvent,
    
    // 重複警告ダイアログ状態
    isConflictWarningOpen,
    conflictInfo,
    pendingPerformanceData,

    // ドラッグ&ドロップ状態
    draggedEvent,
    dropTarget,
    isMoveOrCopyDialogOpen,
    setIsMoveOrCopyDialogOpen,
    
    // ハンドラー
    handleAddPerformance,
    handleEditPerformance,
    handleCloseModal,
    handleDrop,
    handleMoveEvent,
    handleCopyEvent,
    handleSavePerformance,
    handleDeletePerformance,
    handleConfirmDelete,
    deleteEventDirectly,
    deleteCancelPrompt,
    resolveDeleteCancelPrompt,
    handleCancelConfirmPerformance,
    handleUncancelPerformance,
    cancelEventPrompt,
    resolveCancelEventPrompt,
    handleToggleTentative,
    handleToggleReservation,
    handleConfirmPublishToggle,
    handleConflictContinue,
    handleConvertToMemo,
    
    // ダイアログクローズ
    setIsDeleteDialogOpen,
    setIsPublishDialogOpen,
    setIsConflictWarningOpen,
    setConflictInfo,
    setPendingPerformanceData,
    
    // 参加者数変更ハンドラー
    handleParticipantChange
  }
}

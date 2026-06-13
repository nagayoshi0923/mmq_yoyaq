/**
 * 公演のドラッグ&ドロップによる移動・複製操作（Phase 4-3 で useEventOperations から分割）。
 *
 * - checkConflict: 移動/複製先セルの重複判定（タイムスロット単位）
 * - handleMoveEvent: 公演を別セルへ移動（履歴 move_out/move_in・貸切変更メール・関連データ同期つき）
 * - handleCopyEvent: 公演を別セルへ複製（reservation_id はクリア・履歴 copy つき）
 *
 * 挙動は useEventOperations 時代から不変。モーダル/ドラッグ状態（draggedEvent /
 * dropTarget）は useEventModalState 側が持ち、ここには props で渡される。
 */
import { useCallback } from 'react'
import { scheduleApi } from '@/lib/api'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getEventTimeSlot, calcEndTime } from '@/utils/eventOperationUtils'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import {
  diffScheduleSnapshotsForCustomerEmail,
  sendPrivateBookingCustomerChangeEmail,
} from '@/lib/privateBookingCustomerChangeEmail'
import { timeSlotEnToSchedule, timeSlotEnToLabel } from '@/lib/timeSlot'
import {
  confirmSendPrivateBookingChangeEmail,
  syncRelatedDataOnEventDateChange,
} from '@/hooks/eventOperations/eventSyncHelpers'
import type { ScheduleEvent } from '@/types/schedule'

type TimeSlot = 'morning' | 'afternoon' | 'evening'

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
  extra_preparation_time?: number
  scenario_master_id?: string | null
}

interface DropTarget {
  date: string
  venue: string
  timeSlot: string
}

interface UseEventMoveCopyProps {
  events: ScheduleEvent[]
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  stores: Store[]
  scenarios: Scenario[]
  organizationId: string | null
  getSlotDefaults: (date: string, slot: TimeSlot) => { start_time: string; end_time: string }
  draggedEvent: ScheduleEvent | null
  dropTarget: DropTarget | null
  setDraggedEvent: React.Dispatch<React.SetStateAction<ScheduleEvent | null>>
  setDropTarget: React.Dispatch<React.SetStateAction<DropTarget | null>>
}

export function useEventMoveCopy({
  events,
  setEvents,
  stores,
  scenarios,
  organizationId,
  getSlotDefaults,
  draggedEvent,
  dropTarget,
  setDraggedEvent,
  setDropTarget,
}: UseEventMoveCopyProps) {
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

  return {
    handleMoveEvent,
    handleCopyEvent,
  }
}

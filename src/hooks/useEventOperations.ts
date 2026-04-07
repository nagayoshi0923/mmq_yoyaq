// 公演の追加・編集・削除・中止・復活などの操作を管理

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { scheduleApi } from '@/lib/api'
import {
  reservationApi,
  RESERVATION_WITH_CUSTOMER_SELECT_FIELDS,
  joinedCustomerFromReservation,
} from '@/lib/reservationApi' // 追加
import { supabase } from '@/lib/supabase'
import { saveEmptySlotMemo } from '@/components/schedule/SlotMemoInput'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { getTimeSlot } from '@/utils/scheduleUtils'
import { useOrganization } from '@/hooks/useOrganization'
import { useTimeSlotSettings } from '@/hooks/useTimeSlotSettings'
import { createEventHistory } from '@/lib/api/eventHistoryApi'
import {
  diffScheduleSnapshotsForCustomerEmail,
  sendPrivateBookingCustomerChangeEmail,
} from '@/lib/privateBookingCustomerChangeEmail'
import type { ScheduleEvent } from '@/types/schedule'

/** 貸切の予約変更通知メール送信前の確認（OK=送信 / キャンセル=送信しない） */
function confirmSendPrivateBookingChangeEmail(): boolean {
  return confirm(
    'お客様へ予約変更の通知メールを送信しますか？\n\n' +
      '「キャンセル」を選ぶと、保存した内容はそのままでメールだけ送りません。'
  )
}

/**
 * time_slot（'朝'/'昼'/'夜'）を英語形式に変換
 * 保存された枠を優先して使用するため
 */
function convertTimeSlot(timeSlot: string | undefined | null): 'morning' | 'afternoon' | 'evening' | null {
  if (!timeSlot) return null
  switch (timeSlot) {
    case '朝': return 'morning'
    case '昼': return 'afternoon'
    case '夜': return 'evening'
    default: return null
  }
}

/**
 * イベントの時間帯を取得（保存された枠を優先）
 */
function getEventTimeSlot(event: ScheduleEvent | { start_time: string; timeSlot?: string; time_slot?: string | null }): 'morning' | 'afternoon' | 'evening' {
  // ScheduleEvent.time_slot または ローカル型の timeSlot を参照
  const timeSlotValue = 'timeSlot' in event ? event.timeSlot : event.time_slot
  const savedSlot = convertTimeSlot(timeSlotValue)
  if (savedSlot) return savedSlot
  return getTimeSlot(event.start_time)
}

/**
 * 時間文字列を分に変換（HH:MM:SS または HH:MM 形式）
 */
function timeToMinutes(time: string): number {
  const parts = time.split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

/**
 * 2つの時間帯が重複しているかチェック（準備時間を考慮）
 * 準備時間は「次の公演が始まる前に必要な時間」として扱う
 * 
 * @param start1 既存公演の開始時間
 * @param end1 既存公演の終了時間
 * @param start2 新規公演の開始時間
 * @param end2 新規公演の終了時間
 * @param prepMinutes1 既存公演の準備時間（分）- 既存公演の前に必要な時間
 * @param prepMinutes2 新規公演の準備時間（分）- 新規公演の前に必要な時間
 * @returns { overlap: boolean, reason?: string } 重複情報
 */
function checkTimeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
  prepMinutes1: number = 0,
  prepMinutes2: number = 0
): { overlap: boolean; reason?: string } {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  
  // 1. 純粋な時間の重複チェック
  if (!(e1 <= s2 || e2 <= s1)) {
    return { overlap: true, reason: '時間が重複' }
  }
  
  // 2. 既存公演の後に新規公演がある場合：
  //    既存公演終了 + 新規公演の準備時間 > 新規公演開始
  //    （新規公演の前に準備時間が必要）
  if (e1 <= s2 && e1 + prepMinutes2 > s2) {
    return { overlap: true, reason: `準備時間不足（次の公演の前に${prepMinutes2}分必要）` }
  }
  
  // 3. 新規公演の後に既存公演がある場合：
  //    新規公演終了 + 既存公演の準備時間 > 既存公演開始
  //    （既存公演の前に準備時間が必要）
  if (e2 <= s1 && e2 + prepMinutes1 > s1) {
    return { overlap: true, reason: `準備時間不足（次の公演の前に${prepMinutes1}分必要）` }
  }
  
  return { overlap: false }
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
      let candidateTimeSlot: string | undefined
      if (newTimeSlotSchedule === '朝') candidateTimeSlot = '午前'
      else if (newTimeSlotSchedule === '昼') candidateTimeSlot = '午後'
      else if (newTimeSlotSchedule === '夜') candidateTimeSlot = '夜間'

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
}

interface UseEventOperationsProps {
  events: ScheduleEvent[]
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  stores: Store[]
  scenarios: Scenario[]
  fetchSchedule?: () => Promise<void>
}

// 参加者数の変更を処理する関数
const handleParticipantChange = (
  eventId: string, 
  newCount: number,
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
) => {
  setEvents(prevEvents => 
    prevEvents.map(event => 
      event.id === eventId 
        ? { ...event, current_participants: newCount }
        : event
    )
  )
  logger.log('イベントの参加者数を即座に更新:', { eventId, newCount })
}

interface PerformanceData {
  id?: string
  date: string
  store_id: string
  venue: string
  scenario: string
  scenario_id?: string
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
  
  // URL パラメータ（公演ダイアログの状態をURLに保持）
  const [searchParams, setSearchParams] = useSearchParams()
  const initializedRef = useRef(false)
  
  // モーダル状態
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [modalInitialData, setModalInitialData] = useState<{
    date: string
    venue: string
    time_slot: string  // DBカラム名に統一
    suggestedStartTime?: string  // 前の公演終了時間から計算した推奨開始時間
  } | undefined>(undefined)
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null)
  
  // 削除ダイアログ状態
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingEvent, setDeletingEvent] = useState<ScheduleEvent | null>(null)
  
  // 中止ダイアログ状態
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancellingEvent, setCancellingEvent] = useState<ScheduleEvent | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  
  // 公開ダイアログ状態
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)
  const [publishingEvent, setPublishingEvent] = useState<ScheduleEvent | null>(null)
  
  // 重複警告ダイアログ状態
  const [isConflictWarningOpen, setIsConflictWarningOpen] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<any>(null)
  const [pendingPerformanceData, setPendingPerformanceData] = useState<any>(null)

  // ドラッグ&ドロップ状態
  const [draggedEvent, setDraggedEvent] = useState<ScheduleEvent | null>(null)
  const [dropTarget, setDropTarget] = useState<{ date: string, venue: string, timeSlot: string } | null>(null)
  const [isMoveOrCopyDialogOpen, setIsMoveOrCopyDialogOpen] = useState(false)
  
  // URLパラメータから公演ダイアログを復元
  useEffect(() => {
    if (initializedRef.current || events.length === 0) return
    
    const eventId = searchParams.get('event')
    if (eventId) {
      const event = events.find(e => e.id === eventId)
      if (event) {
        setModalMode('edit')
        setEditingEvent(event)
        setModalInitialData(undefined)
        setIsPerformanceModalOpen(true)
        initializedRef.current = true
        logger.log('📝 URLから公演ダイアログを復元:', eventId)
      }
    } else {
      initializedRef.current = true
    }
  }, [events, searchParams])

  // 公演追加モーダルを開く
  const handleAddPerformance = useCallback((date: string, venue: string, time_slot: 'morning' | 'afternoon' | 'evening') => {
    setModalMode('add')
    
    // 同じ日・同じ店舗・同じ時間帯の前の公演を探して、推奨開始時間を計算
    let suggestedStartTime: string | undefined = undefined
    
    // time_slotを日本語形式に変換（DBに保存されている形式）
    const timeSlotJa = time_slot === 'morning' ? '朝' : time_slot === 'afternoon' ? '昼' : '夜'
    
    // 同じ日・同じ店舗・同じ時間帯のイベントのみ取得
    const sameSlotEvents = events.filter(e => 
      e.date === date && 
      e.venue === venue && 
      !e.is_cancelled &&
      e.time_slot === timeSlotJa  // 同じ時間帯のみ
    )
    
    if (sameSlotEvents.length > 0) {
      // 終了時間でソート（遅い順）
      const sortedEvents = [...sameSlotEvents].sort((a, b) => {
        const aEnd = a.end_time || '00:00'
        const bEnd = b.end_time || '00:00'
        return bEnd.localeCompare(aEnd)
      })
      
      // 最後の公演の終了時間を取得
      const lastEvent = sortedEvents[0]
      const lastEndTime = lastEvent.end_time
      
      if (lastEndTime) {
        // 終了時間に1時間（標準準備時間）を加算
        const [endHour, endMinute] = lastEndTime.split(':').map(Number)
        const newHour = endHour + 1 // 1時間の準備時間
        const newMinute = endMinute
        
        // 24時を超える場合は調整しない（深夜公演は手動で）
        if (newHour < 24) {
          suggestedStartTime = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`
        }
      }
    }
    
    setModalInitialData({ date, venue, time_slot, suggestedStartTime })
    setEditingEvent(null)
    setIsPerformanceModalOpen(true)
  }, [events])

  // 編集モーダルを開く
  const handleEditPerformance = useCallback((event: ScheduleEvent) => {
    setModalMode('edit')
    setEditingEvent(event)
    setModalInitialData(undefined)
    setIsPerformanceModalOpen(true)
    
    // URLにイベントIDを追加（リロード時に復元可能に）
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      newParams.set('event', event.id)
      return newParams
    }, { replace: true })
  }, [setSearchParams])

  // モーダルを閉じる
  const handleCloseModal = useCallback(async () => {
    setIsPerformanceModalOpen(false)
    setModalInitialData(undefined)
    setEditingEvent(null)
    
    // URLからイベントIDを削除
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      newParams.delete('event')
      return newParams
    }, { replace: true })
    
    // 🔄 Realtime購読により自動同期されるため、手動でのfetchScheduleは不要
    // 楽観的更新 + Realtime で二重更新を防ぎ、チカチカを解消
  }, [setSearchParams])

  // ドラッグ&ドロップハンドラー
  const handleDrop = useCallback((droppedEvent: ScheduleEvent, targetDate: string, targetVenue: string, targetTimeSlot: 'morning' | 'afternoon' | 'evening') => {
    // 同じ場所へのドロップは無視
    const sourceTimeSlot = getTimeSlot(droppedEvent.start_time)
    if (droppedEvent.date === targetDate && droppedEvent.venue === targetVenue && sourceTimeSlot === targetTimeSlot) {
      return
    }

    // ドラッグされた公演と移動先情報を保存
    setDraggedEvent(droppedEvent)
    setDropTarget({ date: targetDate, venue: targetVenue, timeSlot: targetTimeSlot })
    setIsMoveOrCopyDialogOpen(true)
  }, [])

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
        const timeSlotLabel = dropTarget.timeSlot === 'morning' ? '午前' : dropTarget.timeSlot === 'afternoon' ? '午後' : '夜'
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
      
      // 時間帯が同じなら元の時間を保持、違うならデフォルト時間を使用
      const isSameTimeSlot = sourceTimeSlot === targetTimeSlot
      const startTime = isSameTimeSlot ? draggedEvent.start_time : defaults.start_time
      const endTime = isSameTimeSlot ? draggedEvent.end_time : defaults.end_time

      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const isRealEventId = uuidPattern.test(draggedEvent.id)

      // シナリオIDを取得（元のイベントから、またはシナリオリストから検索）
      let scenarioId = draggedEvent.scenarios?.id || null
      if (!scenarioId && draggedEvent.scenario) {
        const matchingScenario = scenarios.find(s => s.title === draggedEvent.scenario)
        scenarioId = matchingScenario?.id || null
      }

      // 新しい位置に公演を作成/更新
      // organization_idが取得できない場合はエラー
      if (!organizationId) {
        throw new Error('組織情報が取得できません。再ログインしてください。')
      }
      
      // 時間帯ラベルを移動先に更新
      const timeSlotLabel = targetTimeSlot === 'morning' ? '朝' : targetTimeSlot === 'afternoon' ? '昼' : '夜'
      
      const newEventData = {
        date: dropTarget.date,
        store_id: dropTarget.venue,
        venue: stores.find(s => s.id === dropTarget.venue)?.name || '',
        scenario: draggedEvent.scenario,
        scenario_id: scenarioId ?? undefined,
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
  }, [draggedEvent, dropTarget, stores, setEvents, checkConflict, organizationId, getSlotDefaults, scenarios])

  // 公演を複製
  const handleCopyEvent = useCallback(async () => {
    if (!draggedEvent || !dropTarget) return

    try {
      // 🚨 CRITICAL: 複製先の重複チェック
      const targetTimeSlot = dropTarget.timeSlot as 'morning' | 'afternoon' | 'evening'
      const conflict = checkConflict(dropTarget.date, dropTarget.venue, targetTimeSlot)
      if (conflict) {
        const timeSlotLabel = targetTimeSlot === 'morning' ? '午前' : targetTimeSlot === 'afternoon' ? '午後' : '夜'
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
      
      // 時間帯が同じなら元の時間を保持、違うならデフォルト時間を使用
      const isSameTimeSlot = sourceTimeSlot === targetTimeSlot
      const startTime = isSameTimeSlot ? draggedEvent.start_time : defaults.start_time
      const endTime = isSameTimeSlot ? draggedEvent.end_time : defaults.end_time

      // シナリオIDを取得（元のイベントから、またはシナリオリストから検索）
      let scenarioId = draggedEvent.scenarios?.id || null
      if (!scenarioId && draggedEvent.scenario) {
        const matchingScenario = scenarios.find(s => s.title === draggedEvent.scenario)
        scenarioId = matchingScenario?.id || null
      }

      // 新しい位置に公演を作成（元の公演は残す）
      // organization_idが取得できない場合はエラー
      if (!organizationId) {
        throw new Error('組織情報が取得できません。再ログインしてください。')
      }
      
      // 時間帯ラベルを複製先に更新
      const timeSlotLabel = targetTimeSlot === 'morning' ? '朝' : targetTimeSlot === 'afternoon' ? '昼' : '夜'
      
      const newEventData = {
        date: dropTarget.date,
        store_id: dropTarget.venue,
        venue: stores.find(s => s.id === dropTarget.venue)?.name || '',
        scenario: draggedEvent.scenario,
        scenario_id: scenarioId,
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
  }, [draggedEvent, dropTarget, stores, setEvents, checkConflict, organizationId, getSlotDefaults, scenarios])

  // 🚨 CRITICAL: 公演保存時の重複チェック機能（タイムスロット + 実時間 + 準備時間）
  const handleSavePerformance = useCallback(async (performanceData: PerformanceData): Promise<boolean> => {
    // タイムスロットを判定（保存された枠time_slotを優先、なければstart_timeから判定）
    let timeSlot: 'morning' | 'afternoon' | 'evening'
    const savedSlot = convertTimeSlot(performanceData.time_slot)
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
      const timeSlotLabel = timeSlot === 'morning' ? '午前' : timeSlot === 'afternoon' ? '午後' : '夜'
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
        let timeSlotKey: 'morning' | 'afternoon' | 'evening' = 'afternoon'
        const ts = performanceData.time_slot
        if (ts === '朝' || ts === 'morning') timeSlotKey = 'morning'
        else if (ts === '昼' || ts === 'afternoon') timeSlotKey = 'afternoon'
        else if (ts === '夜' || ts === 'evening') timeSlotKey = 'evening'
        
        saveEmptySlotMemo(performanceData.date, storeId, timeSlotKey, memoText)
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
          scenario_id: scenarioId,
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
        
        // Supabaseに保存
        const savedEvent = await scheduleApi.create(eventData)
        
        // 履歴を記録（新規作成）
        try {
          await createEventHistory(
            savedEvent.id,
            organizationId,
            'create',
            null,
            eventData,
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
              scenario_id: scenarioId || undefined,
              scenario_title: performanceData.scenario,
              store_id: storeData.id
            }
          )
        }
        
        // シナリオ情報を取得（シナリオマスタ未登録チェック用）
        const matchedScenario = scenarios.find(s => s.title === performanceData.scenario)
        
        // 内部形式に変換して状態に追加
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
          max_participants: savedEvent.capacity || 8,
          notes: savedEvent.notes || ''
        }
        
        setEvents(prev => [...prev, formattedEvent])
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
          const { error: reservationError } = await supabase.rpc('admin_update_reservation_fields', {
            p_reservation_id: performanceData.reservation_id,
            p_updates: {
              store_id: storeId,
              display_customer_name: performanceData.reservation_name || null
            }
          })
          
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
            .from('schedule_events')
            .select('id, organization_id, date, venue, store_id, scenario, scenario_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, reservation_name, time_slot, venue_rental_fee')
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
            scenario_id: scenarioId ?? undefined,
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
              await createEventHistory(
                performanceData.id!,
                organizationId,
                'update',
                oldEventData || null,
                updateData,
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
                scenario_id: scenarioId || undefined,
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
  }, [modalMode, stores, scenarios, setEvents, organizationId, fetchSchedule])

  // 削除確認ダイアログを開く
  const handleDeletePerformance = useCallback((event: ScheduleEvent) => {
    setDeletingEvent(event)
    setIsDeleteDialogOpen(true)
  }, [])

  // 公演を削除
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingEvent) return

    try {
      // 貸切予約の判定: is_private_requestフラグまたは、IDが`private-`で始まる、または複合ID形式
      const isPrivateBooking = deletingEvent.is_private_request || 
                               deletingEvent.id.startsWith('private-') ||
                               (deletingEvent.id.includes('-') && deletingEvent.id.split('-').length > 5)
      
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
        const { error } = await supabase.rpc('admin_delete_reservations_by_ids', {
          p_reservation_ids: [reservationId]
        })
        
        if (error) throw error
        
        // schedule_event_idが紐付いている場合、schedule_eventsも削除
        if (reservation?.schedule_event_id) {
          // 削除前にイベント情報を取得（履歴用）
          let eventQuery = supabase
            .from('schedule_events')
            .select('id, organization_id, date, venue, store_id, scenario, scenario_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, reservation_name, time_slot, venue_rental_fee')
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
              await createEventHistory(
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
          .from('schedule_events')
          .select('id, organization_id, date, venue, store_id, scenario, scenario_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, reservation_name, time_slot, venue_rental_fee')
          .eq('id', deletingEvent.id)
        if (organizationId) {
          eventQuery = eventQuery.eq('organization_id', organizationId)
        }
        const { data: eventToDelete } = await eventQuery.single()
        
        await scheduleApi.delete(deletingEvent.id)
        
        // 履歴を記録（削除）
        if (organizationId && eventToDelete) {
          try {
            await createEventHistory(
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
      // 貸切予約の判定: is_private_requestフラグまたは、IDが`private-`で始まる、または複合ID形式
      const isPrivateBooking = eventToDelete.is_private_request || 
                               eventToDelete.id.startsWith('private-') ||
                               (eventToDelete.id.includes('-') && eventToDelete.id.split('-').length > 5)
      
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
        const { error } = await supabase.rpc('admin_delete_reservations_by_ids', {
          p_reservation_ids: [reservationId]
        })
        
        if (error) throw error
        
        // schedule_event_idが紐付いている場合、schedule_eventsも削除
        if (reservation?.schedule_event_id) {
          // 削除前にイベント情報を取得（履歴用）
          let eventQuery = supabase
            .from('schedule_events')
            .select('id, organization_id, date, venue, store_id, scenario, scenario_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, reservation_name, time_slot, venue_rental_fee')
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
              await createEventHistory(
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
        await scheduleApi.delete(eventToDelete.id)
        
        // 履歴を記録（削除）
        if (organizationId) {
          try {
            await createEventHistory(
              null,
              organizationId,
              'delete',
              eventToDelete as unknown as Record<string, unknown>,
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
        const reason = cancellationReason || '誠に申し訳ございませんが、やむを得ない事情により公演を中止させていただくこととなりました。'
        await scheduleApi.toggleCancel(cancellingEvent.id, true, reason)
        setEvents(prev => prev.map(e => 
          e.id === cancellingEvent.id ? { ...e, is_cancelled: true, cancellation_reason: reason } : e
        ))
        
        // 履歴を記録（中止）
        if (organizationId) {
          try {
            await createEventHistory(
              cancellingEvent.id,
              organizationId,
              'cancel',
              { is_cancelled: false },
              { is_cancelled: true },
              {
                date: cancellingEvent.date,
                storeId: cancellingEvent.venue,
                timeSlot: cancellingEvent.time_slot || null
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
      // schedule_events.is_cancelled を必ず false に更新
      await scheduleApi.toggleCancel(event.id, false)
      
      // 貸切予約の場合は予約ステータスも更新
      if (event.is_private_request && event.reservation_id) {
        const { error } = await supabase.rpc('admin_update_reservation_fields', {
          p_reservation_id: event.reservation_id,
          p_updates: {
            status: 'gm_confirmed'
          }
        })
        
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
          await createEventHistory(
            event.id,
            organizationId,
            'restore',
            { is_cancelled: true },
            { is_cancelled: false },
            {
              date: event.date,
              storeId: event.venue,
              timeSlot: event.time_slot || null
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

  // 仮状態の切り替え
  const handleToggleTentative = useCallback(async (event: ScheduleEvent) => {
    try {
      const newStatus = !event.is_tentative
      
      await scheduleApi.update(event.id, {
        is_tentative: newStatus
      })

      setEvents(prev => prev.map(e => 
        e.id === event.id ? { ...e, is_tentative: newStatus } : e
      ))
    } catch (error) {
      logger.error('仮状態の更新エラー:', error)
      throw error
    }
  }, [setEvents])

  // 予約サイト公開/非公開トグル（直接切り替え）
  const handleToggleReservation = useCallback(async (event: ScheduleEvent) => {
    if (event.is_private_request) {
      showToast.warning('貸切公演の公開状態は変更できません')
      return
    }
    
    const isPrivateBooking = event.id.startsWith('private-') ||
                            (event.id.includes('-') && event.id.split('-').length > 5)
    if (isPrivateBooking) {
      showToast.warning('貸切公演の公開状態は変更できません')
      return
    }
    
    try {
      const newStatus = !event.is_reservation_enabled
      
      await scheduleApi.update(event.id, {
        is_reservation_enabled: newStatus
      })

      setEvents(prev => prev.map(e => 
        e.id === event.id ? { ...e, is_reservation_enabled: newStatus } : e
      ))
    } catch (error) {
      logger.error('予約サイト公開状態の更新エラー:', error)
      showToast.error('予約サイト公開状態の更新に失敗しました')
    }
  }, [setEvents])
  
  const handleConfirmPublishToggle = useCallback(async () => {
    if (!publishingEvent) return
    
    const isPrivateBooking = publishingEvent.is_private_request || 
                            publishingEvent.id.startsWith('private-') ||
                            (publishingEvent.id.includes('-') && publishingEvent.id.split('-').length > 5)
    if (isPrivateBooking) {
      showToast.warning('貸切公演の公開状態は変更できません')
      setIsPublishDialogOpen(false)
      setPublishingEvent(null)
      return
    }
    
    try {
      const newStatus = !publishingEvent.is_reservation_enabled
      
      await scheduleApi.update(publishingEvent.id, {
        is_reservation_enabled: newStatus
      })

      setEvents(prev => prev.map(e => 
        e.id === publishingEvent.id ? { ...e, is_reservation_enabled: newStatus } : e
      ))
      
      setIsPublishDialogOpen(false)
      setPublishingEvent(null)
    } catch (error) {
      logger.error('予約サイト公開状態の更新エラー:', error)
      showToast.error('予約サイト公開状態の更新に失敗しました')
    }
  }, [publishingEvent, setEvents])

  // 重複警告からの続行処理
  const handleConflictContinue = useCallback(async () => {
    if (!pendingPerformanceData || !conflictInfo) return
    
    try {
      // タイムスロットを判定（保存された枠time_slotを優先）
      let timeSlot: 'morning' | 'afternoon' | 'evening'
      const savedSlot = convertTimeSlot(pendingPerformanceData.time_slot)
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
            p_reservation_ids: [conflictEvent.reservation_id]
          })
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

  // 公演をメモに変換（モーダルなしで直接変換）
  const handleConvertToMemo = useCallback(async (event: ScheduleEvent) => {
    try {
      // シナリオ名とGM名をテキストに変換
      const memoLines: string[] = []
      if (event.scenario) {
        memoLines.push(`【${event.scenario}】`)
      }
      if (event.gms && event.gms.length > 0) {
        const gmNames = event.gms.filter((gm: string) => gm.trim() !== '')
        if (gmNames.length > 0) {
          memoLines.push(`GM: ${gmNames.join(', ')}`)
        }
      }
      if (event.notes) {
        memoLines.push(event.notes)
      }
      const memoText = memoLines.join('\n')
      
      // 店舗IDを取得（venueにstore_idが入っている）
      const storeId = event.venue
      
      // 時間帯を取得
      const timeSlotKey = getEventTimeSlot(event)
      
      // スロットメモとして保存
      saveEmptySlotMemo(event.date, storeId, timeSlotKey, memoText)
      logger.log('✅ スロットメモ保存成功:', event.date, storeId, timeSlotKey, memoText.substring(0, 50))
      
      // 公演を削除
      await scheduleApi.delete(event.id)
      showToast.success('公演をメモに変換しました')
      
      // スケジュールを再読み込み
      if (fetchSchedule) {
        await fetchSchedule()
      }
    } catch (error) {
      logger.error('メモ変換エラー:', error)
      showToast.error('メモへの変換に失敗しました')
    }
  }, [fetchSchedule])

  return {
    // モーダル状態
    isPerformanceModalOpen,
    modalMode,
    modalInitialData,
    editingEvent,
    
    // 削除ダイアログ状態
    isDeleteDialogOpen,
    deletingEvent,
    
    // 中止ダイアログ状態
    isCancelDialogOpen,
    cancellingEvent,
    cancellationReason,
    setCancellationReason,
    
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
    handleCancelConfirmPerformance,
    handleConfirmCancel,
    handleUncancelPerformance,
    handleToggleTentative,
    handleToggleReservation,
    handleConfirmPublishToggle,
    handleConflictContinue,
    handleConvertToMemo,
    
    // ダイアログクローズ
    setIsDeleteDialogOpen,
    setIsCancelDialogOpen,
    setIsPublishDialogOpen,
    setIsConflictWarningOpen,
    setConflictInfo,
    setPendingPerformanceData,
    
    // 参加者数変更ハンドラー
    handleParticipantChange: (eventId: string, newCount: number) => 
      handleParticipantChange(eventId, newCount, setEvents)
  }
}


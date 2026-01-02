// 公演の追加・編集・削除・中止・復活などの操作を管理

import { useState, useCallback } from 'react'
import { scheduleApi } from '@/lib/api'
import { reservationApi } from '@/lib/reservationApi' // 追加
import { supabase } from '@/lib/supabase'
import { saveEmptySlotMemo } from '@/components/schedule/SlotMemoInput'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getTimeSlot, TIME_SLOT_DEFAULTS } from '@/utils/scheduleUtils'
import { useOrganization } from '@/hooks/useOrganization'
import type { ScheduleEvent } from '@/types/schedule'

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
  const savedSlot = convertTimeSlot((event as any).timeSlot || (event as any).time_slot)
  if (savedSlot) return savedSlot
  return getTimeSlot(event.start_time)
}

interface Store {
  id: string
  name: string
  short_name: string
}

interface Scenario {
  id: string
  title: string
  duration?: number
  player_count_max?: number
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
  
  // モーダル状態
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [modalInitialData, setModalInitialData] = useState<{
    date: string
    venue: string
    time_slot: string  // DBカラム名に統一
  } | undefined>(undefined)
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null)
  
  // 削除ダイアログ状態
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingEvent, setDeletingEvent] = useState<ScheduleEvent | null>(null)
  
  // 中止ダイアログ状態
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancellingEvent, setCancellingEvent] = useState<ScheduleEvent | null>(null)
  
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

  // 公演追加モーダルを開く
  const handleAddPerformance = useCallback((date: string, venue: string, time_slot: 'morning' | 'afternoon' | 'evening') => {
    setModalMode('add')
    setModalInitialData({ date, venue, time_slot })
    setEditingEvent(null)
    setIsPerformanceModalOpen(true)
  }, [])

  // 編集モーダルを開く
  const handleEditPerformance = useCallback((event: ScheduleEvent) => {
    setModalMode('edit')
    setEditingEvent(event)
    setModalInitialData(undefined)
    setIsPerformanceModalOpen(true)
  }, [])

  // モーダルを閉じる
  const handleCloseModal = useCallback(async () => {
    setIsPerformanceModalOpen(false)
    setModalInitialData(undefined)
    setEditingEvent(null)
    
    // 🔄 Realtime購読により自動同期されるため、手動でのfetchScheduleは不要
    // 楽観的更新 + Realtime で二重更新を防ぎ、チカチカを解消
  }, [])

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
        const timeSlotLabel = dropTarget.timeSlot === 'morning' ? '午前' : dropTarget.timeSlot === 'afternoon' ? '午後' : '夜間'
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

      // 移動先の時間を計算
      const defaults = TIME_SLOT_DEFAULTS[dropTarget.timeSlot as 'morning' | 'afternoon' | 'evening']

      // 元の公演を削除
      await scheduleApi.delete(draggedEvent.id)

      // シナリオIDを取得（元のイベントから、またはシナリオリストから検索）
      let scenarioId = draggedEvent.scenarios?.id || null
      if (!scenarioId && draggedEvent.scenario) {
        const matchingScenario = scenarios.find(s => s.title === draggedEvent.scenario)
        scenarioId = matchingScenario?.id || null
      }

      // 新しい位置に公演を作成
      // organization_idが取得できない場合はエラー
      if (!organizationId) {
        throw new Error('組織情報が取得できません。再ログインしてください。')
      }
      
      const newEventData = {
        date: dropTarget.date,
        store_id: dropTarget.venue,
        venue: stores.find(s => s.id === dropTarget.venue)?.name || '',
        scenario: draggedEvent.scenario,
        scenario_id: scenarioId,
        category: draggedEvent.category,
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        capacity: draggedEvent.max_participants,
        gms: draggedEvent.gms,
        notes: draggedEvent.notes,
        organization_id: organizationId // マルチテナント対応
      }

      const savedEvent = await scheduleApi.create(newEventData)

      // ローカル状態を更新（scenariosは元のイベントから保持）
      setEvents(prev => {
        const filtered = prev.filter(e => e.id !== draggedEvent.id)
        const newEvent: ScheduleEvent = {
          ...savedEvent,
          venue: dropTarget.venue,
          scenarios: draggedEvent.scenarios || savedEvent.scenarios
        }
        return [...filtered, newEvent]
      })

      setDraggedEvent(null)
      setDropTarget(null)
    } catch (error) {
      logger.error('公演移動エラー:', error)
      showToast.error('公演の移動に失敗しました')
    }
  }, [draggedEvent, dropTarget, stores, setEvents, checkConflict, organizationId])

  // 公演を複製
  const handleCopyEvent = useCallback(async () => {
    if (!draggedEvent || !dropTarget) return

    try {
      // 🚨 CRITICAL: 複製先の重複チェック
      const conflict = checkConflict(dropTarget.date, dropTarget.venue, dropTarget.timeSlot as 'morning' | 'afternoon' | 'evening')
      if (conflict) {
        const timeSlotLabel = dropTarget.timeSlot === 'morning' ? '午前' : dropTarget.timeSlot === 'afternoon' ? '午後' : '夜間'
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

      // 移動先の時間を計算
      const defaults = TIME_SLOT_DEFAULTS[dropTarget.timeSlot as 'morning' | 'afternoon' | 'evening']

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
      
      const newEventData = {
        date: dropTarget.date,
        store_id: dropTarget.venue,
        venue: stores.find(s => s.id === dropTarget.venue)?.name || '',
        scenario: draggedEvent.scenario,
        scenario_id: scenarioId,
        category: draggedEvent.category,
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        capacity: draggedEvent.max_participants,
        gms: draggedEvent.gms,
        notes: draggedEvent.notes,
        organization_id: organizationId // マルチテナント対応
      }

      const savedEvent = await scheduleApi.create(newEventData)

      // ローカル状態を更新（元の公演は残す、scenariosは元のイベントから保持）
      const newEvent: ScheduleEvent = {
        ...savedEvent,
        venue: dropTarget.venue,
        scenarios: draggedEvent.scenarios || savedEvent.scenarios
      }
      setEvents(prev => [...prev, newEvent])

      setDraggedEvent(null)
      setDropTarget(null)
    } catch (error) {
      logger.error('公演複製エラー:', error)
      showToast.error('公演の複製に失敗しました')
    }
  }, [draggedEvent, dropTarget, stores, setEvents, checkConflict, organizationId])

  // 🚨 CRITICAL: 公演保存時の重複チェック機能
  const handleSavePerformance = useCallback(async (performanceData: PerformanceData) => {
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
    
    // 重複チェック：同じ日時・店舗・時間帯に既に公演があるか
    const conflictingEvents = events.filter(event => {
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
    
    if (conflictingEvents.length > 0) {
      const conflictingEvent = conflictingEvents[0]
      const timeSlotLabel = timeSlot === 'morning' ? '午前' : timeSlot === 'afternoon' ? '午後' : '夜間'
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
      return
    }
    
    // 重複がない場合は直接保存
    await doSavePerformance(performanceData)
  }, [events, stores, modalMode])

  // 実際の保存処理（重複チェックなし）
  const doSavePerformance = useCallback(async (performanceData: PerformanceData) => {
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
        console.log('✅ スロットメモ保存成功:', performanceData.date, storeId, timeSlotKey, memoText.substring(0, 50))
        
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
        await fetchSchedule()
        return
      }
      
      if (modalMode === 'add') {
        // 新規追加
        // performanceData.venueは店舗ID（UUID）
        // 店舗の存在確認（通常の店舗 or 臨時会場）
        const { data: storeData, error: storeError } = await supabase
          .from('stores')
          .select('id, name')
          .eq('id', performanceData.venue)
          .single()
        
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
          gms: performanceData.gms.filter((gm: string) => gm.trim() !== ''),
          gm_roles: performanceData.gm_roles || {},
          notes: performanceData.notes || null,
          time_slot: performanceData.time_slot || null, // 時間帯（朝/昼/夜）
          venue_rental_fee: performanceData.venue_rental_fee, // 場所貸し公演料金
          is_reservation_enabled: false, // 最初は非公開、公開ボタンで公開
          organization_id: organizationId // マルチテナント対応
        }
        
        // Supabaseに保存
        const savedEvent = await scheduleApi.create(eventData)

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
            player_count_max: matchedScenario.player_count_max
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
        if (performanceData.is_private_request && performanceData.reservation_id) {
          // performanceData.venueは店舗ID（UUID）
          // 店舗の存在確認（通常の店舗 or 臨時会場）
          const { data: storeData } = await supabase
            .from('stores')
            .select('id, name')
            .eq('id', performanceData.venue)
            .single()
          
          const storeId = storeData?.id || performanceData.venue
          
          // reservations テーブルを更新
          const { error: reservationError } = await supabase
            .from('reservations')
            .update({
              store_id: storeId,
              updated_at: new Date().toISOString()
            })
            .eq('id', performanceData.reservation_id)
          
          if (reservationError) {
            throw new Error('貸切リクエストの更新に失敗しました')
          }
          
          // ローカル状態を更新
          setEvents(prev => prev.map(event => 
            event.reservation_id === performanceData.reservation_id 
              ? { ...event, venue: storeId } 
              : event
          ))
        } else {
          // シナリオIDを取得
          let scenarioId = null
          if (performanceData.scenario) {
            const matchingScenario = scenarios.find(s => s.title === performanceData.scenario)
            scenarioId = matchingScenario?.id || null
          }
          
          // 通常公演の場合は schedule_events テーブルを更新
          // 店舗名を取得
          const storeData = stores.find(s => s.id === performanceData.venue)
          const storeName = storeData?.name || ''
          
          await scheduleApi.update(performanceData.id, {
            date: performanceData.date, // 日程移動用
            store_id: performanceData.venue, // 店舗移動用（store_id）
            venue: storeName, // 店舗名
            scenario: performanceData.scenario,
            scenario_id: scenarioId,
            category: performanceData.category,
            start_time: performanceData.start_time,
            end_time: performanceData.end_time,
            capacity: performanceData.max_participants,
            gms: performanceData.gms,
            gm_roles: performanceData.gm_roles || {},
            notes: performanceData.notes,
            time_slot: performanceData.time_slot || null, // 時間帯（朝/昼/夜）
            venue_rental_fee: performanceData.venue_rental_fee // 場所貸し公演料金
          })

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
    } catch (error) {
      logger.error('公演保存エラー:', error)
      showToast.error(modalMode === 'add' ? '公演の追加に失敗しました' : '公演の更新に失敗しました')
    }
  }, [modalMode, stores, scenarios, setEvents, handleCloseModal, organizationId])

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
        const { data: reservation, error: fetchError } = await supabase
          .from('reservations')
          .select('schedule_event_id')
          .eq('id', reservationId)
          .single()
        
        if (fetchError) {
          logger.error('予約情報取得エラー:', fetchError)
        }
        
        // 予約を削除
        const { error } = await supabase
          .from('reservations')
          .delete()
          .eq('id', reservationId)
        
        if (error) throw error
        
        // schedule_event_idが紐付いている場合、schedule_eventsも削除
        if (reservation?.schedule_event_id) {
          const { error: scheduleError } = await supabase
            .from('schedule_events')
            .delete()
            .eq('id', reservation.schedule_event_id)
          
          if (scheduleError) {
            logger.error('schedule_events削除エラー:', scheduleError)
            // エラーでも処理は続行（予約は削除済み）
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
        // 通常の公演を削除する前に、予約の有無をチェック
        const { data: reservations, error: checkError } = await supabase
          .from('reservations')
          .select('id')
          .eq('schedule_event_id', deletingEvent.id)
        
        if (checkError) {
          logger.error('予約チェックエラー:', checkError)
          throw new Error('予約情報の確認に失敗しました')
        }
        
        if (reservations && reservations.length > 0) {
          // 予約がある場合は削除を拒否
          showToast.warning(`この公演には${reservations.length}件の予約が紐付いているため削除できません`, '代わりに「中止」機能を使用してください。中止にすると、予約者に通知され、公演は非表示になります。')
          setIsDeleteDialogOpen(false)
          setDeletingEvent(null)
          return
        }
        
        // 予約がない場合のみ削除を実行
        await scheduleApi.delete(deletingEvent.id)
        setEvents(prev => prev.filter(event => event.id !== deletingEvent.id))
      }

      setIsDeleteDialogOpen(false)
      setDeletingEvent(null)
    } catch (error) {
      logger.error('公演削除エラー:', error)
      
      // エラーメッセージを詳細化
      const errorMessage = error instanceof Error ? error.message : '公演の削除に失敗しました'
      showToast.error(errorMessage)
      
      setIsDeleteDialogOpen(false)
      setDeletingEvent(null)
    }
  }, [deletingEvent, setEvents])

  // 中止確認ダイアログを開く
  const handleCancelConfirmPerformance = useCallback((event: ScheduleEvent) => {
    setCancellingEvent(event)
    setIsCancelDialogOpen(true)
  }, [])

  // 中止を実行
  const handleConfirmCancel = useCallback(async () => {
    if (!cancellingEvent) return

    try {
      if (cancellingEvent.is_private_request && cancellingEvent.reservation_id) {
        // 予約情報を取得
        const { data: reservation, error: fetchError } = await supabase
          .from('reservations')
          .select('*, customers(*)')
          .eq('id', cancellingEvent.reservation_id)
          .single()

        if (fetchError) throw fetchError

        const { error } = await supabase
          .from('reservations')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', cancellingEvent.reservation_id)
        
        if (error) throw error
        
        setEvents(prev => prev.map(e => 
          e.reservation_id === cancellingEvent.reservation_id ? { ...e, is_cancelled: true } : e
        ))

        // キャンセル確認メールを送信（貸切予約）
        if (reservation && reservation.customers) {
          try {
            await supabase.functions.invoke('send-cancellation-confirmation', {
              body: {
                reservationId: reservation.id,
                customerEmail: reservation.customers.email,
                customerName: reservation.customers.name,
                scenarioTitle: reservation.scenario_title || cancellingEvent.scenario,
                eventDate: cancellingEvent.date,
                startTime: cancellingEvent.start_time,
                endTime: cancellingEvent.end_time,
                storeName: cancellingEvent.venue,
                participantCount: reservation.participant_count,
                totalPrice: reservation.total_price || 0,
                reservationNumber: reservation.reservation_number,
                cancelledBy: 'store',
                cancellationReason: '誠に申し訳ございませんが、やむを得ない事情により公演を中止させていただくこととなりました。'
              }
            })
            logger.log('キャンセル確認メール送信成功')
          } catch (emailError) {
            logger.error('キャンセル確認メール送信エラー:', emailError)
            // メール送信失敗してもキャンセル処理は続行
          }
        }
      } else {
        // 通常公演の中止処理
        await scheduleApi.toggleCancel(cancellingEvent.id, true)
        setEvents(prev => prev.map(e => 
          e.id === cancellingEvent.id ? { ...e, is_cancelled: true } : e
        ))

        // 通常公演の場合、予約者全員にメール送信
        try {
          const { data: reservations, error: resError } = await supabase
            .from('reservations')
            .select('*, customers(*)')
            .eq('schedule_event_id', cancellingEvent.id)
            .in('status', ['confirmed', 'pending'])

          if (resError) throw resError

          if (reservations && reservations.length > 0) {
            const emailPromises = reservations.map(reservation => {
              if (!reservation.customers) return Promise.resolve()
              
              return supabase.functions.invoke('send-cancellation-confirmation', {
                body: {
                  reservationId: reservation.id,
                  customerEmail: reservation.customers.email,
                  customerName: reservation.customers.name,
                  scenarioTitle: reservation.scenario_title || cancellingEvent.scenario,
                  eventDate: cancellingEvent.date,
                  startTime: cancellingEvent.start_time,
                  endTime: cancellingEvent.end_time,
                  storeName: cancellingEvent.venue,
                  participantCount: reservation.participant_count,
                  totalPrice: reservation.total_price || 0,
                  reservationNumber: reservation.reservation_number,
                  cancelledBy: 'store',
                  cancellationReason: '誠に申し訳ございませんが、やむを得ない事情により公演を中止させていただくこととなりました。'
                }
              })
            })
            
            await Promise.all(emailPromises)
            logger.log(`${reservations.length}件のキャンセル確認メール送信成功`)
          }
        } catch (emailError) {
          logger.error('キャンセル確認メール送信エラー:', emailError)
          // メール送信失敗してもキャンセル処理は続行
        }
      }

      setIsCancelDialogOpen(false)
      setCancellingEvent(null)
    } catch (error) {
      logger.error('公演中止エラー:', error)
      showToast.error('公演の中止処理に失敗しました')
    }
  }, [cancellingEvent, setEvents])

  // 公演をキャンセル解除
  const handleUncancelPerformance = useCallback(async (event: ScheduleEvent) => {
    try {
      if (event.is_private_request && event.reservation_id) {
        const { error } = await supabase
          .from('reservations')
          .update({
            status: 'gm_confirmed',
            updated_at: new Date().toISOString()
          })
          .eq('id', event.reservation_id)
        
        if (error) throw error
        
        setEvents(prev => prev.map(e => 
          e.reservation_id === event.reservation_id ? { ...e, is_cancelled: false } : e
        ))
      } else {
        await scheduleApi.toggleCancel(event.id, false)
        setEvents(prev => prev.map(e => 
          e.id === event.id ? { ...e, is_cancelled: false } : e
        ))
      }
    } catch (error) {
      logger.error('公演キャンセル解除エラー:', error)
      showToast.error('公演のキャンセル解除処理に失敗しました')
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
          await supabase
            .from('reservations')
            .delete()
            .eq('id', conflictEvent.reservation_id)
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
      console.log('✅ スロットメモ保存成功:', event.date, storeId, timeSlotKey, memoText.substring(0, 50))
      
      // 公演を削除
      await scheduleApi.delete(event.id)
      showToast.success('公演をメモに変換しました')
      
      // スケジュールを再読み込み
      await fetchSchedule()
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
    handleCancelConfirmPerformance,
    handleConfirmCancel,
    handleUncancelPerformance,
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


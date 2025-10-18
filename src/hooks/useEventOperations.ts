// 公演の追加・編集・削除・中止・復活などの操作を管理

import { useState, useCallback } from 'react'
import { scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { getTimeSlot, TIME_SLOT_DEFAULTS } from '@/utils/scheduleUtils'
import type { ScheduleEvent } from '@/types/schedule'

interface Store {
  id: string
  name: string
  short_name: string
}

interface Scenario {
  id: string
  title: string
}

interface UseEventOperationsProps {
  events: ScheduleEvent[]
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  stores: Store[]
  scenarios: Scenario[]
}

export function useEventOperations({
  events,
  setEvents,
  stores,
  scenarios
}: UseEventOperationsProps) {
  // モーダル状態
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [modalInitialData, setModalInitialData] = useState<{
    date: string
    venue: string
    timeSlot: string
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
  const handleAddPerformance = useCallback((date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    setModalMode('add')
    setModalInitialData({ date, venue, timeSlot })
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
  const handleCloseModal = useCallback(() => {
    setIsPerformanceModalOpen(false)
    setModalInitialData(undefined)
    setEditingEvent(null)
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

  // 公演を移動
  const handleMoveEvent = useCallback(async () => {
    if (!draggedEvent || !dropTarget) return

    try {
      // 移動先の時間を計算
      const defaults = TIME_SLOT_DEFAULTS[dropTarget.timeSlot as 'morning' | 'afternoon' | 'evening']

      // 元の公演を削除
      await scheduleApi.delete(draggedEvent.id)

      // 新しい位置に公演を作成
      const newEventData: any = {
        date: dropTarget.date,
        store_id: dropTarget.venue,
        venue: stores.find(s => s.id === dropTarget.venue)?.name || '',
        scenario: draggedEvent.scenario,
        category: draggedEvent.category,
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        capacity: draggedEvent.max_participants,
        gms: draggedEvent.gms,
        notes: draggedEvent.notes
      }

      const savedEvent = await scheduleApi.create(newEventData)

      // ローカル状態を更新
      setEvents(prev => {
        const filtered = prev.filter(e => e.id !== draggedEvent.id)
        return [...filtered, { ...savedEvent, venue: dropTarget.venue }]
      })

      setDraggedEvent(null)
      setDropTarget(null)
    } catch (error) {
      logger.error('公演移動エラー:', error)
      alert('公演の移動に失敗しました')
    }
  }, [draggedEvent, dropTarget, stores, setEvents])

  // 公演を複製
  const handleCopyEvent = useCallback(async () => {
    if (!draggedEvent || !dropTarget) return

    try {
      // 移動先の時間を計算
      const defaults = TIME_SLOT_DEFAULTS[dropTarget.timeSlot as 'morning' | 'afternoon' | 'evening']

      // 新しい位置に公演を作成（元の公演は残す）
      const newEventData: any = {
        date: dropTarget.date,
        store_id: dropTarget.venue,
        venue: stores.find(s => s.id === dropTarget.venue)?.name || '',
        scenario: draggedEvent.scenario,
        category: draggedEvent.category,
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        capacity: draggedEvent.max_participants,
        gms: draggedEvent.gms,
        notes: draggedEvent.notes
      }

      const savedEvent = await scheduleApi.create(newEventData)

      // ローカル状態を更新（元の公演は残す）
      setEvents(prev => [...prev, { ...savedEvent, venue: dropTarget.venue }])

      setDraggedEvent(null)
      setDropTarget(null)
    } catch (error) {
      logger.error('公演複製エラー:', error)
      alert('公演の複製に失敗しました')
    }
  }, [draggedEvent, dropTarget, stores, setEvents])

  // 🚨 CRITICAL: 公演保存時の重複チェック機能
  const handleSavePerformance = useCallback(async (performanceData: any) => {
    // タイムスロットを判定
    const startHour = parseInt(performanceData.start_time.split(':')[0])
    let timeSlot: 'morning' | 'afternoon' | 'evening'
    if (startHour < 12) {
      timeSlot = 'morning'
    } else if (startHour < 17) {
      timeSlot = 'afternoon'
    } else {
      timeSlot = 'evening'
    }
    
    // 重複チェック：同じ日時・店舗・時間帯に既に公演があるか
    const conflictingEvents = events.filter(event => {
      // 編集中の公演自身は除外
      if (modalMode === 'edit' && event.id === performanceData.id) {
        return false
      }
      
      const eventTimeSlot = getTimeSlot(event.start_time)
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
  const doSavePerformance = useCallback(async (performanceData: any) => {
    try {
      if (modalMode === 'add') {
        // 新規追加
        const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
        
        // 店舗IDを取得
        const { data: storeData, error: storeError } = await supabase
          .from('stores')
          .select('id')
          .eq('name', storeName)
          .single()
        
        if (storeError || !storeData) {
          throw new Error(`店舗「${storeName}」が見つかりません。先に店舗管理で店舗を追加してください。`)
        }
        
        // シナリオIDを取得
        let scenarioId = null
        if (performanceData.scenario) {
          const matchingScenario = scenarios.find(s => s.title === performanceData.scenario)
          scenarioId = matchingScenario?.id || null
        }
        
        // Supabaseに保存するデータ形式に変換
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
          notes: performanceData.notes || null
        }
        
        // Supabaseに保存
        const savedEvent = await scheduleApi.create(eventData)
        
        // 内部形式に変換して状態に追加
        const formattedEvent: ScheduleEvent = {
          id: savedEvent.id,
          date: savedEvent.date,
          venue: savedEvent.store_id,
          scenario: savedEvent.scenario || '',
          gms: savedEvent.gms || [],
          start_time: savedEvent.start_time,
          end_time: savedEvent.end_time,
          category: savedEvent.category,
          is_cancelled: savedEvent.is_cancelled || false,
          participant_count: savedEvent.current_participants || 0,
          max_participants: savedEvent.capacity || 8,
          notes: savedEvent.notes || ''
        }
        
        setEvents(prev => [...prev, formattedEvent])
      } else {
        // 編集更新
        
        // 貸切リクエストの場合は reservations テーブルを更新
        if (performanceData.is_private_request && performanceData.reservation_id) {
          const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
          const { data: storeData } = await supabase
            .from('stores')
            .select('id')
            .eq('name', storeName)
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
          await scheduleApi.update(performanceData.id, {
            scenario: performanceData.scenario,
            scenario_id: scenarioId,
            category: performanceData.category,
            start_time: performanceData.start_time,
            end_time: performanceData.end_time,
            capacity: performanceData.max_participants,
            gms: performanceData.gms,
            notes: performanceData.notes
          })

          // ローカル状態を更新
          setEvents(prev => prev.map(event => 
            event.id === performanceData.id ? performanceData : event
          ))
        }
      }

      handleCloseModal()
    } catch (error) {
      logger.error('公演保存エラー:', error)
      alert(modalMode === 'add' ? '公演の追加に失敗しました' : '公演の更新に失敗しました')
    }
  }, [modalMode, stores, scenarios, setEvents, handleCloseModal])

  // 削除確認ダイアログを開く
  const handleDeletePerformance = useCallback((event: ScheduleEvent) => {
    setDeletingEvent(event)
    setIsDeleteDialogOpen(true)
  }, [])

  // 公演を削除
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingEvent) return

    try {
      const isPrivateBooking = deletingEvent.is_private_request || deletingEvent.id.startsWith('private-')
      
      if (isPrivateBooking) {
        const reservationId = deletingEvent.reservation_id || deletingEvent.id.split('-').slice(1, 6).join('-')
        
        const { error } = await supabase
          .from('reservations')
          .delete()
          .eq('id', reservationId)
        
        if (error) throw error
        
        setEvents(prev => prev.filter(event => {
          const eventReservationId = event.reservation_id || (event.id.startsWith('private-') ? event.id.split('-').slice(1, 6).join('-') : null)
          return eventReservationId !== reservationId
        }))
      } else {
        await scheduleApi.delete(deletingEvent.id)
        setEvents(prev => prev.filter(event => event.id !== deletingEvent.id))
      }

      setIsDeleteDialogOpen(false)
      setDeletingEvent(null)
    } catch (error) {
      logger.error('公演削除エラー:', error)
      alert('公演の削除に失敗しました')
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
      } else {
        await scheduleApi.toggleCancel(cancellingEvent.id, true)
        setEvents(prev => prev.map(e => 
          e.id === cancellingEvent.id ? { ...e, is_cancelled: true } : e
        ))
      }

      setIsCancelDialogOpen(false)
      setCancellingEvent(null)
    } catch (error) {
      logger.error('公演中止エラー:', error)
      alert('公演の中止処理に失敗しました')
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
      alert('公演のキャンセル解除処理に失敗しました')
    }
  }, [setEvents])

  // 予約サイト公開/非公開トグル
  const handleToggleReservation = useCallback((event: ScheduleEvent) => {
    if (event.is_private_request) {
      alert('貸切公演の公開状態は変更できません')
      return
    }
    setPublishingEvent(event)
    setIsPublishDialogOpen(true)
  }, [])
  
  const handleConfirmPublishToggle = useCallback(async () => {
    if (!publishingEvent) return
    
    if (publishingEvent.is_private_request || publishingEvent.id.startsWith('private-')) {
      alert('貸切公演の公開状態は変更できません')
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
      alert('予約サイト公開状態の更新に失敗しました')
    }
  }, [publishingEvent, setEvents])

  // 重複警告からの続行処理
  const handleConflictContinue = useCallback(async () => {
    if (!pendingPerformanceData || !conflictInfo) return
    
    try {
      // タイムスロットを判定
      const startHour = parseInt(pendingPerformanceData.start_time.split(':')[0])
      let timeSlot: 'morning' | 'afternoon' | 'evening'
      if (startHour < 12) {
        timeSlot = 'morning'
      } else if (startHour < 18) {
        timeSlot = 'afternoon'
      } else {
        timeSlot = 'evening'
      }
      
      // 既存の重複公演を削除
      const conflictingEvents = events.filter(event => {
        if (modalMode === 'edit' && event.id === pendingPerformanceData.id) {
          return false
        }
        
        const eventTimeSlot = getTimeSlot(event.start_time)
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
        const eventTimeSlot = getTimeSlot(event.start_time)
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
      alert('既存公演の削除に失敗しました')
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
    
    // ダイアログクローズ
    setIsDeleteDialogOpen,
    setIsCancelDialogOpen,
    setIsPublishDialogOpen,
    setIsConflictWarningOpen,
    setConflictInfo,
    setPendingPerformanceData
  }
}


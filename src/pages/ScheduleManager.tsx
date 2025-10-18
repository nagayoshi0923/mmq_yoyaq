// React
import { useState, useEffect, useMemo, useCallback } from 'react'

// Custom Hooks
import { useScheduleData } from '@/hooks/useScheduleData'
import { useShiftData } from '@/hooks/useShiftData'
import { useMemoManager } from '@/hooks/useMemoManager'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'

// UI Components
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Layout Components
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'

// Schedule Components
import { ConflictWarningModal } from '@/components/schedule/ConflictWarningModal'
import { ContextMenu, Copy, Clipboard } from '@/components/schedule/ContextMenu'
import { ImportScheduleModal } from '@/components/schedule/ImportScheduleModal'
import { MemoCell } from '@/components/schedule/MemoCell'
import { MoveOrCopyDialog } from '@/components/schedule/MoveOrCopyDialog'
import { PerformanceModal } from '@/components/schedule/PerformanceModal'
import { TimeSlotCell } from '@/components/schedule/TimeSlotCell'

// API
import { scheduleApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'

// Types
import type { Staff } from '@/types'
import type { ScheduleEvent } from '@/types/schedule'

// Utils
import { 
  generateMonthDays, 
  getTimeSlot, 
  getCategoryCounts, 
  TIME_SLOT_DEFAULTS,
  getReservationBadgeClass,
  CATEGORY_CONFIG
} from '@/utils/scheduleUtils'

// Icons
import { Ban, ChevronLeft, ChevronRight, Edit, RotateCcw, Trash2 } from 'lucide-react'

// 型を再エクスポート（他のコンポーネントで使用できるように）
export type { ScheduleEvent }



export function ScheduleManager() {
  // 現在の日付状態
  const [currentDate, setCurrentDate] = useState(() => {
    try {
      const saved = localStorage.getItem('scheduleCurrentDate')
      if (saved) {
        return new Date(saved)
      }
    } catch {
      // エラー時は現在の日付を使用
    }
    return new Date()
  })

  // currentDateの変更をlocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem('scheduleCurrentDate', currentDate.toISOString())
    } catch (error) {
      console.error('Failed to save current date:', error)
    }
  }, [currentDate])

  // カスタムフックでデータ管理（既存のstateと並行して使用）
  const scheduleData = useScheduleData(currentDate)
  const shiftDataHook = useShiftData(currentDate, scheduleData.staff, scheduleData.staffLoading)
  const memoManager = useMemoManager(currentDate, scheduleData.stores)
  const scrollRestoration = useScrollRestoration(scheduleData.isLoading)

  // フックから取得したデータを展開
  const {
    events,
    setEvents,
    stores,
    scenarios,
    staff,
    isLoading,
    error,
    storesLoading,
    scenariosLoading,
    staffLoading,
    hasEverLoadedStores,
    refetchScenarios,
    refetchStaff
  } = scheduleData

  const { shiftData } = shiftDataHook
  const { handleSaveMemo, getMemo } = memoManager
  const { clearScrollPosition } = scrollRestoration

  // UI状態管理
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isMoveOrCopyDialogOpen, setIsMoveOrCopyDialogOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [modalInitialData, setModalInitialData] = useState<{
    date: string
    venue: string
    timeSlot: string
  } | undefined>(undefined)
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deletingEvent, setDeletingEvent] = useState<ScheduleEvent | null>(null)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [cancellingEvent, setCancellingEvent] = useState<ScheduleEvent | null>(null)
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false)
  const [publishingEvent, setPublishingEvent] = useState<ScheduleEvent | null>(null)
  const [isConflictWarningOpen, setIsConflictWarningOpen] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<any>(null)
  const [pendingPerformanceData, setPendingPerformanceData] = useState<any>(null)
  const [draggedEvent, setDraggedEvent] = useState<ScheduleEvent | null>(null)
  const [dropTarget, setDropTarget] = useState<{ date: string, venue: string, timeSlot: string } | null>(null)
  const [clipboardEvent, setClipboardEvent] = useState<ScheduleEvent | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: 'event' | 'cell'
    event?: ScheduleEvent
    cellInfo?: { date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening' }
  } | null>(null)
  const [availableStaffByScenario, setAvailableStaffByScenario] = useState<Record<string, Staff[]>>({})

  // ハッシュ変更でページ切り替え
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash && hash !== 'schedule') {
        window.location.href = '/#' + hash
      } else if (!hash) {
        window.location.href = '/'
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // シナリオごとの出勤可能GMを計算
  useEffect(() => {
    const calculateAvailableGMs = () => {
      if (!isPerformanceModalOpen || !scenarios.length) return
      
      // 日付とタイムスロットの取得
      let date: string
      let timeSlot: string
      
      if (modalInitialData) {
        date = modalInitialData.date
        timeSlot = modalInitialData.timeSlot
      } else if (editingEvent) {
        date = editingEvent.date
        // 開始時刻からタイムスロットを判定
        const startHour = parseInt(editingEvent.start_time.split(':')[0])
        if (startHour < 12) {
          timeSlot = 'morning'
        } else if (startHour < 17) {
          timeSlot = 'afternoon'
        } else {
          timeSlot = 'evening'
        }
      } else {
        return
      }
      
      const key = `${date}-${timeSlot}`
      const availableStaff = shiftData[key] || []
      
      // シナリオごとに、そのシナリオを担当できるGMをフィルタリング
      const staffByScenario: Record<string, Staff[]> = {}
      
      for (const scenario of scenarios) {
        const gmList = availableStaff.filter(staffMember => {
          // 担当シナリオに含まれているかチェック
          const specialScenarios = staffMember.special_scenarios || []
          const hasScenarioById = specialScenarios.includes(scenario.id)
          const hasScenarioByTitle = specialScenarios.includes(scenario.title)
          return hasScenarioById || hasScenarioByTitle
        })
        staffByScenario[scenario.title] = gmList
      }
      
      setAvailableStaffByScenario(staffByScenario)
    }
    
    calculateAvailableGMs()
  }, [isPerformanceModalOpen, modalInitialData, editingEvent, shiftData, scenarios])

  // 公演カテゴリの色設定（不変なので定数を使用）
  const categoryConfig = CATEGORY_CONFIG




  // 月の変更
  const changeMonth = useCallback((direction: 'prev' | 'next') => {
    // 月切り替え時はスクロール位置をクリア（一番上に戻る）
    clearScrollPosition()
    
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }, [clearScrollPosition])

  // 月間の日付リストを生成
  const monthDays = useMemo(() => generateMonthDays(currentDate), [currentDate])


  // カテゴリごとの公演数を計算
  const categoryCounts = useMemo(() => getCategoryCounts(events), [events])

  // 特定の日付・店舗・時間帯の公演を取得
  const getEventsForSlot = (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    return events.filter(event => {
      // 日付とタイムスロットが一致するかチェック
      const dateMatch = event.date === date
      const detectedTimeSlot = getTimeSlot(event.start_time)
      const timeSlotMatch = detectedTimeSlot === timeSlot
      const categoryMatch = selectedCategory === 'all' || event.category === selectedCategory
      
      // 貸切リクエストの場合
      if (event.is_private_request) {
        // 店舗が確定している場合（venue が空でない）は、その店舗のセルにのみ表示
        if (event.venue) {
          const match = dateMatch && event.venue === venue && timeSlotMatch && categoryMatch
          return match
        }
        // 店舗が未確定の場合（venue が空）は、全ての店舗に表示
        return dateMatch && timeSlotMatch && categoryMatch
      }
      
      // 通常公演は厳密に店舗が一致する場合のみ
      const venueMatch = event.venue === venue
      
      return dateMatch && venueMatch && timeSlotMatch && categoryMatch
    })
  }



  // 公演追加モーダルを開く
  const handleAddPerformance = (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    setModalMode('add')
    setModalInitialData({ date, venue, timeSlot })
    setEditingEvent(null)
    setIsPerformanceModalOpen(true)
  }

  // 編集モーダルを開く
  const handleEditPerformance = (event: ScheduleEvent) => {
    setModalMode('edit')
    setEditingEvent(event)
    setModalInitialData(undefined)
    setIsPerformanceModalOpen(true)
  }

  // モーダルを閉じる
  const handleCloseModal = () => {
    setIsPerformanceModalOpen(false)
    setModalInitialData(undefined)
    setEditingEvent(null)
  }

  // ドラッグ&ドロップハンドラー
  const handleDrop = (droppedEvent: ScheduleEvent, targetDate: string, targetVenue: string, targetTimeSlot: 'morning' | 'afternoon' | 'evening') => {
    // 同じ場所へのドロップは無視
    const sourceTimeSlot = getTimeSlot(droppedEvent.start_time)
    if (droppedEvent.date === targetDate && droppedEvent.venue === targetVenue && sourceTimeSlot === targetTimeSlot) {
      return
    }

    // ドラッグされた公演と移動先情報を保存
    setDraggedEvent(droppedEvent)
    setDropTarget({ date: targetDate, venue: targetVenue, timeSlot: targetTimeSlot })
    setIsMoveOrCopyDialogOpen(true)
  }

  // 公演を移動
  const handleMoveEvent = async () => {
    if (!draggedEvent || !dropTarget) return

    try {
      // 移動先の時間を計算
      const defaults = TIME_SLOT_DEFAULTS[dropTarget.timeSlot]

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
      console.error('公演移動エラー:', error)
      alert('公演の移動に失敗しました')
    }
  }

  // 公演カードの右クリックメニューを表示
  const handleEventContextMenu = (event: ScheduleEvent, x: number, y: number) => {
    setContextMenu({ x, y, type: 'event', event })
  }

  // セルの右クリックメニューを表示
  const handleCellContextMenu = (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening', x: number, y: number) => {
    setContextMenu({ x, y, type: 'cell', cellInfo: { date, venue, timeSlot } })
  }

  // 公演をコピー（クリップボードに保存）
  const handleCopyToClipboard = (event: ScheduleEvent) => {
    setClipboardEvent(event)
    setContextMenu(null)
  }

  // クリップボードから公演をペースト
  const handlePasteFromClipboard = async (targetDate: string, targetVenue: string, targetTimeSlot: 'morning' | 'afternoon' | 'evening') => {
    if (!clipboardEvent) return

    setContextMenu(null)

    try {
      // 移動先の時間を計算
      const defaults = TIME_SLOT_DEFAULTS[targetTimeSlot]

      // 新しい位置に公演を作成（元の公演は残す）
      const newEventData: any = {
        date: targetDate,
        store_id: targetVenue,
        venue: stores.find(s => s.id === targetVenue)?.name || '',
        scenario: clipboardEvent.scenario,
        category: clipboardEvent.category,
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        capacity: clipboardEvent.max_participants,
        gms: clipboardEvent.gms,
        notes: clipboardEvent.notes
      }

      const savedEvent = await scheduleApi.create(newEventData)

      // ローカル状態を更新
      setEvents(prev => [...prev, { ...savedEvent, venue: targetVenue }])

      console.log('公演をペーストしました')
    } catch (error) {
      console.error('公演ペーストエラー:', error)
      alert('公演のペーストに失敗しました')
    }
  }

  // 公演を複製
  const handleCopyEvent = async () => {
    if (!draggedEvent || !dropTarget) return

    try {
      // 移動先の時間を計算
      const defaults = TIME_SLOT_DEFAULTS[dropTarget.timeSlot]

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
      console.error('公演複製エラー:', error)
      alert('公演の複製に失敗しました')
    }
  }

  // 🚨 CRITICAL: 公演保存時の重複チェック機能
  // この関数は同じ日付・店舗・時間帯の重複を防ぎます
  // ⚠️ 重複チェックを削除・スキップすると、同じ枠に複数の公演が登録されてしまいます
  const handleSavePerformance = async (performanceData: any) => {
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
  }

  // 実際の保存処理（重複チェックなし）
  const doSavePerformance = async (performanceData: any) => {
    try {
      if (modalMode === 'add') {
        // 新規追加
        console.log('新しい公演を保存:', performanceData)
        
        const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
        
        // 店舗IDを取得
        const { data: storeData, error: storeError } = await supabase
          .from('stores')
          .select('id')
          .eq('name', storeName)
          .single()
        
        if (storeError || !storeData) {
          console.error(`店舗データが見つかりません: ${storeName}`)
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
          scenario_id: scenarioId, // scenario_idを追加
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
          venue: savedEvent.store_id, // store_idを直接使用
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
          // 店舗IDを取得
          const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
          const { data: storeData } = await supabase
            .from('stores')
            .select('id')
            .eq('name', storeName)
            .single()
          
          const storeId = storeData?.id || performanceData.venue
          
          // reservations テーブルを更新（店舗とGMを変更）
          const { error: reservationError } = await supabase
            .from('reservations')
            .update({
              store_id: storeId,
              updated_at: new Date().toISOString()
            })
            .eq('id', performanceData.reservation_id)
          
          if (reservationError) {
            console.error('貸切リクエスト更新エラー:', reservationError)
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
            scenario_id: scenarioId, // scenario_idも更新
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
      console.error('公演保存エラー:', error)
      alert(modalMode === 'add' ? '公演の追加に失敗しました' : '公演の更新に失敗しました')
    }
  }

  // 削除確認ダイアログを開く
  const handleDeletePerformance = (event: ScheduleEvent) => {
    setDeletingEvent(event)
    setIsDeleteDialogOpen(true)
  }

  // 中止確認ダイアログを開く
  const handleCancelConfirmPerformance = (event: ScheduleEvent) => {
    setCancellingEvent(event)
    setIsCancelDialogOpen(true)
  }

  // 公演を削除
  const handleConfirmDelete = async () => {
    if (!deletingEvent) return

    try {
      // 貸切リクエストの場合は reservations テーブルから削除
      // IDが "private-" で始まる場合も貸切として扱う
      const isPrivateBooking = deletingEvent.is_private_request || deletingEvent.id.startsWith('private-')
      
      if (isPrivateBooking) {
        // reservation_idを抽出（"private-{uuid}-{order}"から{uuid}部分を取得）
        const reservationId = deletingEvent.reservation_id || deletingEvent.id.split('-').slice(1, 6).join('-')
        
        const { error } = await supabase
          .from('reservations')
          .delete()
          .eq('id', reservationId)
        
        if (error) throw error
        
        // この貸切リクエストの全ての候補日を削除
        setEvents(prev => prev.filter(event => {
          const eventReservationId = event.reservation_id || (event.id.startsWith('private-') ? event.id.split('-').slice(1, 6).join('-') : null)
          return eventReservationId !== reservationId
        }))
      } else {
        // 通常公演の場合は schedule_events から削除
        await scheduleApi.delete(deletingEvent.id)
        
        // ローカル状態から削除
        setEvents(prev => prev.filter(event => event.id !== deletingEvent.id))
      }

      setIsDeleteDialogOpen(false)
      setDeletingEvent(null)
    } catch (error) {
      console.error('公演削除エラー:', error)
      alert('公演の削除に失敗しました')
    }
  }

  // 中止を実行
  const handleConfirmCancel = async () => {
    if (!cancellingEvent) return

    try {
      // 貸切リクエストの場合は reservations テーブルを更新
      if (cancellingEvent.is_private_request && cancellingEvent.reservation_id) {
        const { error } = await supabase
          .from('reservations')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', cancellingEvent.reservation_id)
        
        if (error) throw error
        
        // この貸切リクエストの全ての候補日を中止状態に
        setEvents(prev => prev.map(e => 
          e.reservation_id === cancellingEvent.reservation_id ? { ...e, is_cancelled: true } : e
        ))
      } else {
        // 通常公演の場合は schedule_events を更新
        await scheduleApi.toggleCancel(cancellingEvent.id, true)

        // ローカル状態を更新
        setEvents(prev => prev.map(e => 
          e.id === cancellingEvent.id ? { ...e, is_cancelled: true } : e
        ))
      }

      setIsCancelDialogOpen(false)
      setCancellingEvent(null)
    } catch (error) {
      console.error('公演中止エラー:', error)
      alert('公演の中止処理に失敗しました')
    }
  }

  // 公演をキャンセル解除
  const handleCancelPerformance = async (event: ScheduleEvent) => {
    try {
      // 貸切リクエストの場合は reservations テーブルを更新
      if (event.is_private_request && event.reservation_id) {
        const { error } = await supabase
          .from('reservations')
          .update({
            status: 'gm_confirmed', // 元のステータスに戻す
            updated_at: new Date().toISOString()
          })
          .eq('id', event.reservation_id)
        
        if (error) throw error
        
        // この貸切リクエストの全ての候補日を復活
        setEvents(prev => prev.map(e => 
          e.reservation_id === event.reservation_id ? { ...e, is_cancelled: false } : e
        ))
      } else {
        // 通常公演の場合は schedule_events を更新
        await scheduleApi.toggleCancel(event.id, false)

        // ローカル状態を更新
        setEvents(prev => prev.map(e => 
          e.id === event.id ? { ...e, is_cancelled: false } : e
        ))
      }
    } catch (error) {
      console.error('公演キャンセル解除エラー:', error)
      alert('公演のキャンセル解除処理に失敗しました')
    }
  }

  // 公演のキャンセルを解除
  const handleUncancelPerformance = async (event: ScheduleEvent) => {
    handleCancelPerformance(event) // キャンセル解除処理
  }

  // 予約サイト公開/非公開トグル
  const handleToggleReservation = (event: ScheduleEvent) => {
    // 貸切公演の場合は操作不可
    if (event.is_private_request) {
      alert('貸切公演の公開状態は変更できません')
      return
    }
    setPublishingEvent(event)
    setIsPublishDialogOpen(true)
  }
  
  const handleConfirmPublishToggle = async () => {
    if (!publishingEvent) return
    
    // 貸切公演の場合は操作不可（念のためダブルチェック）
    // IDが "private-" で始まる場合も貸切公演とみなす
    if (publishingEvent.is_private_request || publishingEvent.id.startsWith('private-')) {
      alert('貸切公演の公開状態は変更できません')
      setIsPublishDialogOpen(false)
      setPublishingEvent(null)
      return
    }
    
    try {
      const newStatus = !publishingEvent.is_reservation_enabled
      
      // Supabaseで更新
      await scheduleApi.update(publishingEvent.id, {
        is_reservation_enabled: newStatus
      })

      // ローカル状態を更新
      setEvents(prev => prev.map(e => 
        e.id === publishingEvent.id ? { ...e, is_reservation_enabled: newStatus } : e
      ))
      
      setIsPublishDialogOpen(false)
      setPublishingEvent(null)
    } catch (error) {
      console.error('予約サイト公開状態の更新エラー:', error)
      alert('予約サイト公開状態の更新に失敗しました')
    }
  }


  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="schedule" />
      
      <div className="container mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}
          
          {/* 初回ローディング表示（一度もロードされていない場合のみ） */}
          {!hasEverLoadedStores && stores.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <div className="text-muted-foreground">データを読み込み中...</div>
              </div>
            </div>
          )}
          
          {/* ヘッダー部分とカテゴリタブ（一度でもロードされたら常に表示） */}
          {(stores.length > 0 || hasEverLoadedStores) && (
          <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">月間スケジュール管理</h2>
              {/* 更新中のインジケーター */}
              {isLoading && stores.length > 0 && (
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                  <span>更新中...</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {/* 月選択コントロール */}
              <div className="flex items-center gap-2 border rounded-lg p-1">
                <Button variant="ghost" size="sm" onClick={() => changeMonth('prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={currentDate.getMonth().toString()} onValueChange={(value) => {
                  // 月切り替え時はスクロール位置をクリア
                  clearScrollPosition()
                  const newDate = new Date(currentDate)
                  newDate.setMonth(parseInt(value))
                  setCurrentDate(newDate)
                }}>
                  <SelectTrigger className="w-32 border-0 focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {new Date(2025, i).toLocaleDateString('ja-JP', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => changeMonth('next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              {/* インポートボタン */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsImportModalOpen(true)}
              >
                インポート
              </Button>
            </div>
          </div>

          {/* カテゴリタブ */}
          <div className="bg-card border rounded-lg p-4">
            <h3 className="flex items-center gap-2">
              公演カテゴリ
              <span className="text-sm text-muted-foreground">
                （中止: {categoryCounts.cancelled}件 / 警告: {categoryCounts.alerts}件）
              </span>
            </h3>
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mt-4">
              <TabsList className="grid grid-cols-6 w-fit gap-1">
                <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  すべて ({categoryCounts.all})
                </TabsTrigger>
                <TabsTrigger value="open" className="bg-blue-100 text-blue-800 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900">
                  オープン公演 ({categoryCounts.open})
                </TabsTrigger>
                <TabsTrigger value="private" className="bg-purple-100 text-purple-800 data-[state=active]:bg-purple-200 data-[state=active]:text-purple-900">
                  貸切公演 ({categoryCounts.private})
                </TabsTrigger>
                <TabsTrigger value="gmtest" className="bg-orange-100 text-orange-800 data-[state=active]:bg-orange-200 data-[state=active]:text-orange-900">
                  GMテスト ({categoryCounts.gmtest})
                </TabsTrigger>
                <TabsTrigger value="testplay" className="bg-yellow-100 text-yellow-800 data-[state=active]:bg-yellow-200 data-[state=active]:text-yellow-900">
                  テストプレイ ({categoryCounts.testplay})
                </TabsTrigger>
                <TabsTrigger value="trip" className="bg-green-100 text-green-800 data-[state=active]:bg-green-200 data-[state=active]:text-green-900">
                  出張公演 ({categoryCounts.trip})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* メインカード・テーブル */}
          <Card>
            <CardHeader className="bg-muted/30 border-b border-border">
              <CardTitle>リストカレンダー - {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月</CardTitle>
              <CardDescription className="text-muted-foreground">
                ※公演のタイトルが未決定の場合、当該公演は薄い色で警告表示されます<br/>
                ※シナリオやGMが未定の場合は赤い色で警告表示されます
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="table-fixed w-full">
                <colgroup>
                  <col className="w-24" />
                  <col className="w-16" />
                  <col className="w-24" />
                  <col style={{ width: '300px' }} />
                  <col style={{ width: '300px' }} />
                  <col style={{ width: '300px' }} />
                  <col className="w-32" />
                </colgroup>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="border-r">日付</TableHead>
                    <TableHead className="border-r">曜日</TableHead>
                    <TableHead className="border-r">会場</TableHead>
                    <TableHead className="border-r">午前 (~12:00)</TableHead>
                    <TableHead className="border-r">午後 (12:00-17:00)</TableHead>
                    <TableHead className="border-r">夜間 (17:00~)</TableHead>
                    <TableHead>メモ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthDays.map(day => {
                    return stores.map((store, storeIndex) => (
                      <TableRow key={`${day.date}-${store.id}`} className="h-16">
                        {/* 日付セル */}
                        {storeIndex === 0 ? (
                          <TableCell className="schedule-table-cell border-r text-sm" rowSpan={stores.length}>
                            {day.displayDate}
                          </TableCell>
                        ) : null}
                        
                        {/* 曜日セル */}
                        {storeIndex === 0 ? (
                          <TableCell className={`schedule-table-cell border-r text-sm ${day.dayOfWeek === '日' ? 'text-red-600' : day.dayOfWeek === '土' ? 'text-blue-600' : ''}`} rowSpan={stores.length}>
                            {day.dayOfWeek}
                          </TableCell>
                        ) : null}
                        
                        {/* 店舗セル */}
                        <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-sm">
                          {store.short_name}
                        </TableCell>
                        
                        {/* 午前セル */}
                        <TimeSlotCell
                          events={getEventsForSlot(day.date, store.id, 'morning')}
                          date={day.date}
                          venue={store.id}
                          timeSlot="morning"
                          availableStaff={shiftData[`${day.date}-morning`] || []}
                          categoryConfig={categoryConfig}
                          getReservationBadgeClass={getReservationBadgeClass}
                          onCancelConfirm={handleCancelConfirmPerformance}
                          onUncancel={handleUncancelPerformance}
                          onEdit={handleEditPerformance}
                          onDelete={handleDeletePerformance}
                          onAddPerformance={handleAddPerformance}
                          onToggleReservation={handleToggleReservation}
                          onDrop={handleDrop}
                          onContextMenuCell={handleCellContextMenu}
                          onContextMenuEvent={handleEventContextMenu}
                        />
                        
                        {/* 午後セル */}
                        <TimeSlotCell
                          events={getEventsForSlot(day.date, store.id, 'afternoon')}
                          date={day.date}
                          venue={store.id}
                          timeSlot="afternoon"
                          availableStaff={shiftData[`${day.date}-afternoon`] || []}
                          categoryConfig={categoryConfig}
                          getReservationBadgeClass={getReservationBadgeClass}
                          onCancelConfirm={handleCancelConfirmPerformance}
                          onUncancel={handleUncancelPerformance}
                          onEdit={handleEditPerformance}
                          onDelete={handleDeletePerformance}
                          onAddPerformance={handleAddPerformance}
                          onDrop={handleDrop}
                          onToggleReservation={handleToggleReservation}
                          onContextMenuCell={handleCellContextMenu}
                          onContextMenuEvent={handleEventContextMenu}
                        />
                        
                        {/* 夜間セル */}
                        <TimeSlotCell
                          events={getEventsForSlot(day.date, store.id, 'evening')}
                          date={day.date}
                          venue={store.id}
                          timeSlot="evening"
                          availableStaff={shiftData[`${day.date}-evening`] || []}
                          categoryConfig={categoryConfig}
                          getReservationBadgeClass={getReservationBadgeClass}
                          onCancelConfirm={handleCancelConfirmPerformance}
                          onUncancel={handleUncancelPerformance}
                          onEdit={handleEditPerformance}
                          onToggleReservation={handleToggleReservation}
                          onDelete={handleDeletePerformance}
                          onAddPerformance={handleAddPerformance}
                          onDrop={handleDrop}
                          onContextMenuCell={handleCellContextMenu}
                          onContextMenuEvent={handleEventContextMenu}
                        />
                        
                        {/* メモセル */}
                        <MemoCell
                          date={day.date}
                          venue={store.id}
                          initialMemo={getMemo(day.date, store.id)}
                          onSave={handleSaveMemo}
                        />
                      </TableRow>
                    ))
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </>
          )}
        </div>
      </div>

          {/* 公演モーダル（追加・編集共通） */}
          <PerformanceModal
            isOpen={isPerformanceModalOpen}
            onClose={handleCloseModal}
            onSave={handleSavePerformance}
            mode={modalMode}
            event={editingEvent}
            initialData={modalInitialData}
            stores={stores}
            scenarios={scenarios}
            staff={staff}
            availableStaffByScenario={availableStaffByScenario}
            onScenariosUpdate={refetchScenarios}
            onStaffUpdate={refetchStaff}
          />

          {/* 削除確認ダイアログ */}
          {isDeleteDialogOpen && deletingEvent && (
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>公演を削除</DialogTitle>
                  <DialogDescription>
                    この公演を削除してもよろしいですか？この操作は取り消せません。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <p><strong>日付:</strong> {deletingEvent.date}</p>
                  <p><strong>時間:</strong> {deletingEvent.start_time.slice(0, 5)} - {deletingEvent.end_time.slice(0, 5)}</p>
                  <p><strong>シナリオ:</strong> {deletingEvent.scenario || '未定'}</p>
                  <p><strong>GM:</strong> {deletingEvent.gms.join(', ') || '未定'}</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button variant="destructive" onClick={handleConfirmDelete}>
                    削除
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* 中止確認ダイアログ */}
          {isCancelDialogOpen && cancellingEvent && (
            <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>公演を中止</DialogTitle>
                  <DialogDescription>
                    この公演を中止してもよろしいですか？中止後も復活させることができます。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <p><strong>日付:</strong> {cancellingEvent.date}</p>
                  <p><strong>時間:</strong> {cancellingEvent.start_time.slice(0, 5)} - {cancellingEvent.end_time.slice(0, 5)}</p>
                  <p><strong>シナリオ:</strong> {cancellingEvent.scenario || '未定'}</p>
                  <p><strong>GM:</strong> {cancellingEvent.gms.join(', ') || '未定'}</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button variant="destructive" onClick={handleConfirmCancel}>
                    中止
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          
          {/* 予約サイト公開/非公開確認ダイアログ */}
          {publishingEvent && (
            <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {publishingEvent.is_reservation_enabled ? '予約サイトから非公開にする' : '予約サイトに公開する'}
                  </DialogTitle>
                  <DialogDescription>
                    {publishingEvent.is_reservation_enabled 
                      ? 'この公演を予約サイトから非公開にしてもよろしいですか？'
                      : 'この公演を予約サイトに公開してもよろしいですか？お客様が予約できるようになります。'
                    }
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 bg-muted/50 p-4 rounded">
                  <p><strong>日付:</strong> {publishingEvent.date}</p>
                  <p><strong>時間:</strong> {publishingEvent.start_time.slice(0, 5)} - {publishingEvent.end_time.slice(0, 5)}</p>
                  <p><strong>シナリオ:</strong> {publishingEvent.scenario || '未定'}</p>
                  <p><strong>GM:</strong> {publishingEvent.gms.join(', ') || '未定'}</p>
                  <p><strong>最大参加者数:</strong> {publishingEvent.max_participants || 8}名</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsPublishDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button 
                    onClick={handleConfirmPublishToggle}
                    className={publishingEvent.is_reservation_enabled ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-600 hover:bg-green-700'}
                  >
                    {publishingEvent.is_reservation_enabled ? '非公開にする' : '公開する'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

      {/* インポートモーダル */}
      <ImportScheduleModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          // インポート完了後にデータを再読み込み
          const loadEvents = async () => {
            const year = currentDate.getFullYear()
            const month = currentDate.getMonth() + 1
            const data = await scheduleApi.getByMonth(year, month)
            const formattedEvents: ScheduleEvent[] = data.map((event: any) => ({
              id: event.id,
              date: event.date,
              venue: event.store_id,
              scenario: event.scenarios?.title || event.scenario || '',
              gms: event.gms || [],
              start_time: event.start_time,
              end_time: event.end_time,
              category: event.category,
              is_cancelled: event.is_cancelled || false,
              participant_count: event.current_participants || 0,
              max_participants: event.capacity || 8,
              notes: event.notes || '',
              is_reservation_enabled: event.is_reservation_enabled || false
            }))
            setEvents(formattedEvents)
          }
          loadEvents()
        }}
      />

      {/* 重複警告モーダル */}
      {/* 移動/複製確認ダイアログ */}
      <MoveOrCopyDialog
        isOpen={isMoveOrCopyDialogOpen}
        onClose={() => {
          setIsMoveOrCopyDialogOpen(false)
          setDraggedEvent(null)
          setDropTarget(null)
        }}
        onMove={handleMoveEvent}
        onCopy={handleCopyEvent}
        eventInfo={draggedEvent && dropTarget ? {
          scenario: draggedEvent.scenario,
          date: dropTarget.date,
          storeName: stores.find(s => s.id === dropTarget.venue)?.name || '',
          timeSlot: dropTarget.timeSlot === 'morning' ? '午前' : dropTarget.timeSlot === 'afternoon' ? '午後' : '夜間'
        } : null}
      />

      <ConflictWarningModal
        isOpen={isConflictWarningOpen}
        onClose={() => {
          setIsConflictWarningOpen(false)
          setConflictInfo(null)
          setPendingPerformanceData(null)
        }}
        onContinue={async () => {
          if (pendingPerformanceData && conflictInfo) {
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
                // 編集中の公演自身は除外
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
                  // 貸切リクエストの場合
                  await supabase
                    .from('reservations')
                    .delete()
                    .eq('id', conflictEvent.reservation_id)
                } else {
                  // 通常公演の場合
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
            } catch (error) {
              console.error('既存公演の削除エラー:', error)
              alert('既存公演の削除に失敗しました')
            }
          }
        }}
        conflictInfo={conflictInfo}
      />

      {/* コンテキストメニュー */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={contextMenu.type === 'event' && contextMenu.event ? [
            {
              label: '編集',
              icon: <Edit className="w-4 h-4" />,
              onClick: () => {
                handleEditPerformance(contextMenu.event!)
                setContextMenu(null)
              }
            },
            {
              label: 'コピー',
              icon: <Copy className="w-4 h-4" />,
              onClick: () => handleCopyToClipboard(contextMenu.event!),
              separator: true
            },
            ...(contextMenu.event.is_cancelled ? [
              {
                label: '復活',
                icon: <RotateCcw className="w-4 h-4" />,
                onClick: () => {
                  handleUncancelPerformance(contextMenu.event!)
                  setContextMenu(null)
                }
              }
            ] : [
              {
                label: '中止',
                icon: <Ban className="w-4 h-4" />,
                onClick: () => {
                  handleCancelConfirmPerformance(contextMenu.event!)
                  setContextMenu(null)
                }
              }
            ]),
            {
              label: '削除',
              icon: <Trash2 className="w-4 h-4" />,
              onClick: () => {
                if (confirm('この公演を削除しますか？')) {
                  handleDeletePerformance(contextMenu.event!)
                }
                setContextMenu(null)
              },
              separator: true
            }
          ] : contextMenu.type === 'cell' && contextMenu.cellInfo ? [
            {
              label: 'ペースト',
              icon: <Clipboard className="w-4 h-4" />,
              onClick: () => {
                const { date, venue, timeSlot } = contextMenu.cellInfo!
                handlePasteFromClipboard(date, venue, timeSlot)
              },
              disabled: !clipboardEvent
            }
          ] : []}
        />
      )}
    </div>
  )
}


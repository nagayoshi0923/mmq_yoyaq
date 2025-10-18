// React
import { useState, useEffect, useMemo, useCallback } from 'react'

// Custom Hooks
import { useScheduleData } from '@/hooks/useScheduleData'
import { useShiftData } from '@/hooks/useShiftData'
import { useMemoManager } from '@/hooks/useMemoManager'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useEventOperations } from '@/hooks/useEventOperations'
import { useContextMenuActions } from '@/hooks/useContextMenuActions'

// UI Components
import { Button } from '@/components/ui/button'

// Layout Components
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'

// Schedule Components
import { ConflictWarningModal } from '@/components/schedule/ConflictWarningModal'
import { ContextMenu, Copy, Clipboard } from '@/components/schedule/ContextMenu'
import { ImportScheduleModal } from '@/components/schedule/ImportScheduleModal'
import { MoveOrCopyDialog } from '@/components/schedule/MoveOrCopyDialog'
import { PerformanceModal } from '@/components/schedule/PerformanceModal'
import { ScheduleHeader } from '@/components/schedule/ScheduleHeader'
import { CategoryTabs } from '@/components/schedule/CategoryTabs'
import { ScheduleTable } from '@/components/schedule/ScheduleTable'
import { ScheduleDialogs } from '@/components/schedule/ScheduleDialogs'

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
import { Ban, Edit, RotateCcw, Trash2 } from 'lucide-react'

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
  const scrollRestoration = useScrollRestoration({ pageKey: 'schedule', isLoading: scheduleData.isLoading })

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

  // イベント操作フック
  const eventOperations = useEventOperations({
    events,
    setEvents,
    stores,
    scenarios
  })

  // コンテキストメニューフック
  const contextMenuActions = useContextMenuActions({
    stores,
    setEvents
  })

  // UI状態管理
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
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
      if (!eventOperations.isPerformanceModalOpen || !scenarios.length) return
      
      // 日付とタイムスロットの取得
      let date: string
      let timeSlot: string
      
      if (eventOperations.modalInitialData) {
        date = eventOperations.modalInitialData.date
        timeSlot = eventOperations.modalInitialData.timeSlot
      } else if (eventOperations.editingEvent) {
        date = eventOperations.editingEvent.date
        // 開始時刻からタイムスロットを判定
        const startHour = parseInt(eventOperations.editingEvent.start_time.split(':')[0])
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
  }, [eventOperations.isPerformanceModalOpen, eventOperations.modalInitialData, eventOperations.editingEvent, shiftData, scenarios])

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
          <ScheduleHeader
            currentDate={currentDate}
            isLoading={isLoading && stores.length > 0}
            onMonthChange={changeMonth}
            onMonthSelect={(month) => {
              clearScrollPosition()
              const newDate = new Date(currentDate)
              newDate.setMonth(month)
              setCurrentDate(newDate)
            }}
            onImportClick={() => setIsImportModalOpen(true)}
          />

          <CategoryTabs
            selectedCategory={selectedCategory}
            categoryCounts={categoryCounts}
            onCategoryChange={setSelectedCategory}
          />

          {/* メインカード・テーブル */}
          <ScheduleTable
            currentDate={currentDate}
            monthDays={monthDays}
            stores={stores}
            getEventsForSlot={getEventsForSlot}
            shiftData={shiftData}
            categoryConfig={categoryConfig}
            getReservationBadgeClass={getReservationBadgeClass}
            getMemo={getMemo}
            onSaveMemo={handleSaveMemo}
            onAddPerformance={eventOperations.handleAddPerformance}
            onEditPerformance={eventOperations.handleEditPerformance}
            onDeletePerformance={eventOperations.handleDeletePerformance}
            onCancelConfirm={eventOperations.handleCancelConfirmPerformance}
            onUncancel={eventOperations.handleUncancelPerformance}
            onToggleReservation={eventOperations.handleToggleReservation}
            onDrop={eventOperations.handleDrop}
            onContextMenuCell={contextMenuActions.handleCellContextMenu}
            onContextMenuEvent={contextMenuActions.handleEventContextMenu}
          />
          </>
          )}
        </div>
      </div>

          {/* 公演モーダル（追加・編集共通） */}
          <PerformanceModal
            isOpen={eventOperations.isPerformanceModalOpen}
            onClose={eventOperations.handleCloseModal}
            onSave={eventOperations.handleSavePerformance}
            mode={eventOperations.modalMode}
            event={eventOperations.editingEvent}
            initialData={eventOperations.modalInitialData}
            stores={stores as any}
            scenarios={scenarios as any}
            staff={staff}
            availableStaffByScenario={availableStaffByScenario}
            onScenariosUpdate={refetchScenarios}
            onStaffUpdate={refetchStaff}
          />

          {/* 削除・中止・公開の確認ダイアログ */}
          <ScheduleDialogs
            isDeleteDialogOpen={eventOperations.isDeleteDialogOpen}
            deletingEvent={eventOperations.deletingEvent}
            onDeleteDialogClose={() => eventOperations.setIsDeleteDialogOpen(false)}
            onConfirmDelete={eventOperations.handleConfirmDelete}
            isCancelDialogOpen={eventOperations.isCancelDialogOpen}
            cancellingEvent={eventOperations.cancellingEvent}
            onCancelDialogClose={() => eventOperations.setIsCancelDialogOpen(false)}
            onConfirmCancel={eventOperations.handleConfirmCancel}
            isPublishDialogOpen={eventOperations.isPublishDialogOpen}
            publishingEvent={eventOperations.publishingEvent}
            onPublishDialogClose={() => eventOperations.setIsPublishDialogOpen(false)}
            onConfirmPublishToggle={eventOperations.handleConfirmPublishToggle}
          />

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
        isOpen={eventOperations.isMoveOrCopyDialogOpen}
        onClose={() => {
          eventOperations.setIsMoveOrCopyDialogOpen(false)
        }}
        onMove={eventOperations.handleMoveEvent}
        onCopy={eventOperations.handleCopyEvent}
        eventInfo={eventOperations.draggedEvent && eventOperations.dropTarget ? {
          scenario: eventOperations.draggedEvent.scenario,
          date: eventOperations.dropTarget.date,
          storeName: stores.find(s => s.id === eventOperations.dropTarget!.venue)?.name || '',
          timeSlot: eventOperations.dropTarget.timeSlot === 'morning' ? '午前' : eventOperations.dropTarget.timeSlot === 'afternoon' ? '午後' : '夜間'
        } : null}
      />

      <ConflictWarningModal
        isOpen={eventOperations.isConflictWarningOpen}
        onClose={() => {
          eventOperations.setIsConflictWarningOpen(false)
          eventOperations.setConflictInfo(null)
          eventOperations.setPendingPerformanceData(null)
        }}
        onContinue={eventOperations.handleConflictContinue}
        conflictInfo={eventOperations.conflictInfo}
      />

      {/* コンテキストメニュー */}
      {contextMenuActions.contextMenu && (
        <ContextMenu
          x={contextMenuActions.contextMenu.x}
          y={contextMenuActions.contextMenu.y}
          onClose={() => contextMenuActions.setContextMenu(null)}
          items={contextMenuActions.contextMenu.type === 'event' && contextMenuActions.contextMenu.event ? [
            {
              label: '編集',
              icon: <Edit className="w-4 h-4" />,
              onClick: () => {
                eventOperations.handleEditPerformance(contextMenuActions.contextMenu!.event!)
                contextMenuActions.setContextMenu(null)
              }
            },
            {
              label: 'コピー',
              icon: <Copy className="w-4 h-4" />,
              onClick: () => contextMenuActions.handleCopyToClipboard(contextMenuActions.contextMenu!.event!),
              separator: true
            },
            ...(contextMenuActions.contextMenu.event.is_cancelled ? [
              {
                label: '復活',
                icon: <RotateCcw className="w-4 h-4" />,
                onClick: () => {
                  eventOperations.handleUncancelPerformance(contextMenuActions.contextMenu!.event!)
                  contextMenuActions.setContextMenu(null)
                }
              }
            ] : [
              {
                label: '中止',
                icon: <Ban className="w-4 h-4" />,
                onClick: () => {
                  eventOperations.handleCancelConfirmPerformance(contextMenuActions.contextMenu!.event!)
                  contextMenuActions.setContextMenu(null)
                }
              }
            ]),
            {
              label: '削除',
              icon: <Trash2 className="w-4 h-4" />,
              onClick: () => {
                if (confirm('この公演を削除しますか？')) {
                  eventOperations.handleDeletePerformance(contextMenuActions.contextMenu!.event!)
                }
                contextMenuActions.setContextMenu(null)
              },
              separator: true
            }
          ] : contextMenuActions.contextMenu.type === 'cell' && contextMenuActions.contextMenu.cellInfo ? [
            {
              label: 'ペースト',
              icon: <Clipboard className="w-4 h-4" />,
              onClick: () => {
                const { date, venue, timeSlot } = contextMenuActions.contextMenu!.cellInfo!
                contextMenuActions.handlePasteFromClipboard(date, venue, timeSlot)
              },
              disabled: !contextMenuActions.clipboardEvent
            }
          ] : []}
        />
      )}
    </div>
  )
}


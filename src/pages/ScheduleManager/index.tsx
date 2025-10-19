// React
import { useState, useEffect } from 'react'

// Custom Hooks (既存)
import { useScheduleData } from '@/hooks/useScheduleData'
import { useShiftData } from '@/hooks/useShiftData'
import { useMemoManager } from '@/hooks/useMemoManager'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useEventOperations } from '@/hooks/useEventOperations'
import { useContextMenuActions } from '@/hooks/useContextMenuActions'

// Custom Hooks (新規 - ScheduleManager専用)
import { useCategoryFilter } from './hooks/useCategoryFilter'
import { useMonthNavigation } from './hooks/useMonthNavigation'
import { useScheduleEvents } from './hooks/useScheduleEvents'

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

// Icons
import { Ban, Edit, RotateCcw, Trash2 } from 'lucide-react'

// Utils
import { CATEGORY_CONFIG, getReservationBadgeClass } from '@/utils/scheduleUtils'

// Types
export type { ScheduleEvent } from '@/types/schedule'

export function ScheduleManager() {
  // 月ナビゲーション
  const scrollRestoration = useScrollRestoration({ pageKey: 'schedule', isLoading: false })
  const { currentDate, changeMonth, monthDays } = useMonthNavigation(scrollRestoration.clearScrollPosition)

  // データ取得
  const scheduleData = useScheduleData(currentDate)
  const shiftDataHook = useShiftData(currentDate, scheduleData.staff, scheduleData.staffLoading)
  const memoManager = useMemoManager(currentDate, scheduleData.stores)

  // 分割代入
  const { events, setEvents, stores, staff, scenarios, storeColors, isLoading, selectedStores, setSelectedStores, hiddenStores, setHiddenStores, fetchSchedule } = scheduleData
  // shiftDataHookがundefinedまたはshiftDataがundefinedの場合に空オブジェクトを設定
  const shiftData = shiftDataHook?.shiftData ?? {}
  const { handleSaveMemo, getMemo } = memoManager

  // イベント操作
  const eventOperations = useEventOperations({
    events,
    setEvents,
    stores,
    scenarios
  })

  // コンテキストメニュー操作
  const contextMenuActions = useContextMenuActions({
    stores,
    setEvents
  })

  // カテゴリーフィルター
  const { selectedCategory, setSelectedCategory, categoryCounts } = useCategoryFilter(events)

  // イベント取得ロジック
  const { getEventsForSlot, availableStaffByScenario } = useScheduleEvents(
    events,
    selectedCategory,
    scenarios,
    shiftData,
    eventOperations
  )

  // その他の状態
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <NavigationBar currentPage="schedule" />

      <div className="container mx-auto p-4">
        {/* ヘッダー */}
        <ScheduleHeader
          currentDate={currentDate}
          onChangeMonth={changeMonth}
          onOpenImportModal={() => setIsImportModalOpen(true)}
          onCreateEvent={eventOperations.handleCreateEvent}
        />

        {/* カテゴリータブ */}
        <CategoryTabs
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          categoryCounts={categoryCounts}
        />

        {/* スケジュールテーブル */}
        <ScheduleTable
          currentDate={currentDate}
          monthDays={monthDays}
          stores={stores}
          getEventsForSlot={getEventsForSlot}
          shiftData={shiftData}
          categoryConfig={CATEGORY_CONFIG}
          getReservationBadgeClass={getReservationBadgeClass}
          getMemo={getMemo}
          onSaveMemo={handleSaveMemo}
          onAddPerformance={eventOperations.handleAddPerformance}
          onEditPerformance={eventOperations.handleEditPerformance}
          onDeletePerformance={eventOperations.handleDeletePerformance}
          onCancelConfirm={eventOperations.handleCancelConfirmPerformance}
          onUncancel={eventOperations.handleUncancelPerformance}
          onToggleReservation={eventOperations.handleTogglePublish}
          onDrop={eventOperations.handleDrop}
          onContextMenuCell={contextMenuActions.handleCellContextMenu}
          onContextMenuEvent={contextMenuActions.handleEventContextMenu}
        />

        {/* モーダル・ダイアログ群 */}
        <PerformanceModal
          isOpen={eventOperations.isPerformanceModalOpen}
          onClose={eventOperations.handleCloseModal}
          onSave={eventOperations.handleSavePerformance}
          mode={eventOperations.modalMode}
          event={eventOperations.editingEvent}
          initialData={eventOperations.modalInitialData}
          stores={stores}
          scenarios={scenarios}
          staff={staff}
          availableStaffByScenario={availableStaffByScenario}
        />

        <ImportScheduleModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportSuccess={fetchSchedule}
        />

        <ConflictWarningModal
          isOpen={eventOperations.isConflictWarningOpen}
          onClose={() => eventOperations.setIsConflictWarningOpen(false)}
          onConfirm={eventOperations.handleConfirmWithConflict}
          conflicts={eventOperations.conflicts}
        />

        <ScheduleDialogs
          isDeleteDialogOpen={eventOperations.isDeleteDialogOpen}
          onCloseDeleteDialog={() => eventOperations.setIsDeleteDialogOpen(false)}
          onConfirmDelete={eventOperations.handleConfirmDelete}
          isCancelDialogOpen={eventOperations.isCancelDialogOpen}
          onCloseCancelDialog={() => eventOperations.setIsCancelDialogOpen(false)}
          onConfirmCancel={eventOperations.handleConfirmCancel}
          isRestoreDialogOpen={eventOperations.isRestoreDialogOpen}
          onCloseRestoreDialog={() => eventOperations.setIsRestoreDialogOpen(false)}
          onConfirmRestore={eventOperations.handleConfirmRestore}
        />

        <MoveOrCopyDialog
          isOpen={contextMenuActions.isMoveOrCopyDialogOpen}
          onClose={contextMenuActions.handleCloseMoveOrCopyDialog}
          onConfirm={contextMenuActions.handleConfirmMoveOrCopy}
          action={contextMenuActions.moveOrCopyAction}
          eventTitle={contextMenuActions.selectedEvent?.scenario || ''}
          sourceDate={contextMenuActions.selectedEvent?.date || ''}
          sourceVenue={contextMenuActions.selectedEvent?.venue || ''}
          sourceTimeSlot={contextMenuActions.selectedEvent?.start_time ? (() => {
            const hour = parseInt(contextMenuActions.selectedEvent.start_time.split(':')[0])
            if (hour < 12) return 'morning'
            if (hour < 17) return 'afternoon'
            return 'evening'
          })() : 'morning'}
          stores={stores}
          monthDays={monthDays}
        />

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
                onClick: () => {
                  contextMenuActions.handleCopyToClipboard(contextMenuActions.contextMenu!.event!)
                },
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
    </div>
  )
}


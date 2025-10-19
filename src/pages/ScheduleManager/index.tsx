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
import { ContextMenu } from '@/components/schedule/ContextMenu'
import { ImportScheduleModal } from '@/components/schedule/ImportScheduleModal'
import { MoveOrCopyDialog } from '@/components/schedule/MoveOrCopyDialog'
import { PerformanceModal } from '@/components/schedule/PerformanceModal'
import { ScheduleHeader } from '@/components/schedule/ScheduleHeader'
import { CategoryTabs } from '@/components/schedule/CategoryTabs'
import { ScheduleTable } from '@/components/schedule/ScheduleTable'
import { ScheduleDialogs } from '@/components/schedule/ScheduleDialogs'

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
  const { events, stores, staff, scenarios, storeColors, isLoading, selectedStores, setSelectedStores, hiddenStores, setHiddenStores, fetchSchedule } = scheduleData
  const { shiftData } = shiftDataHook
  const { handleSaveMemo, getMemo } = memoManager

  // イベント操作
  const eventOperations = useEventOperations({
    currentDate,
    selectedStores,
    stores,
    fetchSchedule
  })

  // コンテキストメニュー操作
  const contextMenuActions = useContextMenuActions({
    stores,
    setEvents: (updater) => {
      // setEventsの代わりにfetchScheduleを呼ぶ
      if (typeof updater === 'function') {
        // 関数の場合は現在のeventsを渡して新しいeventsを取得
        fetchSchedule()
      } else {
        fetchSchedule()
      }
    }
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
          hiddenStores={hiddenStores}
          storeColors={storeColors}
          getEventsForSlot={getEventsForSlot}
          getMemo={getMemo}
          onSaveMemo={handleSaveMemo}
          onEventClick={eventOperations.handleEventClick}
          onEventEdit={eventOperations.handleEditEvent}
          onEventCancel={eventOperations.handleCancelEvent}
          onEventDelete={eventOperations.handleDeleteEvent}
          onContextMenu={contextMenuActions.handleContextMenu}
          isLoading={isLoading}
          selectedStores={selectedStores}
          setSelectedStores={setSelectedStores}
          setHiddenStores={setHiddenStores}
        />

        {/* モーダル・ダイアログ群 */}
        <PerformanceModal
          isOpen={eventOperations.isPerformanceModalOpen}
          onClose={eventOperations.handleClosePerformanceModal}
          onSave={eventOperations.handleSaveEvent}
          stores={stores}
          scenarios={scenarios}
          staff={staff}
          availableStaffByScenario={availableStaffByScenario}
          initialData={eventOperations.modalInitialData}
          editingEvent={eventOperations.editingEvent}
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
                label: 'コピー',
                onClick: () => {
                  contextMenuActions.handleCopyToClipboard(contextMenuActions.contextMenu!.event!)
                }
              }
            ] : contextMenuActions.clipboardEvent ? [
              {
                label: 'ペースト',
                onClick: () => {
                  const cellInfo = contextMenuActions.contextMenu!.cellInfo!
                  contextMenuActions.handlePasteFromClipboard(cellInfo.date, cellInfo.venue, cellInfo.timeSlot)
                }
              }
            ] : []}
          />
        )}
      </div>
    </div>
  )
}


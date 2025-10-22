// React
import { useState, useEffect, useMemo } from 'react'

// Custom Hooks
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useScheduleTable, useScheduleTableModals } from '@/hooks/useScheduleTable'

// Custom Hooks (ScheduleManager専用)
import { useCategoryFilter } from './hooks/useCategoryFilter'
import { useMonthNavigation } from './hooks/useMonthNavigation'

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

// Types
export type { ScheduleEvent } from '@/types/schedule'

export function ScheduleManager() {
  // 月ナビゲーション
  const scrollRestoration = useScrollRestoration({ pageKey: 'schedule', isLoading: false })
  const { currentDate, setCurrentDate, monthDays } = useMonthNavigation(scrollRestoration.clearScrollPosition)

  // その他の状態
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // スケジュールテーブルの共通フック
  const scheduleTableProps = useScheduleTable({ currentDate })
  const modals = useScheduleTableModals(currentDate)

  // カテゴリーフィルター（ScheduleManager独自機能）
  const { selectedCategory, setSelectedCategory, categoryCounts } = useCategoryFilter(
    scheduleTableProps.viewConfig.stores.flatMap(store => 
      ['morning', 'afternoon', 'evening'].flatMap(timeSlot => 
        monthDays.flatMap(day => 
          scheduleTableProps.dataProvider.getEventsForSlot(day.date, store.id, timeSlot as any)
        )
      )
    )
  )

  // カテゴリーフィルター適用版のgetEventsForSlot
  const filteredGetEventsForSlot = useMemo(() => {
    return (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
      const events = scheduleTableProps.dataProvider.getEventsForSlot(date, venue, timeSlot)
      if (selectedCategory === 'all') return events
      return events.filter(event => event.category === selectedCategory)
    }
  }, [scheduleTableProps.dataProvider.getEventsForSlot, selectedCategory])

  // カテゴリーフィルター適用版のpropsを作成
  const filteredScheduleTableProps = useMemo(() => ({
    ...scheduleTableProps,
    dataProvider: {
      ...scheduleTableProps.dataProvider,
      getEventsForSlot: filteredGetEventsForSlot
    }
  }), [scheduleTableProps, filteredGetEventsForSlot])

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
          isLoading={false}
          onDateChange={setCurrentDate}
          onImportClick={() => setIsImportModalOpen(true)}
        />

        {/* カテゴリータブ */}
        <CategoryTabs
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          categoryCounts={categoryCounts}
        />

        {/* スケジュールテーブル */}
        <ScheduleTable {...filteredScheduleTableProps} />

        {/* モーダル・ダイアログ群 */}
        <PerformanceModal
          isOpen={modals.performanceModal.isOpen}
          onClose={modals.performanceModal.onClose}
          onSave={modals.performanceModal.onSave as any}
          mode={modals.performanceModal.mode}
          event={modals.performanceModal.event}
          initialData={modals.performanceModal.initialData}
          stores={modals.performanceModal.stores as any}
          scenarios={modals.performanceModal.scenarios as any}
          staff={modals.performanceModal.staff}
          availableStaffByScenario={modals.performanceModal.availableStaffByScenario}
        />

        <ImportScheduleModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={modals.fetchSchedule}
        />

        <ConflictWarningModal
          isOpen={modals.conflictWarning.isOpen}
          onClose={modals.conflictWarning.onClose}
          onContinue={modals.conflictWarning.onContinue}
          conflictInfo={modals.conflictWarning.conflictInfo}
        />

        <ScheduleDialogs
          isDeleteDialogOpen={modals.scheduleDialogs.isDeleteDialogOpen}
          onCloseDeleteDialog={modals.scheduleDialogs.onCloseDeleteDialog}
          onConfirmDelete={modals.scheduleDialogs.onConfirmDelete}
          isCancelDialogOpen={modals.scheduleDialogs.isCancelDialogOpen}
          onCloseCancelDialog={modals.scheduleDialogs.onCloseCancelDialog}
          onConfirmCancel={modals.scheduleDialogs.onConfirmCancel}
          isRestoreDialogOpen={modals.scheduleDialogs.isRestoreDialogOpen}
          onCloseRestoreDialog={modals.scheduleDialogs.onCloseRestoreDialog}
          onConfirmRestore={modals.scheduleDialogs.onConfirmRestore}
        />

        <MoveOrCopyDialog
          isOpen={modals.moveOrCopyDialog.isOpen}
          onClose={modals.moveOrCopyDialog.onClose}
          onMove={modals.moveOrCopyDialog.onMove}
          onCopy={modals.moveOrCopyDialog.onCopy}
          eventInfo={modals.moveOrCopyDialog.selectedEvent ? {
            scenario: modals.moveOrCopyDialog.selectedEvent.scenario || '',
            date: modals.moveOrCopyDialog.selectedEvent.date || '',
            storeName: modals.moveOrCopyDialog.stores.find(s => s.id === modals.moveOrCopyDialog.selectedEvent?.venue)?.name || '',
            timeSlot: (() => {
              const hour = parseInt(modals.moveOrCopyDialog.selectedEvent.start_time.split(':')[0])
              if (hour < 12) return 'morning'
              if (hour < 17) return 'afternoon'
              return 'evening'
            })()
          } : null}
        />

        {modals.contextMenu.contextMenu && (
          <ContextMenu
            x={modals.contextMenu.contextMenu.x}
            y={modals.contextMenu.contextMenu.y}
            onClose={() => modals.contextMenu.setContextMenu(null)}
            items={modals.contextMenu.contextMenu.type === 'event' && modals.contextMenu.contextMenu.event ? [
              {
                label: '編集',
                icon: <Edit className="w-4 h-4" />,
                onClick: () => {
                  scheduleTableProps.eventHandlers.onEditPerformance(modals.contextMenu.contextMenu!.event!)
                  modals.contextMenu.setContextMenu(null)
                }
              },
              {
                label: 'コピー',
                icon: <Copy className="w-4 h-4" />,
                onClick: () => {
                  modals.contextMenu.handleCopyToClipboard(modals.contextMenu.contextMenu!.event!)
                },
                separator: true
              },
              ...(modals.contextMenu.contextMenu.event.is_cancelled ? [
                {
                  label: '復活',
                  icon: <RotateCcw className="w-4 h-4" />,
                  onClick: () => {
                    scheduleTableProps.eventHandlers.onUncancel(modals.contextMenu.contextMenu!.event!)
                    modals.contextMenu.setContextMenu(null)
                  }
                }
              ] : [
                {
                  label: '中止',
                  icon: <Ban className="w-4 h-4" />,
                  onClick: () => {
                    scheduleTableProps.eventHandlers.onCancelConfirm(modals.contextMenu.contextMenu!.event!)
                    modals.contextMenu.setContextMenu(null)
                  }
                }
              ]),
              {
                label: '削除',
                icon: <Trash2 className="w-4 h-4" />,
                onClick: () => {
                  scheduleTableProps.eventHandlers.onDeletePerformance(modals.contextMenu.contextMenu!.event!)
                  modals.contextMenu.setContextMenu(null)
                },
                separator: true
              }
            ] : modals.contextMenu.contextMenu.type === 'cell' && modals.contextMenu.contextMenu.cellInfo ? [
              {
                label: 'ペースト',
                icon: <Clipboard className="w-4 h-4" />,
                onClick: () => {
                  const { date, venue, timeSlot } = modals.contextMenu.contextMenu!.cellInfo!
                  modals.contextMenu.handlePasteFromClipboard(date, venue, timeSlot)
                },
                disabled: !modals.contextMenu.clipboardEvent
              }
            ] : []}
          />
        )}
      </div>
    </div>
  )
}

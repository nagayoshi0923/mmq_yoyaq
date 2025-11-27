// React
import { useState, useEffect, useMemo } from 'react'

// API
import { staffApi } from '@/lib/api'

// Custom Hooks
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useScheduleTable } from '@/hooks/useScheduleTable'
import { useTemporaryVenues } from '@/hooks/useTemporaryVenues'

// Custom Hooks (ScheduleManager専用)
import { useCategoryFilter } from './hooks/useCategoryFilter'
import { useMonthNavigation } from './hooks/useMonthNavigation'

// Types
import type { Staff } from '@/types'

// Layout Components
import { AppLayout } from '@/components/layout/AppLayout'

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
import { Ban, Edit, RotateCcw, Trash2, Plus } from 'lucide-react'

// Types
export type { ScheduleEvent } from '@/types/schedule'

export function ScheduleManager() {
  // 月ナビゲーション
  const scrollRestoration = useScrollRestoration({ pageKey: 'schedule', isLoading: false })
  const { currentDate, setCurrentDate, monthDays } = useMonthNavigation(scrollRestoration.clearScrollPosition)

  // 臨時会場管理
  const { temporaryVenues, addTemporaryVenue, removeTemporaryVenue } = useTemporaryVenues(currentDate)

  // GMリスト
  const [gmList, setGmList] = useState<Staff[]>([])
  const [selectedGM, setSelectedGM] = useState<string>('all')

  // その他の状態
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // スケジュールテーブルの共通フック
  const scheduleTableProps = useScheduleTable({ currentDate })
  const modals = scheduleTableProps.modals

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

  // スタッフリスト取得
  useEffect(() => {
    const fetchStaffList = async () => {
      try {
        const staff = await staffApi.getAll()
        // 全スタッフを表示（ロールでフィルタリングしない）
        setGmList(staff)
      } catch (error) {
        console.error('スタッフリストの取得に失敗しました:', error)
      }
    }
    fetchStaffList()
  }, [])

  // カテゴリー＋スタッフフィルター適用版のgetEventsForSlot
  const filteredGetEventsForSlot = useMemo(() => {
    return (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
      let events = scheduleTableProps.dataProvider.getEventsForSlot(date, venue, timeSlot)
      
      // カテゴリーフィルター
      if (selectedCategory !== 'all') {
        events = events.filter(event => event.category === selectedCategory)
      }
      
      // スタッフフィルター
      if (selectedGM !== 'all') {
        events = events.filter(event => {
          // 選択したスタッフのdisplay_nameまたはnameを取得
          const selectedStaff = gmList.find(s => s.id === selectedGM)
          const selectedStaffName = selectedStaff?.display_name || selectedStaff?.name
          
          // gms配列をチェック（schedule_eventsテーブルの実際の構造）
          if (!event.gms || !Array.isArray(event.gms)) {
            return false
          }
          
          // スタッフIDまたは名前でマッチング
          return event.gms.some(gm => 
            String(gm) === String(selectedGM) || 
            (selectedStaffName && String(gm) === selectedStaffName)
          )
        })
      }
      
      return events
    }
  }, [scheduleTableProps.dataProvider.getEventsForSlot, selectedCategory, selectedGM, gmList])

  // カテゴリーフィルター適用版のpropsを作成
  const filteredScheduleTableProps = useMemo(() => ({
    ...scheduleTableProps,
    viewConfig: {
      ...scheduleTableProps.viewConfig,
      temporaryVenues
    },
    dataProvider: {
      ...scheduleTableProps.dataProvider,
      getEventsForSlot: filteredGetEventsForSlot
    }
  }), [scheduleTableProps, filteredGetEventsForSlot, temporaryVenues])

  // デモ参加者追加処理（削除済み - 別途スクリプトで実行）

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
    <AppLayout
      currentPage="schedule" 
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      className="mx-auto"
    >
      <div className="space-y-6 max-w-[1280px] mx-auto">
        {/* ヘッダー */}
        <ScheduleHeader
          currentDate={currentDate}
          isLoading={false}
          onDateChange={setCurrentDate}
          onImportClick={() => setIsImportModalOpen(true)}
          gmList={gmList}
          selectedGM={selectedGM}
          onGMChange={setSelectedGM}
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
          allAvailableStaff={modals.performanceModal.allAvailableStaff}
          onParticipantChange={modals.performanceModal.onParticipantChange}
        />

        <ImportScheduleModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={scheduleTableProps.fetchSchedule}
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
            items={modals.contextMenu.contextMenu.type === 'event' && modals.contextMenu.contextMenu.event ? (() => {
              const event = modals.contextMenu.contextMenu!.event!
              const isTemporaryVenue = temporaryVenues.some(v => v.id === event.venue)
              
              // デバッグログ
              console.log('コンテキストメニュー:', {
                eventVenue: event.venue,
                temporaryVenues: temporaryVenues.map(v => ({ id: v.id, name: v.name })),
                isTemporaryVenue
              })
              
              return [
                {
                  label: '編集',
                  icon: <Edit className="w-4 h-4" />,
                  onClick: () => {
                    scheduleTableProps.eventHandlers.onEditPerformance(event)
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: 'コピー',
                  icon: <Copy className="w-4 h-4" />,
                  onClick: () => {
                    modals.contextMenu.handleCopyToClipboard(event)
                  },
                  separator: true
                },
                ...(event.is_cancelled ? [
                  {
                    label: '復活',
                    icon: <RotateCcw className="w-4 h-4" />,
                    onClick: () => {
                      scheduleTableProps.eventHandlers.onUncancel(event)
                      modals.contextMenu.setContextMenu(null)
                    }
                  }
                ] : [
                  {
                    label: '中止',
                    icon: <Ban className="w-4 h-4" />,
                    onClick: () => {
                      scheduleTableProps.eventHandlers.onCancelConfirm(event)
                      modals.contextMenu.setContextMenu(null)
                    }
                  }
                ]),
                {
                  label: '公演を削除',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: () => {
                    scheduleTableProps.eventHandlers.onDeletePerformance(event)
                    modals.contextMenu.setContextMenu(null)
                  },
                  separator: true
                },
                {
                  label: '臨時会場を追加',
                  icon: <Plus className="w-4 h-4" />,
                  onClick: () => {
                    addTemporaryVenue(event.date)
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '臨時会場を削除',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: () => {
                    removeTemporaryVenue(event.venue)
                    modals.contextMenu.setContextMenu(null)
                  },
                  disabled: !isTemporaryVenue
                }
              ]
            })()
             : modals.contextMenu.contextMenu.type === 'cell' && modals.contextMenu.contextMenu.cellInfo ? (() => {
              // すべてのセルで統一メニューを表示
              const { date, venue, timeSlot } = modals.contextMenu.contextMenu!.cellInfo!
              const isTemporaryVenue = venue && temporaryVenues.some(v => v.id === venue)
              
              return [
                {
                  label: '公演を追加',
                  icon: <Edit className="w-4 h-4" />,
                  onClick: () => {
                    modals.performance.handleOpenPerformanceModal(date, venue, timeSlot)
                    modals.contextMenu.setContextMenu(null)
                  },
                  separator: true
                },
                {
                  label: '臨時会場を追加',
                  icon: <Plus className="w-4 h-4" />,
                  onClick: () => {
                    addTemporaryVenue(date)
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '臨時会場を削除',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: () => {
                    removeTemporaryVenue(venue)
                    modals.contextMenu.setContextMenu(null)
                  },
                  disabled: !isTemporaryVenue,
                  separator: true
                },
                {
                  label: 'ペースト',
                  icon: <Clipboard className="w-4 h-4" />,
                  onClick: () => {
                    const { date, venue, timeSlot } = modals.contextMenu.contextMenu!.cellInfo!
                    modals.contextMenu.handlePasteFromClipboard(date, venue, timeSlot)
                  },
                  disabled: !modals.contextMenu.clipboardEvent || venue === ''
                }
              ]
            })() : []}
          />
        )}
      </div>
    </AppLayout>
  )
}

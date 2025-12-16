// React
import { useState, useEffect, useMemo } from 'react'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

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
import { PageHeader } from '@/components/layout/PageHeader'

// UI Components
import { Button } from '@/components/ui/button'
import { MultiSelect } from '@/components/ui/multi-select'
import { HelpButton } from '@/components/ui/help-button'
import { MonthSwitcher } from '@/components/patterns/calendar'

// Schedule Components
import { ConflictWarningModal } from '@/components/schedule/ConflictWarningModal'
import { ContextMenu, Copy, Clipboard } from '@/components/schedule/ContextMenu'
import { ImportScheduleModal } from '@/components/schedule/ImportScheduleModal'
import { MoveOrCopyDialog } from '@/components/schedule/MoveOrCopyDialog'
import { PerformanceModal } from '@/components/schedule/PerformanceModal'
import { CategoryTabs } from '@/components/schedule/CategoryTabs'
import { ScheduleTable } from '@/components/schedule/ScheduleTable'
import { ScheduleDialogs } from '@/components/schedule/ScheduleDialogs'

// Icons
import { Ban, Edit, RotateCcw, Trash2, Plus, CalendarDays, Upload } from 'lucide-react'

// Types
export type { ScheduleEvent } from '@/types/schedule'

export function ScheduleManager() {
  // 月ナビゲーション
  const scrollRestoration = useScrollRestoration({ pageKey: 'schedule', isLoading: false })
  const { currentDate, setCurrentDate, monthDays } = useMonthNavigation(scrollRestoration.clearScrollPosition)

  // 臨時会場管理
  const { temporaryVenues, availableVenues, addTemporaryVenue, removeTemporaryVenue } = useTemporaryVenues(currentDate)

  // GMリスト
  const [gmList, setGmList] = useState<Staff[]>([])
  const [selectedGMs, setSelectedGMs] = useState<string[]>([])
  
  // 店舗フィルター
  const [selectedStores, setSelectedStores] = useState<string[]>([])
  
  // シフト提出者フィルター（空スロットに表示されるシフト提出者を絞り込む）
  const [selectedShiftStaff, setSelectedShiftStaff] = useState<string[]>([])

  // その他の状態
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // スケジュールテーブルの共通フック
  const scheduleTableProps = useScheduleTable({ currentDate })
  const modals = scheduleTableProps.modals

  // カテゴリーフィルター（ScheduleManager独自機能）
  const timeSlots = ['morning', 'afternoon', 'evening'] as const
  const { selectedCategory, setSelectedCategory, categoryCounts } = useCategoryFilter(
    scheduleTableProps.viewConfig.stores.flatMap(store => 
      timeSlots.flatMap(timeSlot => 
        monthDays.flatMap(day => 
          scheduleTableProps.dataProvider.getEventsForSlot(day.date, store.id, timeSlot)
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
        logger.error('スタッフリストの取得に失敗しました:', error)
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
      
      // スタッフフィルター（複数選択対応）
      if (selectedGMs.length > 0) {
        events = events.filter(event => {
          // gms配列をチェック（schedule_eventsテーブルの実際の構造）
          if (!event.gms || !Array.isArray(event.gms)) {
            return false
          }
          
          // 選択したスタッフのいずれかがイベントに含まれているかチェック
          return selectedGMs.some(selectedId => {
            const selectedStaff = gmList.find(s => s.id === selectedId)
            const selectedStaffName = selectedStaff?.display_name || selectedStaff?.name
            
            return event.gms.some(gm => 
              String(gm) === String(selectedId) || 
              (selectedStaffName && String(gm) === selectedStaffName)
            )
          })
        })
      }
      
      return events
    }
  }, [scheduleTableProps.dataProvider.getEventsForSlot, selectedCategory, selectedGMs, gmList])

  // 店舗フィルター適用版の店舗リスト
  const filteredStores = useMemo(() => {
    if (selectedStores.length === 0) {
      return scheduleTableProps.viewConfig.stores
    }
    return scheduleTableProps.viewConfig.stores.filter(store => 
      selectedStores.includes(store.id)
    )
  }, [scheduleTableProps.viewConfig.stores, selectedStores])

  // シフト提出者一覧を取得（MultiSelectのオプション用）
  const shiftStaffOptions = useMemo(() => {
    const shiftData = scheduleTableProps.dataProvider.shiftData || {}
    
    // シフト提出済みのスタッフIDを抽出
    const staffWithShift = new Set<string>()
    Object.values(shiftData).forEach((staffList: Staff[]) => {
      staffList.forEach(s => staffWithShift.add(s.id))
    })
    
    // 全スタッフを表示（シフト提出済みを上に、提出済みバッジ付き）
    return [...gmList]
      .sort((a, b) => {
        const aHasShift = staffWithShift.has(a.id)
        const bHasShift = staffWithShift.has(b.id)
        if (aHasShift && !bHasShift) return -1
        if (!aHasShift && bHasShift) return 1
        return (a.display_name || a.name).localeCompare(b.display_name || b.name, 'ja')
      })
      .map(staff => {
        const hasShift = staffWithShift.has(staff.id)
        return {
          id: staff.id,
          name: staff.display_name || staff.name,
          displayInfo: hasShift ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
              提出済
            </span>
          ) : undefined,
          displayInfoSearchText: hasShift ? '提出済' : undefined
        }
      })
  }, [scheduleTableProps.dataProvider.shiftData, gmList])

  // シフトデータのフィルタリング（選択したスタッフのみ表示）
  const filteredShiftData = useMemo(() => {
    const shiftData = scheduleTableProps.dataProvider.shiftData || {}
    
    // フィルターが選択されていない場合はそのまま返す
    if (selectedShiftStaff.length === 0) {
      return shiftData
    }
    
    // 選択されたスタッフのみフィルタリング
    const filtered: Record<string, Staff[]> = {}
    Object.entries(shiftData).forEach(([key, staffList]) => {
      filtered[key] = staffList.filter((s: Staff) => selectedShiftStaff.includes(s.id))
    })
    return filtered
  }, [scheduleTableProps.dataProvider.shiftData, selectedShiftStaff])

  // カテゴリー＋スタッフ＋店舗＋シフト提出者フィルター適用版のpropsを作成
  const filteredScheduleTableProps = useMemo(() => ({
    ...scheduleTableProps,
    viewConfig: {
      ...scheduleTableProps.viewConfig,
      stores: filteredStores,
      temporaryVenues: selectedStores.length === 0 ? temporaryVenues : []
    },
    dataProvider: {
      ...scheduleTableProps.dataProvider,
      getEventsForSlot: filteredGetEventsForSlot,
      shiftData: filteredShiftData
    }
  }), [scheduleTableProps, filteredStores, filteredGetEventsForSlot, temporaryVenues, selectedStores, filteredShiftData])

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
        <div className="space-y-4">
          <PageHeader
            title={
              <div className="flex items-center gap-2">
                <CalendarDays className="h-6 w-6 text-primary" />
                <span className="text-xl font-bold tracking-tight">スケジュール管理</span>
              </div>
            }
            description="月ごとの公演スケジュールとGM配置を管理します"
            className="mb-2"
          >
            <HelpButton topic="schedule" label="スケジュール管理マニュアル" />
          </PageHeader>

          {/* 操作行 */}
          <div className="flex flex-wrap items-center gap-3 pl-1">
            <MonthSwitcher
              value={currentDate}
              onChange={setCurrentDate}
              showToday
              quickJump
              enableKeyboard
            />
            
            {/* スタッフフィルター（シフト提出済みを上に、バッジ付き、複数選択対応） */}
            {gmList.length > 0 && (
              <div className="w-36 sm:w-52">
                <MultiSelect
                  options={(() => {
                    // シフトデータからシフト提出済みのスタッフIDを抽出
                    const shiftData = scheduleTableProps.dataProvider.shiftData || {}
                    const staffWithShift = new Set<string>()
                    Object.values(shiftData).forEach((staffList: Staff[]) => {
                      staffList.forEach(s => staffWithShift.add(s.id))
                    })
                    
                    // シフト提出済みを上に並び替え
                    return [...gmList]
                      .sort((a, b) => {
                        const aHasShift = staffWithShift.has(a.id)
                        const bHasShift = staffWithShift.has(b.id)
                        if (aHasShift && !bHasShift) return -1
                        if (!aHasShift && bHasShift) return 1
                        return (a.display_name || a.name).localeCompare(b.display_name || b.name, 'ja')
                      })
                      .map((staff) => {
                        const hasShift = staffWithShift.has(staff.id)
                        return {
                          id: staff.id,
                          name: staff.display_name || staff.name,
                          displayInfo: hasShift ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
                              提出済
                            </span>
                          ) : undefined,
                          displayInfoSearchText: hasShift ? '提出済' : undefined
                        }
                      })
                  })()}
                  selectedValues={selectedGMs}
                  onSelectionChange={setSelectedGMs}
                  placeholder="スタッフで絞込"
                  closeOnSelect={false}
                  useIdAsValue={true}
                />
              </div>
            )}
            
            {/* 店舗フィルター（複数選択対応） */}
            {scheduleTableProps.viewConfig.stores.length > 0 && (
              <div className="w-36 sm:w-44">
                <MultiSelect
                  options={scheduleTableProps.viewConfig.stores.map(store => ({
                    id: store.id,
                    name: store.short_name || store.name
                  }))}
                  selectedValues={selectedStores}
                  onSelectionChange={setSelectedStores}
                  placeholder="店舗で絞込"
                  closeOnSelect={false}
                  useIdAsValue={true}
                />
              </div>
            )}
            
            {/* シフト提出者フィルター（空スロットの提出者表示を絞り込む） */}
            {shiftStaffOptions.length > 0 && (
              <div className="w-36 sm:w-52">
                <MultiSelect
                  options={shiftStaffOptions}
                  selectedValues={selectedShiftStaff}
                  onSelectionChange={setSelectedShiftStaff}
                  placeholder="出勤者で絞込"
                  closeOnSelect={false}
                  useIdAsValue={true}
                />
              </div>
            )}

            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setIsImportModalOpen(true)}
              title="インポート"
              className="h-9 w-9"
            >
              <Upload className="h-4 w-4" />
            </Button>
          </div>
        </div>

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
          onImportComplete={(targetMonth) => {
            // インポート対象の月に切り替え
            if (targetMonth) {
              const targetDate = new Date(targetMonth.year, targetMonth.month - 1, 1)
              setCurrentDate(targetDate)
            }
            // データを再取得（同じ月の場合もあるので必ず呼び出す）
            scheduleTableProps.fetchSchedule?.()
          }}
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
              logger.log('コンテキストメニュー:', {
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
                    // その日付で既に使用されている臨時会場を確認
                    const usedVenueIds = temporaryVenues
                      .filter(v => v.temporary_dates?.includes(event.date))
                      .map(v => v.id)
                    
                    // まだ使用されていない最初の臨時会場を選択
                    const nextVenue = availableVenues.find(v => !usedVenueIds.includes(v.id))
                    
                    if (nextVenue) {
                      addTemporaryVenue(event.date, nextVenue.id)
                    } else {
                      showToast.warning('すべての臨時会場が使用されています')
                    }
                    
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '臨時会場を削除',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: () => {
                    if (confirm(`${event.date}から臨時会場を削除しますか？`)) {
                      removeTemporaryVenue(event.date, event.venue)
                    }
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
                    logger.log('🔵 公演を追加クリック:', { date, venue, timeSlot })
                    logger.log('🔵 modals:', modals)
                    logger.log('🔵 modals.performance:', modals.performance)
                    logger.log('🔵 modals.performance のキー:', modals.performance ? Object.keys(modals.performance) : 'undefined')
                    if (modals.performance && modals.performance.handleOpenPerformanceModal) {
                      modals.performance.handleOpenPerformanceModal(date, venue, timeSlot)
                      modals.contextMenu.setContextMenu(null)
                    } else {
                      logger.error('❌ modals.performance.handleOpenPerformanceModal が見つかりません')
                      logger.error('❌ 利用可能なキー:', modals.performance ? Object.keys(modals.performance) : 'なし')
                    }
                  },
                  separator: true
                },
                {
                  label: '臨時会場を追加',
                  icon: <Plus className="w-4 h-4" />,
                  onClick: () => {
                    // その日付で既に使用されている臨時会場を確認
                    const usedVenueIds = temporaryVenues
                      .filter(v => v.temporary_dates?.includes(date))
                      .map(v => v.id)
                    
                    // まだ使用されていない最初の臨時会場を選択
                    const nextVenue = availableVenues.find(v => !usedVenueIds.includes(v.id))
                    
                    if (nextVenue) {
                      addTemporaryVenue(date, nextVenue.id)
                    } else {
                      showToast.warning('すべての臨時会場が使用されています')
                    }
                    
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '臨時会場を削除',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: () => {
                    if (confirm(`${date}から臨時会場を削除しますか？`)) {
                      removeTemporaryVenue(date, venue)
                    }
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

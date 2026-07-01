// スケジュール管理 モーダル・ダイアログ群（遅延ロード＋右クリックメニュー）
// ScheduleManager/index.tsx から presentational 抽出（byte 逐語移送・挙動不変）
import React, { Suspense, lazy } from 'react'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { timeSlotEnToSchedule } from '@/lib/timeSlot'
import { getEventTimeSlot } from '@/utils/eventOperationUtils'

// Schedule Components（常時表示）
import { ContextMenu, Copy, Clipboard } from '@/components/schedule/ContextMenu'
import { ScheduleDialogs } from '@/components/schedule/ScheduleDialogs'
import { ExportRangeModal } from './ExportRangeModal'
import { FillSeatsModal, type FillSeatsCategory } from './FillSeatsModal'

// Schedule Modals（遅延ロード：開くまで不要）
const ConflictWarningModal = lazy(() => import('@/components/schedule/ConflictWarningModal').then(m => ({ default: m.ConflictWarningModal })))
const ImportScheduleModal = lazy(() => import('@/components/schedule/ImportScheduleModal').then(m => ({ default: m.ImportScheduleModal })))
const MoveOrCopyDialog = lazy(() => import('@/components/schedule/MoveOrCopyDialog').then(m => ({ default: m.MoveOrCopyDialog })))
const MoveCopyConfirmDialog = lazy(() => import('@/components/schedule/MoveCopyConfirmDialog').then(m => ({ default: m.MoveCopyConfirmDialog })))
const PerformanceModal = lazy(() => import('@/components/schedule/PerformanceModal').then(m => ({ default: m.PerformanceModal })))
const HistoryModal = lazy(() => import('@/components/schedule/modal/HistoryModal').then(m => ({ default: m.HistoryModal })))
const KitManagementDialog = lazy(() => import('./KitManagementDialog').then(m => ({ default: m.KitManagementDialog })))

// Icons
import { Ban, Edit, RotateCcw, Trash2, Plus, EyeOff, Eye, Clock, Calendar, UsersRound } from 'lucide-react'

// Types
import type { ScheduleEvent } from '@/types/schedule'
import type { useScheduleTable } from '@/hooks/useScheduleTable'
import type { useTemporaryVenues } from '@/hooks/useTemporaryVenues'
import type { useBlockedSlots } from '@/hooks/useBlockedSlots'
import type { useCustomHolidays } from '@/hooks/useCustomHolidays'
import type { useOrganization } from '@/hooks/useOrganization'

type HistoryModalState = {
  isOpen: boolean
  cellInfo?: { date: string; storeId: string; timeSlot: string | null }
  title?: string
}

interface ScheduleModalsProps {
  modals: NonNullable<ReturnType<typeof useScheduleTable>['modals']>
  scheduleTableProps: ReturnType<typeof useScheduleTable>
  currentDate: Date
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>
  isExportModalOpen: boolean
  setIsExportModalOpen: React.Dispatch<React.SetStateAction<boolean>>
  handleExportRange: (startYM: string, endYM: string) => Promise<void>
  isExporting: boolean
  isFillSeatsModalOpen: boolean
  setIsFillSeatsModalOpen: React.Dispatch<React.SetStateAction<boolean>>
  handleFillAllSeats: (params: { startDate: string; endDate: string; categories: FillSeatsCategory[] }) => Promise<void>
  isFillingSeats: boolean
  isImportModalOpen: boolean
  setIsImportModalOpen: React.Dispatch<React.SetStateAction<boolean>>
  temporaryVenues: ReturnType<typeof useTemporaryVenues>['temporaryVenues']
  availableVenues: ReturnType<typeof useTemporaryVenues>['availableVenues']
  addTemporaryVenue: ReturnType<typeof useTemporaryVenues>['addTemporaryVenue']
  removeTemporaryVenue: ReturnType<typeof useTemporaryVenues>['removeTemporaryVenue']
  updateVenueName: ReturnType<typeof useTemporaryVenues>['updateVenueName']
  getVenueNameForDate: ReturnType<typeof useTemporaryVenues>['getVenueNameForDate']
  historyModal: HistoryModalState
  setHistoryModal: React.Dispatch<React.SetStateAction<HistoryModalState>>
  handleFillSeatsForEvent: (event: ScheduleEvent) => Promise<void>
  isSlotBlocked: ReturnType<typeof useBlockedSlots>['isSlotBlocked']
  blockSlot: ReturnType<typeof useBlockedSlots>['blockSlot']
  unblockSlot: ReturnType<typeof useBlockedSlots>['unblockSlot']
  isCustomHoliday: ReturnType<typeof useCustomHolidays>['isCustomHoliday']
  toggleHoliday: ReturnType<typeof useCustomHolidays>['toggleHoliday']
  organizationId: ReturnType<typeof useOrganization>['organizationId']
  isKitManagementOpen: boolean
  setIsKitManagementOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function ScheduleModals({
  modals,
  scheduleTableProps,
  currentDate,
  setCurrentDate,
  isExportModalOpen,
  setIsExportModalOpen,
  handleExportRange,
  isExporting,
  isFillSeatsModalOpen,
  setIsFillSeatsModalOpen,
  handleFillAllSeats,
  isFillingSeats,
  isImportModalOpen,
  setIsImportModalOpen,
  temporaryVenues,
  availableVenues,
  addTemporaryVenue,
  removeTemporaryVenue,
  updateVenueName,
  getVenueNameForDate,
  historyModal,
  setHistoryModal,
  handleFillSeatsForEvent,
  isSlotBlocked,
  blockSlot,
  unblockSlot,
  isCustomHoliday,
  toggleHoliday,
  organizationId,
  isKitManagementOpen,
  setIsKitManagementOpen,
}: ScheduleModalsProps) {
  return (
      <Suspense fallback={null}>
      <PerformanceModal
        isOpen={modals.performanceModal.isOpen}
        onClose={modals.performanceModal.onClose}
        onSave={modals.performanceModal.onSave}
        mode={modals.performanceModal.mode}
        event={modals.performanceModal.event}
        initialData={modals.performanceModal.initialData}
        stores={modals.performanceModal.stores}
        scenarios={modals.performanceModal.scenarios}
        staff={modals.performanceModal.staff}
        events={scheduleTableProps.events}
        availableStaffByScenario={modals.performanceModal.availableStaffByScenario}
        allAvailableStaff={modals.performanceModal.allAvailableStaff}
        onParticipantChange={modals.performanceModal.onParticipantChange}
        onDeleteEvent={modals.performanceModal.onDeleteEvent}
      />

      <ExportRangeModal
        open={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportRange}
        isExporting={isExporting}
        defaultYear={currentDate.getFullYear()}
        defaultMonth={currentDate.getMonth() + 1}
      />

      <FillSeatsModal
        open={isFillSeatsModalOpen}
        onClose={() => setIsFillSeatsModalOpen(false)}
        onConfirm={async (params) => {
          setIsFillSeatsModalOpen(false)
          await handleFillAllSeats(params)
        }}
        isProcessing={isFillingSeats}
        defaultYear={currentDate.getFullYear()}
        defaultMonth={currentDate.getMonth() + 1}
      />

      <ImportScheduleModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentDisplayDate={currentDate}
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
        deleteCancelPrompt={modals.scheduleDialogs.deleteCancelPrompt}
        onResolveDeleteCancelPrompt={modals.scheduleDialogs.onResolveDeleteCancelPrompt}
        cancelEventPrompt={modals.scheduleDialogs.cancelEventPrompt}
        onResolveCancelEventPrompt={modals.scheduleDialogs.onResolveCancelEventPrompt}
        isRestoreDialogOpen={modals.scheduleDialogs.isRestoreDialogOpen ?? false}
        onCloseRestoreDialog={modals.scheduleDialogs.onCloseRestoreDialog ?? (() => {})}
        onConfirmRestore={modals.scheduleDialogs.onConfirmRestore ?? (() => {})}
      />

      <MoveOrCopyDialog
        isOpen={modals.moveOrCopyDialog.isOpen}
        onClose={modals.moveOrCopyDialog.onClose}
        onMove={modals.moveOrCopyDialog.onMove}
        onCopy={modals.moveOrCopyDialog.onCopy}
        eventInfo={modals.moveOrCopyDialog.selectedEvent ? {
          scenario: modals.moveOrCopyDialog.selectedEvent.scenario || '',
          date: modals.moveOrCopyDialog.selectedEvent.date || '',
          storeName: modals.moveOrCopyDialog.stores.find((s: { id: string; name: string }) => s.id === modals.moveOrCopyDialog.selectedEvent?.venue)?.name || '',
          timeSlot: (() => {
            const hour = parseInt(modals.moveOrCopyDialog.selectedEvent.start_time.split(':')[0])
            if (hour < 12) return 'morning'
            if (hour < 17) return 'afternoon'
            return 'evening'
          })()
        } : null}
      />

      <MoveCopyConfirmDialog
        prompt={modals.moveCopyConfirm.prompt}
        onResolve={modals.moveCopyConfirm.onResolve}
      />

      <MoveCopyConfirmDialog
        prompt={modals.pasteConfirm.prompt}
        onResolve={modals.pasteConfirm.onResolve}
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
                  }
                },
                {
                  label: '公演名をコピー',
                  icon: <Clipboard className="w-4 h-4" />,
                  onClick: () => {
                    const scenarioText = event.scenario || '未設定'
                    navigator.clipboard.writeText(scenarioText)
                    showToast.success('公演名をコピーしました')
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '履歴を表示',
                  icon: <Clock className="w-4 h-4" />,
                  onClick: () => {
                    const stores = scheduleTableProps.viewConfig.stores
                    const storeId = event.store_id || event.venue
                    const storeName = stores.find(s => s.id === storeId)?.name || event.venue
                    // 承認済み貸切などは time_slot が NULL のため、履歴の書き込み側と
                    // 同じ導出（開始時刻→朝/昼/夜）で検索キーを揃える（揃えないと
                    // 「夜」で記録された履歴が「時間帯なし」検索でヒットしない）
                    const derivedTimeSlot = event.time_slot || timeSlotEnToSchedule(getEventTimeSlot(event))
                    setHistoryModal({
                      isOpen: true,
                      cellInfo: { date: event.date, storeId, timeSlot: derivedTimeSlot },
                      title: `${event.date} ${storeName}${derivedTimeSlot ? ' ' + derivedTimeSlot : ''} の更新履歴`
                    })
                    modals.contextMenu.setContextMenu(null)
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
                  },
                  ...((['open', 'private', 'gmtest', 'trip', 'package'] as string[]).includes(event.category) ? [
                    {
                      label: '満席にする',
                      icon: <UsersRound className="w-4 h-4" />,
                      onClick: async () => {
                        modals.contextMenu.setContextMenu(null)
                        await handleFillSeatsForEvent(event)
                      }
                    }
                  ] : []),
                ]),
                // 仮状態切替
                {
                  label: event.is_tentative ? '公開する' : '仮状態にする',
                  icon: event.is_tentative ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />,
                  onClick: async () => {
                    try {
                      await scheduleTableProps.eventHandlers.onToggleTentative(event)
                      showToast.success(event.is_tentative ? '公開しました' : '仮状態にしました')
                    } catch (error) {
                      showToast.error('更新に失敗しました')
                    }
                    modals.contextMenu.setContextMenu(null)
                  }
                },
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
                    // eslint-disable-next-line no-alert, no-restricted-globals
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
              
              // 既存の公演があるかチェック（公演追加のグレーアウト用）
              const contextTimeSlot = timeSlot === 'morning' ? 'morning' : timeSlot === 'afternoon' ? 'afternoon' : 'evening'
              const hasExisting = modals.contextMenu.hasExistingEvent?.(date, venue, contextTimeSlot) ?? false
              
              // 募集中止されているかチェック
              const isBlocked = isSlotBlocked(date, venue, contextTimeSlot)
              
              // 公演追加不可の条件: 既存公演あり OR 募集中止
              const cannotAddPerformance = hasExisting || isBlocked
              const addLabel = isBlocked ? '公演を追加（募集中止）' : hasExisting ? '公演を追加（既存あり）' : '公演を追加'
              
              return [
                {
                  label: addLabel,
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
                  disabled: cannotAddPerformance,
                  separator: true
                },
                {
                  label: isBlocked ? '募集を再開' : '募集を中止',
                  icon: isBlocked ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />,
                  onClick: () => {
                    if (isBlocked) {
                      unblockSlot(date, venue, contextTimeSlot)
                      showToast.success('募集を再開しました')
                    } else {
                      blockSlot(date, venue, contextTimeSlot)
                      showToast.success('募集を中止しました')
                    }
                    modals.contextMenu.setContextMenu(null)
                  }
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
                      // 会場名を入力してもらう
                      // eslint-disable-next-line no-alert
                      const customName = window.prompt('臨時会場の名前を入力してください（例: スペースマーケット渋谷）', '')
                      // キャンセル時は追加しない
                      if (customName === null) {
                        modals.contextMenu.setContextMenu(null)
                        return
                      }
                      addTemporaryVenue(date, nextVenue.id, customName || undefined)
                    } else {
                      showToast.warning('すべての臨時会場が使用されています')
                    }
                    
                    modals.contextMenu.setContextMenu(null)
                  }
                },
                {
                  label: '臨時会場名を変更',
                  icon: <Edit className="w-4 h-4" />,
                  onClick: () => {
                    const currentName = getVenueNameForDate(venue, date)
                    // eslint-disable-next-line no-alert
                    const newName = window.prompt('新しい会場名を入力してください', currentName)
                    if (newName !== null && newName !== currentName) {
                      updateVenueName(date, venue, newName)
                    }
                    modals.contextMenu.setContextMenu(null)
                  },
                  disabled: !isTemporaryVenue
                },
                {
                  label: '臨時会場を削除',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: () => {
                    // eslint-disable-next-line no-alert, no-restricted-globals
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
                  disabled: !modals.contextMenu.clipboardEvent || venue === '',
                  separator: true
                },
                {
                  label: '履歴を表示',
                  icon: <Clock className="w-4 h-4" />,
                  onClick: () => {
                    const dbTimeSlotMap: Record<string, string> = { 'morning': '朝', 'afternoon': '昼', 'evening': '夜' }
                    const stores = scheduleTableProps.viewConfig.stores
                    const storeName = stores.find(s => s.id === venue)?.name || venue
                    const timeSlotLabel = dbTimeSlotMap[timeSlot] || ''
                    setHistoryModal({
                      isOpen: true,
                      cellInfo: { date, storeId: venue, timeSlot: dbTimeSlotMap[timeSlot] || null },
                      title: `${date} ${storeName} ${timeSlotLabel} の更新履歴`
                    })
                    modals.contextMenu.setContextMenu(null)
                  },
                  disabled: venue === ''
                }
              ]
            })() : modals.contextMenu.contextMenu.type === 'date' && modals.contextMenu.contextMenu.dateInfo ? (() => {
              // 日付セルの右クリックメニュー
              const { date } = modals.contextMenu.contextMenu!.dateInfo!
              const isHoliday = isCustomHoliday(date)
              
              return [
                {
                  label: isHoliday ? '休日設定を解除' : '休日に設定',
                  icon: <Calendar className="w-4 h-4" />,
                  onClick: async () => {
                    await toggleHoliday(date)
                    modals.contextMenu.setContextMenu(null)
                  }
                }
              ]
            })() : []}
        />
      )}

      {/* 履歴モーダル */}
      <HistoryModal
        isOpen={historyModal.isOpen}
        onClose={() => setHistoryModal({ isOpen: false })}
        cellInfo={historyModal.cellInfo}
        organizationId={organizationId || undefined}
        title={historyModal.title}
        stores={modals.performanceModal.stores}
        scenarios={modals.performanceModal.scenarios}
        staff={modals.performanceModal.staff}
      />

      {/* キット配置管理ダイアログ */}
      <KitManagementDialog
        isOpen={isKitManagementOpen}
        onClose={() => setIsKitManagementOpen(false)}
      />
      </Suspense>
  )
}

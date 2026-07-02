/**
 * スケジュールテーブル共通フック
 * 
 * ScheduleTableコンポーネントで必要な全ての状態・ハンドラーを提供する汎用フック
 * 各ページで独自のカスタマイズが可能
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useScheduleData } from './useScheduleData'
import { useShiftData } from './useShiftData'
import { useMemoManager } from './useMemoManager'
import { useEventOperations } from './useEventOperations'
import { useContextMenuActions } from './useContextMenuActions'
import { useScheduleEvents } from '@/pages/ScheduleManager/hooks/useScheduleEvents'
import { CATEGORY_CONFIG, getReservationBadgeClass } from '@/utils/scheduleUtils'
import { generateMonthDays } from '@/utils/scheduleUtils'
import { computeIntervalWarningEventIds } from '@/utils/intervalWarning'
import { computeKitWarningEventIds } from '@/utils/scheduleWarnings'
import { kitApi } from '@/lib/api/kitApi'
import { logger } from '@/utils/logger'
import type {
  ScheduleTableViewConfig,
  ScheduleTableDataProvider,
  ScheduleTableEventHandlers,
  ScheduleTableDisplayConfig,
  ScheduleTableProps
} from '@/components/schedule/ScheduleTable'
import type { KitLocation } from '@/types'

interface UseScheduleTableOptions {
  currentDate: Date
  // オプション：カスタマイズ用
  customCategoryConfig?: typeof CATEGORY_CONFIG
  customReservationBadgeClass?: (current: number, max: number) => string
  // 将来的な拡張用
  viewMode?: 'monthly' | 'weekly' | 'daily'
}

/**
 * スケジュールテーブルの全機能を提供する共通フック
 */
export function useScheduleTable(options: UseScheduleTableOptions): ScheduleTableProps {
  const { currentDate, customCategoryConfig, customReservationBadgeClass } = options

  // データ取得
  const scheduleData = useScheduleData(currentDate)
  const shiftDataHook = useShiftData(currentDate, scheduleData.staff, scheduleData.staffLoading)
  const memoManager = useMemoManager(currentDate)

  // 分割代入
  const { 
    events, 
    setEvents, 
    stores, 
    scenarios, 
    staff,
    fetchSchedule
  } = scheduleData
  
  const shiftData = useMemo(() => shiftDataHook?.shiftData ?? {}, [shiftDataHook?.shiftData])
  const { handleSaveMemo, getMemo } = memoManager
  const [kitLocations, setKitLocations] = useState<KitLocation[] | null>(null)

  const loadKitLocations = useCallback(async () => {
    try {
      const locations = await kitApi.getKitLocations()
      setKitLocations(locations)
    } catch (error) {
      logger.error('キット配置データの読み込みエラー:', error)
      setKitLocations([])
    }
  }, [])

  useEffect(() => {
    void loadKitLocations()
  }, [loadKitLocations])

  // イベント操作
  const eventOperations = useEventOperations({
    events,
    setEvents,
    stores,
    scenarios,
    fetchSchedule
  })

  // コンテキストメニュー操作
  const contextMenuActions = useContextMenuActions({
    events,
    stores,
    setEvents
  })

  // 月間の日付リストを生成
  const monthDays = useMemo(() => generateMonthDays(currentDate), [currentDate])

  // イベント取得ロジック（1 回だけ: getEventsForSlot とモーダル用メモを共有）
  const { getEventsForSlot, availableStaffByScenario, allAvailableStaff } = useScheduleEvents(
    events,
    'all', // カテゴリーフィルターなし（全体表示）
    scenarios,
    shiftData,
    eventOperations,
    stores
  )

  // ViewConfig
  const viewConfig: ScheduleTableViewConfig = useMemo(() => ({
    currentDate,
    monthDays,
    stores
  }), [currentDate, monthDays, stores])

  // 同日同店舗で間隔 60 分未満の公演 ID セット（赤ボーダー警告用）
  const intervalWarningEventIds = useMemo(
    () => computeIntervalWarningEventIds(events),
    [events]
  )

  const kitWarningEventIds = useMemo(
    () => kitLocations
      ? computeKitWarningEventIds(events, kitLocations, stores)
      : new Set<string>(),
    [events, kitLocations, stores]
  )

  // DataProvider
  const dataProvider: ScheduleTableDataProvider = useMemo(() => ({
    getEventsForSlot,
    shiftData,
    getMemo,
    onSaveMemo: handleSaveMemo,
    intervalWarningEventIds,
    kitWarningEventIds,
  }), [getEventsForSlot, shiftData, getMemo, handleSaveMemo, intervalWarningEventIds, kitWarningEventIds])

  const fetchScheduleWithKitLocations = useCallback(() => {
    void fetchSchedule()
    void loadKitLocations()
  }, [fetchSchedule, loadKitLocations])

  // EventHandlers
  // 依存は eventOperations / contextMenuActions オブジェクト全体ではなく、実際に使う
  // 各ハンドラー（すべてサブフック側で useCallback 済み）にする。オブジェクト全体を
  // 依存にすると、フックが毎レンダー新規オブジェクトを返すため、中身のハンドラーが
  // 不変でも eventHandlers ごと再生成され、下流の React.memo（TimeSlotCell/
  // PerformanceCard）が無効化されていた（P7）。
  const {
    handleAddPerformance,
    handleEditPerformance,
    handleDeletePerformance,
    handleCancelConfirmPerformance,
    handleUncancelPerformance,
    handleToggleTentative,
    handleToggleReservation,
    handleDrop,
  } = eventOperations
  const {
    handleCellContextMenu,
    handleEventContextMenu,
    handleDateContextMenu,
  } = contextMenuActions

  const eventHandlers: ScheduleTableEventHandlers = useMemo(() => ({
    onAddPerformance: handleAddPerformance,
    onEditPerformance: handleEditPerformance,
    onDeletePerformance: handleDeletePerformance,
    onCancelConfirm: handleCancelConfirmPerformance,
    onUncancel: handleUncancelPerformance,
    onToggleTentative: handleToggleTentative,
    onToggleReservation: handleToggleReservation,
    onDrop: handleDrop,
    onContextMenuCell: handleCellContextMenu,
    onContextMenuEvent: handleEventContextMenu,
    onContextMenuDate: handleDateContextMenu
  }), [
    handleAddPerformance,
    handleEditPerformance,
    handleDeletePerformance,
    handleCancelConfirmPerformance,
    handleUncancelPerformance,
    handleToggleTentative,
    handleToggleReservation,
    handleDrop,
    handleCellContextMenu,
    handleEventContextMenu,
    handleDateContextMenu
  ])

  // DisplayConfig
  const displayConfig: ScheduleTableDisplayConfig = useMemo(() => ({
    categoryConfig: customCategoryConfig || CATEGORY_CONFIG,
    getReservationBadgeClass: customReservationBadgeClass || getReservationBadgeClass
  }), [customCategoryConfig, customReservationBadgeClass])

  return {
    viewConfig,
    dataProvider,
    eventHandlers,
    displayConfig,
    // モーダル用の追加情報
    modals: {
      performanceModal: {
        isOpen: eventOperations.isPerformanceModalOpen,
        onClose: eventOperations.handleCloseModal,
        onSave: eventOperations.handleSavePerformance,
        mode: eventOperations.modalMode,
        event: eventOperations.editingEvent,
        initialData: eventOperations.modalInitialData,
        stores,
        scenarios,
        staff,
        availableStaffByScenario,
        allAvailableStaff,
        onParticipantChange: eventOperations.handleParticipantChange,
        onDeleteEvent: eventOperations.deleteEventDirectly
      },
      // performance 用（コンテキストメニューから使用）
      performance: {
        handleOpenPerformanceModal: eventOperations.handleAddPerformance
      },
      conflictWarning: {
        isOpen: eventOperations.isConflictWarningOpen,
        onClose: () => eventOperations.setIsConflictWarningOpen(false),
        onContinue: eventOperations.handleConflictContinue,
        conflictInfo: eventOperations.conflictInfo
      },
      scheduleDialogs: {
        isDeleteDialogOpen: eventOperations.isDeleteDialogOpen,
        onCloseDeleteDialog: () => eventOperations.setIsDeleteDialogOpen(false),
        onConfirmDelete: eventOperations.handleConfirmDelete,
        // F-1: 有効予約のある公演削除時の予約キャンセル確認ダイアログ
        deleteCancelPrompt: eventOperations.deleteCancelPrompt,
        onResolveDeleteCancelPrompt: eventOperations.resolveDeleteCancelPrompt,
        // 中止も同型の2ステップ確認ダイアログを使用
        cancelEventPrompt: eventOperations.cancelEventPrompt,
        onResolveCancelEventPrompt: eventOperations.resolveCancelEventPrompt,
      },
      moveOrCopyDialog: {
        isOpen: eventOperations.isMoveOrCopyDialogOpen,
        onClose: () => eventOperations.setIsMoveOrCopyDialogOpen(false),
        onMove: eventOperations.handleMoveEvent,
        onCopy: eventOperations.handleCopyEvent,
        selectedEvent: eventOperations.draggedEvent,
        stores
      },
      moveCopyConfirm: {
        prompt: eventOperations.moveCopyConfirm,
        onResolve: eventOperations.resolveMoveCopyConfirm,
      },
      pasteConfirm: {
        prompt: contextMenuActions.moveCopyConfirm,
        onResolve: contextMenuActions.resolveMoveCopyConfirm,
      },
      contextMenu: {
        contextMenu: contextMenuActions.contextMenu,
        setContextMenu: contextMenuActions.setContextMenu,
        clipboardEvent: contextMenuActions.clipboardEvent,
        handleCopyToClipboard: contextMenuActions.handleCopyToClipboard,
        handlePasteFromClipboard: contextMenuActions.handlePasteFromClipboard,
        hasExistingEvent: contextMenuActions.hasExistingEvent
      }
    },
    fetchSchedule: fetchScheduleWithKitLocations,
    events: events
  }
}

/**
 * スケジュールテーブルのモーダル・ダイアログ用フック
 * ScheduleTableと一緒に使用するモーダル群を提供
 */
export function useScheduleTableModals(currentDate: Date) {
  const scheduleData = useScheduleData(currentDate)
  const shiftDataHook = useShiftData(currentDate, scheduleData.staff, scheduleData.staffLoading)
  
  const { events, setEvents, stores, scenarios, staff } = scheduleData
  const shiftData = shiftDataHook?.shiftData ?? {}
  
  const eventOperations = useEventOperations({
    events,
    setEvents,
    stores,
    scenarios
  })

  const contextMenuActions = useContextMenuActions({
    events,
    stores,
    setEvents
  })

  // イベント取得ロジック
  const { availableStaffByScenario } = useScheduleEvents(
    events,
    'all',
    scenarios,
    shiftData,
    eventOperations,
    stores
  )

  return {
    // PerformanceModal用
    performanceModal: {
      isOpen: eventOperations.isPerformanceModalOpen,
      onClose: eventOperations.handleCloseModal,
      onSave: eventOperations.handleSavePerformance,
      mode: eventOperations.modalMode,
      event: eventOperations.editingEvent,
      initialData: eventOperations.modalInitialData,
      stores,
      scenarios,
      staff,
      availableStaffByScenario,
      onParticipantChange: eventOperations.handleParticipantChange
    },
    // performance 用（コンテキストメニューから使用）
    performance: {
      handleOpenPerformanceModal: eventOperations.handleAddPerformance
    },
    // ConflictWarningModal用
    conflictWarning: {
      isOpen: eventOperations.isConflictWarningOpen,
      onClose: () => eventOperations.setIsConflictWarningOpen(false),
      onContinue: eventOperations.handleConflictContinue,
      conflictInfo: eventOperations.conflictInfo
    },
    // ScheduleDialogs用
    scheduleDialogs: {
      isDeleteDialogOpen: eventOperations.isDeleteDialogOpen,
      onCloseDeleteDialog: () => eventOperations.setIsDeleteDialogOpen(false),
      onConfirmDelete: eventOperations.handleConfirmDelete,
      // F-1: 有効予約のある公演削除時の予約キャンセル確認ダイアログ
      deleteCancelPrompt: eventOperations.deleteCancelPrompt,
      onResolveDeleteCancelPrompt: eventOperations.resolveDeleteCancelPrompt,
      // 中止も同型の2ステップ確認ダイアログを使用
      cancelEventPrompt: eventOperations.cancelEventPrompt,
      onResolveCancelEventPrompt: eventOperations.resolveCancelEventPrompt,
      // 復活機能はhandleUncancelPerformanceで直接実行される（ダイアログなし）
      // isRestoreDialogOpen: eventOperations.isRestoreDialogOpen,
      // onCloseRestoreDialog: () => eventOperations.setIsRestoreDialogOpen(false),
      // onConfirmRestore: eventOperations.handleConfirmRestore
    },
    // MoveOrCopyDialog用
    moveOrCopyDialog: {
      isOpen: eventOperations.isMoveOrCopyDialogOpen,
      onClose: () => eventOperations.setIsMoveOrCopyDialogOpen(false),
      onMove: eventOperations.handleMoveEvent,
      onCopy: eventOperations.handleCopyEvent,
      selectedEvent: eventOperations.draggedEvent,
      stores  // ScheduleManagerで使用するため含める
    },
    // 移動・複製の重複/間隔不足の確認ダイアログ（window.confirm の置き換え）
    moveCopyConfirm: {
      prompt: eventOperations.moveCopyConfirm,
      onResolve: eventOperations.resolveMoveCopyConfirm,
    },
    // ペースト先の重複確認ダイアログ
    pasteConfirm: {
      prompt: contextMenuActions.moveCopyConfirm,
      onResolve: contextMenuActions.resolveMoveCopyConfirm,
    },
    // ContextMenu用
    contextMenu: {
      contextMenu: contextMenuActions.contextMenu,
      setContextMenu: contextMenuActions.setContextMenu,
      clipboardEvent: contextMenuActions.clipboardEvent,
      handleCopyToClipboard: contextMenuActions.handleCopyToClipboard,
      handlePasteFromClipboard: contextMenuActions.handlePasteFromClipboard,
      hasExistingEvent: contextMenuActions.hasExistingEvent
    },
    // データ再取得用
    fetchSchedule: scheduleData.fetchSchedule
  }
}

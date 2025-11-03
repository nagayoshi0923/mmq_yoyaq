/**
 * スケジュールテーブル共通フック
 * 
 * ScheduleTableコンポーネントで必要な全ての状態・ハンドラーを提供する汎用フック
 * 各ページで独自のカスタマイズが可能
 */

import { useMemo } from 'react'
import { useScheduleData } from './useScheduleData'
import { useShiftData } from './useShiftData'
import { useMemoManager } from './useMemoManager'
import { useEventOperations } from './useEventOperations'
import { useContextMenuActions } from './useContextMenuActions'
import { useScheduleEvents } from '@/pages/ScheduleManager/hooks/useScheduleEvents'
import { CATEGORY_CONFIG, getReservationBadgeClass } from '@/utils/scheduleUtils'
import { generateMonthDays } from '@/utils/scheduleUtils'
import type {
  ScheduleTableViewConfig,
  ScheduleTableDataProvider,
  ScheduleTableEventHandlers,
  ScheduleTableDisplayConfig,
  ScheduleTableProps
} from '@/components/schedule/ScheduleTable'

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
  const memoManager = useMemoManager(currentDate, scheduleData.stores)

  // 分割代入
  const { 
    events, 
    setEvents, 
    stores, 
    scenarios, 
    staff,
    fetchSchedule
  } = scheduleData
  
  const shiftData = shiftDataHook?.shiftData ?? {}
  const { handleSaveMemo, getMemo } = memoManager

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
    stores,
    setEvents
  })

  // 月間の日付リストを生成
  const monthDays = useMemo(() => generateMonthDays(currentDate), [currentDate])

  // イベント取得ロジック
  const { getEventsForSlot } = useScheduleEvents(
    events,
    'all', // カテゴリーフィルターなし（全体表示）
    scenarios,
    shiftData,
    eventOperations
  )

  // ViewConfig
  const viewConfig: ScheduleTableViewConfig = useMemo(() => ({
    currentDate,
    monthDays,
    stores
  }), [currentDate, monthDays, stores])

  // DataProvider
  const dataProvider: ScheduleTableDataProvider = useMemo(() => ({
    getEventsForSlot,
    shiftData,
    getMemo,
    onSaveMemo: handleSaveMemo
  }), [getEventsForSlot, shiftData, getMemo, handleSaveMemo])

  // EventHandlers
  const eventHandlers: ScheduleTableEventHandlers = useMemo(() => ({
    onAddPerformance: eventOperations.handleAddPerformance,
    onEditPerformance: eventOperations.handleEditPerformance,
    onDeletePerformance: eventOperations.handleDeletePerformance,
    onCancelConfirm: eventOperations.handleCancelConfirmPerformance,
    onUncancel: eventOperations.handleUncancelPerformance,
    onToggleReservation: eventOperations.handleToggleReservation,
    onDrop: eventOperations.handleDrop,
    onContextMenuCell: contextMenuActions.handleCellContextMenu,
    onContextMenuEvent: contextMenuActions.handleEventContextMenu
  }), [eventOperations, contextMenuActions])

  // DisplayConfig
  const displayConfig: ScheduleTableDisplayConfig = useMemo(() => ({
    categoryConfig: customCategoryConfig || CATEGORY_CONFIG,
    getReservationBadgeClass: customReservationBadgeClass || getReservationBadgeClass
  }), [customCategoryConfig, customReservationBadgeClass])

  // モーダル関連の情報も含める
  const { availableStaffByScenario } = useScheduleEvents(
    events,
    'all',
    scenarios,
    shiftData,
    eventOperations
  )

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
        onParticipantChange: eventOperations.handleParticipantChange
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
        isCancelDialogOpen: eventOperations.isCancelDialogOpen,
        onCloseCancelDialog: () => eventOperations.setIsCancelDialogOpen(false),
        onConfirmCancel: eventOperations.handleConfirmCancel,
        // 復活機能はhandleUncancelPerformanceで直接実行される（ダイアログなし）
        // isRestoreDialogOpen: eventOperations.isRestoreDialogOpen,
        // onCloseRestoreDialog: () => eventOperations.setIsRestoreDialogOpen(false),
        // onConfirmRestore: eventOperations.handleConfirmRestore
      },
      moveOrCopyDialog: {
        isOpen: eventOperations.isMoveOrCopyDialogOpen,
        onClose: () => eventOperations.setIsMoveOrCopyDialogOpen(false),
        onMove: eventOperations.handleMoveEvent,
        onCopy: eventOperations.handleCopyEvent,
        selectedEvent: eventOperations.draggedEvent,
        stores
      },
      contextMenu: {
        contextMenu: contextMenuActions.contextMenu,
        setContextMenu: contextMenuActions.setContextMenu,
        clipboardEvent: contextMenuActions.clipboardEvent,
        handleCopyToClipboard: contextMenuActions.handleCopyToClipboard,
        handlePasteFromClipboard: contextMenuActions.handlePasteFromClipboard
      }
    },
    fetchSchedule: fetchSchedule
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
    stores,
    setEvents
  })

  // イベント取得ロジック
  const { availableStaffByScenario } = useScheduleEvents(
    events,
    'all',
    scenarios,
    shiftData,
    eventOperations
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
      isCancelDialogOpen: eventOperations.isCancelDialogOpen,
      onCloseCancelDialog: () => eventOperations.setIsCancelDialogOpen(false),
      onConfirmCancel: eventOperations.handleConfirmCancel,
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
    // ContextMenu用
    contextMenu: {
      contextMenu: contextMenuActions.contextMenu,
      setContextMenu: contextMenuActions.setContextMenu,
      clipboardEvent: contextMenuActions.clipboardEvent,
      handleCopyToClipboard: contextMenuActions.handleCopyToClipboard,
      handlePasteFromClipboard: contextMenuActions.handlePasteFromClipboard
    },
    // データ再取得用
    fetchSchedule: scheduleData.fetchSchedule
  }
}


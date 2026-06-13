// 公演の追加・編集・削除・中止・復活などの操作を管理

import { useOrganization } from '@/hooks/useOrganization'
import { useTimeSlotSettings } from '@/hooks/useTimeSlotSettings'
import { useEventDelete } from '@/hooks/eventOperations/useEventDelete'
import { useEventCancel } from '@/hooks/eventOperations/useEventCancel'
import { useEventMisc } from '@/hooks/eventOperations/useEventMisc'
import { useEventModalState } from '@/hooks/eventOperations/useEventModalState'
import { useEventMoveCopy } from '@/hooks/eventOperations/useEventMoveCopy'
import { useEventSave } from '@/hooks/eventOperations/useEventSave'
import type { ScheduleEvent } from '@/types/schedule'

interface Store {
  id: string
  name: string
  short_name: string
  is_temporary?: boolean
}

interface Scenario {
  id: string
  title: string
  duration?: number
  player_count_max?: number
  extra_preparation_time?: number // 準備時間（分）
  scenario_master_id?: string | null
}

interface UseEventOperationsProps {
  events: ScheduleEvent[]
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  stores: Store[]
  scenarios: Scenario[]
  fetchSchedule?: () => Promise<void>
}

export function useEventOperations({
  events,
  setEvents,
  stores,
  scenarios,
  fetchSchedule
}: UseEventOperationsProps) {
  // 組織IDを取得（マルチテナント対応）
  const { organizationId } = useOrganization()
  
  // 公演時間帯設定を取得（組織設定から）
  const { getSlotDefaults } = useTimeSlotSettings()

  const {
    isPerformanceModalOpen,
    setIsPerformanceModalOpen,
    modalMode,
    modalInitialData,
    editingEvent,
    setEditingEvent,
    draggedEvent,
    setDraggedEvent,
    dropTarget,
    setDropTarget,
    isMoveOrCopyDialogOpen,
    setIsMoveOrCopyDialogOpen,
    handleAddPerformance,
    handleEditPerformance,
    handleCloseModal,
    handleDrop,
  } = useEventModalState({ events })
  
  // 削除ダイアログ状態
  // 削除操作はサブフックへ分割（Phase 4-3）
  const {
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    deletingEvent,
    handleDeletePerformance,
    handleConfirmDelete,
    deleteEventDirectly,
    deleteCancelPrompt,
    resolveDeleteCancelPrompt,
  } = useEventDelete({ setEvents, organizationId, fetchSchedule })

  // 中止ダイアログ状態
  // 中止・復活操作はサブフックへ分割（Phase 4-3）
  const {
    handleCancelConfirmPerformance,
    handleUncancelPerformance,
    cancelEventPrompt,
    resolveCancelEventPrompt,
  } = useEventCancel({ setEvents, organizationId, fetchSchedule })
  
  const {
    isPublishDialogOpen,
    publishingEvent,
    setIsPublishDialogOpen,
    handleToggleTentative,
    handleToggleReservation,
    handleConfirmPublishToggle,
    handleConvertToMemo,
    handleParticipantChange,
  } = useEventMisc({ setEvents, organizationId, fetchSchedule })
  
  // 移動・複製操作はサブフックへ分割（Phase 4-3）
  const {
    handleMoveEvent,
    handleCopyEvent,
  } = useEventMoveCopy({
    events,
    setEvents,
    stores,
    scenarios,
    organizationId,
    getSlotDefaults,
    draggedEvent,
    dropTarget,
    setDraggedEvent,
    setDropTarget,
  })

  // 保存・重複チェックフローはサブフックへ分割（Phase 4-3・最高リスクのため最後に分離）
  const {
    isConflictWarningOpen,
    conflictInfo,
    pendingPerformanceData,
    setIsConflictWarningOpen,
    setConflictInfo,
    setPendingPerformanceData,
    handleSavePerformance,
    handleConflictContinue,
  } = useEventSave({
    events,
    setEvents,
    stores,
    scenarios,
    modalMode,
    organizationId,
    fetchSchedule,
    setEditingEvent,
    setIsPerformanceModalOpen,
  })

  return {
    // モーダル状態
    isPerformanceModalOpen,
    modalMode,
    modalInitialData,
    editingEvent,
    
    // 削除ダイアログ状態
    isDeleteDialogOpen,
    deletingEvent,

    // 公開ダイアログ状態
    isPublishDialogOpen,
    publishingEvent,
    
    // 重複警告ダイアログ状態
    isConflictWarningOpen,
    conflictInfo,
    pendingPerformanceData,

    // ドラッグ&ドロップ状態
    draggedEvent,
    dropTarget,
    isMoveOrCopyDialogOpen,
    setIsMoveOrCopyDialogOpen,
    
    // ハンドラー
    handleAddPerformance,
    handleEditPerformance,
    handleCloseModal,
    handleDrop,
    handleMoveEvent,
    handleCopyEvent,
    handleSavePerformance,
    handleDeletePerformance,
    handleConfirmDelete,
    deleteEventDirectly,
    deleteCancelPrompt,
    resolveDeleteCancelPrompt,
    handleCancelConfirmPerformance,
    handleUncancelPerformance,
    cancelEventPrompt,
    resolveCancelEventPrompt,
    handleToggleTentative,
    handleToggleReservation,
    handleConfirmPublishToggle,
    handleConflictContinue,
    handleConvertToMemo,
    
    // ダイアログクローズ
    setIsDeleteDialogOpen,
    setIsPublishDialogOpen,
    setIsConflictWarningOpen,
    setConflictInfo,
    setPendingPerformanceData,
    
    // 参加者数変更ハンドラー
    handleParticipantChange
  }
}

// スケジュール管理の各種ダイアログ

import { memo } from 'react'
import { ConfirmModal } from '@/components/patterns/modal'

interface ScheduleDialogsProps {
  // 削除ダイアログ
  isDeleteDialogOpen: boolean
  onCloseDeleteDialog: () => void
  onConfirmDelete: () => void

  // 中止ダイアログ
  isCancelDialogOpen: boolean
  onCloseCancelDialog: () => void
  onConfirmCancel: () => void

  // 復活ダイアログ
  isRestoreDialogOpen: boolean
  onCloseRestoreDialog: () => void
  onConfirmRestore: () => void
}

export const ScheduleDialogs = memo(function ScheduleDialogs({
  isDeleteDialogOpen,
  onCloseDeleteDialog,
  onConfirmDelete,
  isCancelDialogOpen,
  onCloseCancelDialog,
  onConfirmCancel,
  isRestoreDialogOpen,
  onCloseRestoreDialog,
  onConfirmRestore
}: ScheduleDialogsProps) {
  return (
    <>
      {/* 削除確認ダイアログ */}
      <ConfirmModal
        open={isDeleteDialogOpen}
        onClose={onCloseDeleteDialog}
        onConfirm={onConfirmDelete}
        title="公演を削除"
        message="この公演を削除してもよろしいですか？この操作は取り消せません。"
        variant="danger"
        confirmLabel="削除"
      />

      {/* 中止確認ダイアログ */}
      <ConfirmModal
        open={isCancelDialogOpen}
        onClose={onCloseCancelDialog}
        onConfirm={onConfirmCancel}
        title="公演を中止"
        message="この公演を中止してもよろしいですか？中止後も復活させることができます。"
        variant="warning"
        confirmLabel="中止"
      />
      
      {/* 復活確認ダイアログ */}
      <ConfirmModal
        open={isRestoreDialogOpen}
        onClose={onCloseRestoreDialog}
        onConfirm={onConfirmRestore}
        title="公演を復活"
        message="この公演を復活してもよろしいですか？"
        variant="default"
        confirmLabel="復活"
      />
    </>
  )
})

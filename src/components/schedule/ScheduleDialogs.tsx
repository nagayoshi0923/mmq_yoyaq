// スケジュール管理の各種ダイアログ

import { memo } from 'react'
import { ConfirmModal } from '@/components/patterns/modal'
import {
  DeleteEventCancelDialog,
  type DeleteCancelPrompt,
  type DeleteCancelDecision,
} from '@/components/schedule/DeleteEventCancelDialog'

interface ScheduleDialogsProps {
  // 削除ダイアログ
  isDeleteDialogOpen: boolean
  onCloseDeleteDialog: () => void
  onConfirmDelete: () => void

  // F-1: 有効予約のある公演削除時の予約キャンセル確認ダイアログ
  deleteCancelPrompt?: DeleteCancelPrompt | null
  onResolveDeleteCancelPrompt?: (decision: DeleteCancelDecision | null) => void

  // 中止: 有効予約がある場合の2ステップ確認ダイアログ（F-1 と同型。
  // 予約ゼロの中止は確認なしで即実行されるためダイアログ自体が無い）
  cancelEventPrompt?: DeleteCancelPrompt | null
  onResolveCancelEventPrompt?: (decision: DeleteCancelDecision | null) => void

  // 復活ダイアログ
  isRestoreDialogOpen: boolean
  onCloseRestoreDialog: () => void
  onConfirmRestore: () => void
}

export const ScheduleDialogs = memo(function ScheduleDialogs({
  isDeleteDialogOpen,
  onCloseDeleteDialog,
  onConfirmDelete,
  deleteCancelPrompt,
  onResolveDeleteCancelPrompt,
  cancelEventPrompt,
  onResolveCancelEventPrompt,
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

      {/* F-1: 有効予約のある公演削除時の予約キャンセル確認ダイアログ
          （①キャンセル確認 → ②メール送信確認 の2ステップ） */}
      {onResolveDeleteCancelPrompt && (
        <DeleteEventCancelDialog
          prompt={deleteCancelPrompt ?? null}
          onResolve={onResolveDeleteCancelPrompt}
        />
      )}

      {/* 中止も同型の2ステップ確認ダイアログ（variant: 'cancel'） */}
      {onResolveCancelEventPrompt && (
        <DeleteEventCancelDialog
          prompt={cancelEventPrompt ?? null}
          onResolve={onResolveCancelEventPrompt}
        />
      )}

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

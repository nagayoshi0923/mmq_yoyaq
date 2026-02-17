// スケジュール管理の各種ダイアログ

import { memo } from 'react'
import { ConfirmModal } from '@/components/patterns/modal'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface ScheduleDialogsProps {
  // 削除ダイアログ
  isDeleteDialogOpen: boolean
  onCloseDeleteDialog: () => void
  onConfirmDelete: () => void

  // 中止ダイアログ
  isCancelDialogOpen: boolean
  onCloseCancelDialog: () => void
  onConfirmCancel: () => void
  cancellationReason?: string
  onCancellationReasonChange?: (reason: string) => void

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
  cancellationReason = '',
  onCancellationReasonChange,
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
      >
        <div className="mt-4 space-y-2">
          <Label htmlFor="cancellation-reason" className="text-sm font-medium">
            中止理由（任意）
          </Label>
          <Textarea
            id="cancellation-reason"
            placeholder="中止理由をご入力ください（予約者へのメールに記載されます）"
            value={cancellationReason}
            onChange={(e) => onCancellationReasonChange?.(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            未入力の場合はデフォルトメッセージが送信されます
          </p>
        </div>
      </ConfirmModal>
      
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

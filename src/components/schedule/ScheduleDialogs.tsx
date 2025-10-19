// スケジュール管理の各種ダイアログ

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => !open && onCloseDeleteDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>公演を削除</DialogTitle>
            <DialogDescription>
              この公演を削除してもよろしいですか？この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onCloseDeleteDialog}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={onConfirmDelete}>
              削除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 中止確認ダイアログ */}
      <Dialog open={isCancelDialogOpen} onOpenChange={(open) => !open && onCloseCancelDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>公演を中止</DialogTitle>
            <DialogDescription>
              この公演を中止してもよろしいですか？中止後も復活させることができます。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onCloseCancelDialog}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={onConfirmCancel}>
              中止
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* 復活確認ダイアログ */}
      <Dialog open={isRestoreDialogOpen} onOpenChange={(open) => !open && onCloseRestoreDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>公演を復活</DialogTitle>
            <DialogDescription>
              この公演を復活してもよろしいですか？
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onCloseRestoreDialog}>
              キャンセル
            </Button>
            <Button onClick={onConfirmRestore}>
              復活
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})

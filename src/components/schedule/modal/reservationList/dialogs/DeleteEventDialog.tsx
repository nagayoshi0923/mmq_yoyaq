/**
 * 貸切公演の削除確認ダイアログ（ReservationList から子コンポーネント抽出・挙動不変）。
 * JSX は元 ReservationList の該当ブロックを逐語移植し、インライン処理は親の onConfirm へ持ち上げ。
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DeleteEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClose: () => void
  isDeleting: boolean
  onConfirm: () => void
}

export function DeleteEventDialog({ open, onOpenChange, onClose, isDeleting, onConfirm }: DeleteEventDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>貸切公演を削除しますか？</DialogTitle>
          <DialogDescription>
            全ての参加者がキャンセルされました。この貸切公演自体を削除しますか？
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            「削除する」を選択すると、この貸切公演がスケジュールから完全に削除されます。
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
          >
            削除しない
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? '削除中...' : '削除する'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

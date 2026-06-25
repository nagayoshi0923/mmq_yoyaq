/**
 * 公演削除確認ダイアログ（PerformanceModal から子コンポーネント抽出・挙動不変）。
 * フッターの「この予定を削除」から開く最終確認。
 * JSX は元 PerformanceModal の該当ブロックを逐語移植し、クロージャ参照を props 化しただけ。
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScheduleEvent } from '@/types/schedule'

interface DeleteEventConfirmDialogProps {
  deleteConfirming: boolean
  setDeleteConfirming: (value: boolean) => void
  event?: ScheduleEvent | null
  onDeleteEvent?: (event: ScheduleEvent) => Promise<void>
  onClose: () => void
}

export function DeleteEventConfirmDialog({
  deleteConfirming,
  setDeleteConfirming,
  event,
  onDeleteEvent,
  onClose,
}: DeleteEventConfirmDialogProps) {
  return (
    <Dialog open={deleteConfirming} onOpenChange={setDeleteConfirming}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">この予定を削除しますか？</DialogTitle>
          <DialogDescription className="text-sm pt-1">
            削除すると元に戻せません。関連する予約もすべて削除されます。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="text-sm" onClick={() => setDeleteConfirming(false)}>
            キャンセル
          </Button>
          <Button
            variant="destructive"
            className="text-sm"
            onClick={async () => {
              setDeleteConfirming(false)
              if (event && onDeleteEvent) {
                await onDeleteEvent(event)
                onClose()
              }
            }}
          >
            削除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

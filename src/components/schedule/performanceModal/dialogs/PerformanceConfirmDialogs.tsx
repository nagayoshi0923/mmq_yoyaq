import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ScheduleEvent } from '@/types/schedule'

interface ScenarioChangeConfirmDialogProps {
  pendingScenarioTitle: string | null
  localCurrentParticipants: number
  setPendingScenarioTitle: (value: string | null) => void
  applyScenarioChange: (scenarioTitle: string) => void
}

/** シナリオ変更確認ダイアログ（参加者がいる場合）。PerformanceModal から逐語抽出（挙動不変） */
export function ScenarioChangeConfirmDialog({
  pendingScenarioTitle,
  localCurrentParticipants,
  setPendingScenarioTitle,
  applyScenarioChange,
}: ScenarioChangeConfirmDialogProps) {
  return (
    <Dialog open={pendingScenarioTitle !== null} onOpenChange={(open) => { if (!open) setPendingScenarioTitle(null) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">シナリオを変更しますか？</DialogTitle>
          <DialogDescription className="text-sm pt-1">
            現在 <span className="font-semibold text-foreground">{localCurrentParticipants}名</span> の予約者がいます。<br />
            シナリオを <span className="font-semibold text-foreground">「{pendingScenarioTitle}」</span> に変更すると、既存の予約情報（参加人数上限など）に影響する可能性があります。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            className="text-sm"
            onClick={() => setPendingScenarioTitle(null)}
          >
            キャンセル
          </Button>
          <Button
            className="text-sm"
            onClick={() => {
              if (pendingScenarioTitle) applyScenarioChange(pendingScenarioTitle)
              setPendingScenarioTitle(null)
            }}
          >
            変更する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface DeleteEventConfirmDialogProps {
  deleteConfirming: boolean
  setDeleteConfirming: (value: boolean) => void
  event?: ScheduleEvent | null
  onDeleteEvent?: (event: ScheduleEvent) => Promise<void>
  onClose: () => void
}

/** 公演削除確認ダイアログ。PerformanceModal から逐語抽出（挙動不変） */
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

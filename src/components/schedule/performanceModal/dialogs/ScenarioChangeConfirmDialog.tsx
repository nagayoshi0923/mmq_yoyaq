/**
 * シナリオ変更確認ダイアログ（PerformanceModal から子コンポーネント抽出・挙動不変）。
 * 参加者がいる編集中にシナリオを変えようとした時に確認する。
 * JSX は元 PerformanceModal の該当ブロックを逐語移植し、クロージャ参照を props 化しただけ。
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ScenarioChangeConfirmDialogProps {
  pendingScenarioTitle: string | null
  setPendingScenarioTitle: (value: string | null) => void
  localCurrentParticipants: number
  applyScenarioChange: (scenarioTitle: string) => void
}

export function ScenarioChangeConfirmDialog({
  pendingScenarioTitle,
  setPendingScenarioTitle,
  localCurrentParticipants,
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

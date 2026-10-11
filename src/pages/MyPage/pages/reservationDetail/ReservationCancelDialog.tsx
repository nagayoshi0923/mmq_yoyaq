/**
 * 予約の取消確認（点検 20・41）。どの公演か・キャンセル料がかかるかを出す。
 * 押し間違いを防ぐため、スマホでは「やめる」を上、赤い「キャンセルする」を下に置く（PC は右）。
 */
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface ReservationCancelSummary {
  title: string
  datetimeLabel: string
  storeName: string | null
  participantCount: number
  reservationNumber: string | null
  /** 例「10/27(火) 19:00」。無料期間内だけマイページから取消できる */
  freeDeadlineLabel: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: ReservationCancelSummary
  isPending: boolean
  onConfirm: () => void
}

export function ReservationCancelDialog({ open, onOpenChange, summary, isPending, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isPending) onOpenChange(next) }}>
      <DialogContent size="sm" data-testid="reservation-cancel-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">この予約をキャンセルしますか？</DialogTitle>
          <DialogDescription className="text-sm pt-1">キャンセルは元に戻せません。キャンセルの確認メールをお送りします。</DialogDescription>
        </DialogHeader>
        <dl className="border bg-muted/40 p-3 text-sm space-y-1">
          <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted-foreground">作品</dt><dd className="font-medium">{summary.title}</dd></div>
          <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted-foreground">日時</dt><dd>{summary.datetimeLabel}</dd></div>
          {summary.storeName && <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted-foreground">会場</dt><dd>{summary.storeName}</dd></div>}
          <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted-foreground">人数</dt><dd>{summary.participantCount}名</dd></div>
          {summary.reservationNumber && <div className="flex gap-2"><dt className="w-16 shrink-0 text-muted-foreground">予約番号</dt><dd className="font-mono">{summary.reservationNumber}</dd></div>}
          <div className="flex gap-2 border-t pt-1 mt-1">
            <dt className="w-16 shrink-0 text-muted-foreground">キャンセル料</dt>
            <dd className="font-medium text-green-700" data-testid="reservation-cancel-fee">
              かかりません{summary.freeDeadlineLabel ? `（${summary.freeDeadlineLabel} までは無料）` : ''}
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11 text-sm sm:min-w-28" onClick={() => onOpenChange(false)} disabled={isPending}>
            やめる
          </Button>
          <Button variant="destructive" className="h-11 text-sm sm:min-w-28" onClick={onConfirm} disabled={isPending} data-testid="reservation-cancel-confirm">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isPending ? 'キャンセルしています…' : 'キャンセルする'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

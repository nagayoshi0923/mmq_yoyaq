/**
 * 参加人数の変更（点検 5・37・38・30）。
 * 変更後の合計金額を出す。人数を減らせる期限はキャンセルポリシーの「人数変更は24時間前まで」に合わせる。
 * 「最大 N 名まで変更できます」は #1026 の表現を保つ。
 * クーポン割引のある予約は、サーバーが同じ条件のまま新しい人数で割引を付け直す（participant_change_keeps_coupon_v1）。
 * 条件（最低利用金額など）を満たさない人数はサーバーが止め、その理由を画面に出す。
 */
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentCount: number
  value: number
  onValueChange: (value: number) => void
  maxSelectableCount: number
  canDecrease: boolean
  /** 例「10/28(水) 19:00」 */
  decreaseDeadlineLabel: string | null
  unitPrice: number
  /** いまの合計（サーバー確定金額 final_price。割引後） */
  currentTotal?: number
  /** いまの割引額（0 なら割引なし） */
  currentDiscount?: number
  canSubmit: boolean
  isPending: boolean
  onConfirm: () => void
}

const yen = (value: number) => `¥${value.toLocaleString()}`

export function ParticipantCountDialog({
  open, onOpenChange, currentCount, value, onValueChange, maxSelectableCount, canDecrease,
  decreaseDeadlineLabel, unitPrice, currentTotal, currentDiscount = 0, canSubmit, isPending, onConfirm,
}: Props) {
  const options = Array.from({ length: maxSelectableCount }, (_, i) => i + 1)
    .filter((num) => canDecrease || num >= (currentCount || 1))
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isPending) onOpenChange(next) }}>
      <DialogContent fixedSize="form" data-testid="participant-count-dialog">
        <DialogHeader>
          <DialogTitle>参加人数を変更</DialogTitle>
          <DialogDescription>
            変更後の参加人数を選択してください。最大{maxSelectableCount}名まで変更できます（いまの予約は{currentCount}名）。
            {canDecrease
              ? decreaseDeadlineLabel && <span className="block mt-1">人数を減らせるのは {decreaseDeadlineLabel} まで（公演の24時間前まで）です。</span>
              : <span className="block text-amber-600 mt-1">※人数を減らせる期限{decreaseDeadlineLabel ? `（${decreaseDeadlineLabel}）` : ''}を過ぎたため、人数の追加のみできます</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <Select value={String(value)} onValueChange={(next) => onValueChange(Number(next))}>
            <SelectTrigger className="h-11" aria-label="変更後の参加人数"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((num) => <SelectItem key={num} value={String(num)}>{num}名</SelectItem>)}
            </SelectContent>
          </Select>
          {unitPrice > 0 && (
            <div className="border bg-muted/40 p-3 text-sm space-y-1" data-testid="participant-count-total">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{currentDiscount > 0 ? '変更後の金額（割引前）' : '変更後の合計'}</span>
                <span className="font-bold">{yen(unitPrice * value)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{yen(unitPrice)} × {value}名</span>
                <span>いまの合計 {yen(currentTotal ?? unitPrice * currentCount)}</span>
              </div>
              {currentDiscount > 0 && (
                <p className="text-xs text-muted-foreground" data-testid="participant-count-discount-note">
                  ご利用中のクーポン割引（いまは −{yen(currentDiscount)}）は、変更後の人数で同じ条件のまま計算し直して差し引きます（定額のクーポンは同じ額、割合のクーポンは変更後の金額に対する割合）。クーポンの利用条件を満たさなくなる人数には変更できません。
                </p>
              )}
              <p className="text-xs text-muted-foreground">税込。当日、店舗でお支払いください。</p>
            </div>
          )}
        </div>
        <div data-dialog-footer="" className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11 sm:min-w-28" onClick={() => onOpenChange(false)} disabled={isPending}>やめる</Button>
          <Button className="h-11 sm:min-w-28" onClick={onConfirm} disabled={!canSubmit || isPending || value === currentCount}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isPending ? '変更しています…' : '変更する'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

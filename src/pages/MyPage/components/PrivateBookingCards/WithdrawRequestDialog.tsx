/**
 * 「申込を取り下げる」（店舗の返事待ち）の確認ダイアログ。マイページの貸切カードの「操作」と
 * グループページの ⋮ → 操作・申込内容の箱の両方から開く（usePrivateBookingActions が持つ）。
 * 2026-10-20 社長決定: グループを残す（候補日を直して申し込み直せる。既定）か、グループも閉じるかを選ぶ。
 */
import { useEffect, useState } from 'react'
import { ConfirmDialog } from '@/components/patterns/modal'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { withdrawRequestText, type WithdrawRequestMode } from './privateBookingMenu'

interface WithdrawRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (mode: WithdrawRequestMode) => Promise<void>
  /** グループがある（無い旧い貸切予約は選択肢を出さず取り下げるだけ） */
  hasGroup: boolean
  /** 自分以外の参加メンバーの人数 */
  otherMembers: number
}

export function WithdrawRequestDialog({ open, onOpenChange, onConfirm, hasGroup, otherMembers }: WithdrawRequestDialogProps) {
  const [mode, setMode] = useState<WithdrawRequestMode>('keep_group')
  // 開くたびに既定（グループは残す）へ戻す
  useEffect(() => { if (open) setMode('keep_group') }, [open])
  const effective: WithdrawRequestMode = hasGroup ? mode : 'close_group'
  const text = withdrawRequestText(effective, { hasGroup, otherMembers })
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={text.title}
      message={text.message}
      confirmLabel={text.confirmLabel}
      cancelLabel="やめる"
      variant="destructive"
      onConfirm={() => onConfirm(effective)}
    >
      {text.options.length > 0 && (
        <RadioGroup
          value={mode}
          onValueChange={value => setMode(value as WithdrawRequestMode)}
          aria-label="グループをどうするか"
          className="gap-2"
          data-testid="withdraw-request-mode"
        >
          {text.options.map(option => (
            <label
              key={option.mode}
              htmlFor={`withdraw-mode-${option.mode}`}
              className={`flex items-start gap-2.5 rounded-md border p-3 cursor-pointer ${mode === option.mode ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <RadioGroupItem id={`withdraw-mode-${option.mode}`} value={option.mode} className="mt-0.5 shrink-0" />
              <span className="text-sm text-foreground leading-snug">
                <span className="font-bold">{option.label}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{option.note}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      )}
    </ConfirmDialog>
  )
}

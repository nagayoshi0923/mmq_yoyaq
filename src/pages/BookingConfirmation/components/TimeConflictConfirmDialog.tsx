import { Link } from 'react-router-dom'
import { ConfirmDialog } from '@/components/patterns/modal'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing: { title?: string | null; reservation_number?: string | null; participant_count?: number | null } | null
  onConfirm: () => void
}

/**
 * 同じ時間帯に別の公演の予約があるときの確認（確認のあと新しい予約を続けられる。同じ公演の 2 件目は送信前に止める）。
 * 以前は「この公演に既に予約があります」と、重なっている予約とは違う対象を案内していた（2026-10-26 点検 F15）
 */
export function TimeConflictConfirmDialog({ open, onOpenChange, existing, onConfirm }: Props) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="新規予約を追加しますか？"
      description="同じ時間帯に別の公演の予約があります。"
      cancelLabel="戻る"
      confirmLabel="新規予約を追加する"
      onConfirm={onConfirm}
    >
      {existing && (
        <div className="p-3 bg-muted rounded-md text-sm">
          <p className="font-medium text-foreground">同じ時間帯の予約</p>
          <p className="text-muted-foreground mt-1">
            {existing.title && <>公演: {existing.title}<br /></>}
            予約番号: {existing.reservation_number}<br />
            参加人数: {existing.participant_count}名
          </p>
        </div>
      )}
      <p className="ts-muted">
        既存の予約を取り消す場合は、<Link to="/mypage" className="underline">マイページ</Link>から操作してください。
      </p>
    </ConfirmDialog>
  )
}

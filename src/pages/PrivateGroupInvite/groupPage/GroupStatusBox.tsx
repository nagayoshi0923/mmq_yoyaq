/**
 * 「いまの状態」の箱（ヘッダー直下に固定）。マイページの貸切カードと同じ見た目の決まり
 * （チップ型ラベル＝次にやること、本文、主ボタン、副ボタン）。チャットタブでは 1 行版にする。
 */
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { PRIVATE_BOOKING_TONE } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingTone'
import type { GroupStatusView, StatusAction } from './groupPageModel'

interface GroupStatusBoxProps {
  view: GroupStatusView
  onAction: (action: StatusAction) => void
  /** チャットタブ用の 1 行版。押すと日程（または概要）へ */
  compact?: boolean
  onOpenDetail?: () => void
  /** 主ボタンの下に横並びで出す追加のボタン（確定後の「カレンダーに登録」「地図を開く」） */
  extra?: ReactNode
}

export function GroupStatusBox({ view, onAction, compact = false, onOpenDetail, extra }: GroupStatusBoxProps) {
  const tone = PRIVATE_BOOKING_TONE[view.tone]
  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpenDetail}
        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 border-b ${tone.card} ${tone.header}`}
        data-testid="group-status-bar"
      >
        <span className={`text-xs truncate flex-1 ${tone.sub}`}>
          {view.oneLine.startsWith(view.chip) ? <><b className="font-bold">{view.chip}</b>{view.oneLine.slice(view.chip.length)}</> : view.oneLine}
        </span>
        <span className={`text-xs whitespace-nowrap ${tone.sub}`}>詳しく ›</span>
      </button>
    )
  }
  return (
    <section className={`bg-card border ${tone.card} rounded-lg overflow-hidden`} aria-label="いまの状態" data-testid="group-status-box">
      <div className={`px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 ${tone.header}`}>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${tone.chip}`} data-testid="group-status-chip">{view.chip}</span>
        {view.sub && <span className="text-xs text-muted-foreground">{view.sub}</span>}
      </div>
      <div className="p-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
        <p className="text-sm text-foreground leading-snug lg:flex-1" data-testid="group-status-body">{view.body}</p>
        {(view.primary || view.secondary.length > 0 || extra) && (
          <div className="flex flex-col gap-2 lg:flex-row lg:shrink-0">
            {view.primary && (
              <Button
                type="button"
                className={`h-auto py-2.5 px-3.5 text-sm font-bold rounded-md whitespace-normal ${PRIVATE_BOOKING_TONE[view.primaryTone].primary}`}
                onClick={() => onAction(view.primary!)}
                data-testid="group-status-primary"
              >
                {view.primary.label}
              </Button>
            )}
            {view.secondary.length > 0 && (
              <div className="flex gap-2">
                {view.secondary.map(action => (
                  <Button
                    key={action.kind}
                    type="button"
                    variant="outline"
                    className="flex-1 h-auto py-2 px-3 text-sm rounded-md bg-background border-zinc-300 text-foreground hover:bg-muted whitespace-nowrap"
                    onClick={() => onAction(action)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
            {extra}
          </div>
        )}
      </div>
    </section>
  )
}

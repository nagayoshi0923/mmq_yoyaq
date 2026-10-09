/**
 * 貸切の「操作」メニュー。マイページの貸切カード右上と、グループ画面の歯車（主催者）で同じものを使う。
 * 中身は状態と立場で変わる（buildPrivateBookingMenu）。赤い操作は最後に 1 つだけ。
 */
import { useState, type ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { buildPrivateBookingMenu, type PrivateBookingMenuItemId } from './privateBookingMenu'
import type { PrivateBookingActions, PrivateBookingActionTarget } from './usePrivateBookingActions'

/** 画面ごとに行き先が違う項目（候補日・希望店舗・日程回答・アンケート） */
export type PrivateBookingNavHandlers = Partial<Record<'edit_dates' | 'edit_store' | 'answer_dates' | 'view_survey', () => void>>

interface PrivateBookingActionsMenuProps {
  target: PrivateBookingActionTarget
  actions: PrivateBookingActions
  nav: PrivateBookingNavHandlers
  /** 開くボタン。省略時は「操作」 */
  trigger?: ReactNode
  align?: 'start' | 'end'
}

export function PrivateBookingActionsMenu({ target, actions, nav, trigger, align = 'end' }: PrivateBookingActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const items = buildPrivateBookingMenu({
    isOrganizer: target.isOrganizer,
    phase: target.phase,
    hasGroup: Boolean(target.groupId),
    hasReservation: Boolean(target.reservationId),
    hasSurvey: target.hasSurvey,
    hasUnansweredDates: target.hasUnansweredDates,
    hasPendingHandover: Boolean(target.handover),
  })
  const normal = items.filter(i => !i.danger)
  const danger = items.find(i => i.danger)
  const cancel = actions.cancelAvailability

  const select = (id: PrivateBookingMenuItemId) => {
    switch (id) {
      case 'copy_invite': return void actions.copyInvite()
      case 'manage_members': return actions.openMembers()
      case 'cancel_handover': return actions.requestCancelHandover()
      case 'contact_store': return actions.openInquiry()
      case 'close_group':
      case 'withdraw':
      case 'cancel':
      case 'leave':
        return actions.requestDanger(id)
      default:
        return nav[id]?.()
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (next) actions.preparePolicy()
      }}
    >
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 gap-1 text-xs rounded-md bg-background border-zinc-300 text-foreground hover:bg-muted"
            aria-label={`${target.title}の操作`}
            data-testid="private-booking-actions"
          >
            <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
            操作
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60 rounded-lg p-1.5" data-testid="private-booking-actions-menu">
        {normal.map(item => (
          <DropdownMenuItem key={item.id} onSelect={() => select(item.id)} data-menu-item={item.id}>
            {item.label}
          </DropdownMenuItem>
        ))}
        {danger && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => select(danger.id)}
              disabled={danger.id === 'cancel' && !cancel.allowed}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              data-menu-item={danger.id}
            >
              {danger.id === 'cancel' && cancel.loading ? 'キャンセル（確認中…）' : danger.label}
            </DropdownMenuItem>
            {danger.id === 'cancel' && cancel.reason && (
              <p className="px-2 pb-1.5 text-xs text-muted-foreground leading-snug" data-testid="cancel-blocked-reason">{cancel.reason}</p>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

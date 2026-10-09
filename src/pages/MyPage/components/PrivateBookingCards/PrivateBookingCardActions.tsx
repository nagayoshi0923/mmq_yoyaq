/**
 * マイページの貸切カード右上の「操作」。カードの材料から対象を組み立て、メニューと確認ダイアログを出す。
 * 候補日・希望店舗・日程回答・アンケートは、グループ画面へ移らずマイページ上のダイアログで行う（2026-10-09 社長決定・案 3）。
 */
import { useAuth } from '@/contexts/AuthContext'
import { PrivateBookingActionsMenu } from './PrivateBookingActionsMenu'
import { PrivateGroupInPlaceDialog, type PrivateGroupInPlaceMode } from './PrivateGroupInPlaceDialog'
import { usePrivateBookingActions, type PrivateBookingActionTarget } from './usePrivateBookingActions'
import type { PrivateBookingItem } from './privateBookingModel'

interface PrivateBookingCardActionsProps {
  item: PrivateBookingItem
  /** その場で開くダイアログ（カードの主ボタンからも開くので、状態は親が持つ） */
  inPlace: PrivateGroupInPlaceMode | null
  onInPlaceChange: (mode: PrivateGroupInPlaceMode | null) => void
}

export function PrivateBookingCardActions({ item, inPlace, onInPlaceChange }: PrivateBookingCardActionsProps) {
  const { user } = useAuth()
  const m = item.menu
  const target: PrivateBookingActionTarget = {
    groupId: item.groupId,
    inviteCode: m.inviteCode,
    reservationId: item.reservationId,
    reservationNumber: m.reservationNumber,
    organizationId: m.organizationId,
    title: item.title,
    isOrganizer: item.isOrganizer,
    phase: m.phase,
    memberCount: m.memberCount,
    candidateDates: m.candidateDates,
    confirmedDate: m.confirmedDate,
    hasSurvey: m.hasSurvey,
    hasUnansweredDates: m.hasUnansweredDates,
    myMemberId: m.myMemberId,
    members: m.members,
    handover: m.handover,
    replyEmail: user?.email ?? '',
    replyName: user?.name ?? '',
  }
  const actions = usePrivateBookingActions(target)
  const open = (mode: PrivateGroupInPlaceMode) => () => { if (m.inviteCode) onInPlaceChange(mode) }
  return (
    <>
      <PrivateBookingActionsMenu
        target={target}
        actions={actions}
        nav={{
          edit_dates: open('dates'),
          edit_store: open('store'),
          answer_dates: open('answer'),
          view_survey: open('survey'),
        }}
      />
      {actions.dialogs}
      {m.inviteCode && (
        <PrivateGroupInPlaceDialog
          mode={inPlace}
          onClose={() => onInPlaceChange(null)}
          inviteCode={m.inviteCode}
          title={item.title}
          myMemberId={m.myMemberId}
          onSaved={actions.refreshLists}
        />
      )}
    </>
  )
}

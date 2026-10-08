/**
 * マイページの貸切カード右上の「操作」。カードの材料から対象を組み立て、メニューと確認ダイアログを出す。
 * 候補日・希望店舗・日程回答・アンケートはグループ画面へ移って開く（グループ画面＝やりとりと回答）。
 */
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { PrivateBookingActionsMenu } from './PrivateBookingActionsMenu'
import { usePrivateBookingActions, type PrivateBookingActionTarget } from './usePrivateBookingActions'
import type { PrivateBookingItem } from './privateBookingModel'

export function PrivateBookingCardActions({ item }: { item: PrivateBookingItem }) {
  const navigate = useNavigate()
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
  const base = m.inviteCode ? `/group/invite/${m.inviteCode}` : null
  const go = (suffix: string) => { if (base) navigate(`${base}${suffix}`) }
  return (
    <>
      <PrivateBookingActionsMenu
        target={target}
        actions={actions}
        nav={{
          edit_dates: () => go('?open=dates'),
          edit_store: () => go('?open=store-edit'),
          answer_dates: () => go('?tab=schedule'),
          view_survey: () => go('?tab=survey'),
        }}
      />
      {actions.dialogs}
    </>
  )
}

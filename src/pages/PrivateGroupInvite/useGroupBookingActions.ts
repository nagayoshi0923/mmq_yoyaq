/**
 * グループ画面で使う貸切の「操作」（マイページの貸切カードと共通の usePrivateBookingActions）を、グループの読み取り結果から組み立てる。
 */
import { usePrivateBookingActions } from '@/pages/MyPage/components/PrivateBookingCards/usePrivateBookingActions'
import { privateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'
import { toMemberRows } from '@/pages/MyPage/components/PrivateBookingCards/privateGroupSummary'
import type { useAuth } from '@/contexts/AuthContext'
import type { PrivateGroupLinkedReservation } from '@/lib/privateGroupRead'
import type { PrivateGroup, PrivateGroupMember } from '@/types'

interface Input {
  group: PrivateGroup | null
  user: ReturnType<typeof useAuth>['user']
  existingMember: PrivateGroupMember | undefined
  linkedReservation: PrivateGroupLinkedReservation | null
  linkedReservationStatus: string | null
  joinedCount: number
  candidateCount: number
  onDone: () => void
  onMembersChanged: () => unknown
}

export function useGroupBookingActions({ group, user, existingMember, linkedReservation, linkedReservationStatus, joinedCount, candidateCount, onDone, onMembersChanged }: Input) {
  const bookingPhase = privateBookingPhase(group?.status, linkedReservationStatus)
  const bookingActions = usePrivateBookingActions({
    groupId: group?.id ?? null,
    inviteCode: group?.invite_code ?? null,
    reservationId: group?.reservation_id ?? null,
    reservationNumber: linkedReservation?.reservation_number ?? null,
    organizationId: group?.organization_id ?? null,
    title: group?.scenario_masters?.title || '',
    isOrganizer: Boolean(user && group?.organizer_id === user.id),
    phase: bookingPhase,
    memberCount: joinedCount,
    candidateDates: candidateCount,
    confirmedDate: group?.confirmed_performance?.date ?? null,
    hasSurvey: (group?.scenario_masters as { survey_enabled?: boolean } | undefined)?.survey_enabled === true,
    hasUnansweredDates: false,
    myMemberId: existingMember?.id ?? null,
    members: group ? toMemberRows(group) : [],
    replyEmail: user?.email || existingMember?.guest_email || '',
    replyName: existingMember?.guest_name || user?.name || '',
  }, { onDone, onMembersChanged: async () => { await onMembersChanged() } })
  return { bookingPhase, bookingActions }
}

/**
 * 参加中の人のグループページを組み立てる（刷新 段階 1）。読み取り結果から回答表・いまの状態を作り、
 * 見出し・状態の箱・タブ・各タブの中身・チャットを GroupMemberPage に渡す。
 */
import { useMemo, type ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'
import { toast } from 'sonner'
import type { NavigateFunction } from 'react-router-dom'
import { privateGroupMemberAction } from '@/lib/privateGroupGuestSession'
import { getErrorMessage } from '@/lib/errorFields'
import { toJstYmd } from '@/utils/jstDate'
import type { DateResponse, PrivateGroup } from '@/types'
import type { PrivateGroupHandoverSummary, PrivateGroupLinkedReservation } from '@/lib/privateGroupRead'
import type { usePrivateGroupMessages } from '@/hooks/usePrivateGroupMessages'
import { PrivateBookingActionsMenu } from '@/pages/MyPage/components/PrivateBookingCards/PrivateBookingActionsMenu'
import type { PrivateBookingActions } from '@/pages/MyPage/components/PrivateBookingCards/usePrivateBookingActions'
import type { PrivateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'
import { isSurveyPending } from '@/pages/MyPage/hooks/usePrivateSurveyStatusQuery'
import { toHandoverInfo } from '@/pages/MyPage/components/PrivateBookingCards/privateGroupHandover'
import { GroupPageHeader } from './GroupPageHeader'
import { GroupMemberPage } from './GroupMemberPage'
import { GroupDatesTab } from './GroupDatesTab'
import { GroupOverviewTab } from './GroupOverviewTab'
import { GroupMembersTab } from './GroupMembersTab'
import { useGroupChatUnread, useIsDesktop } from './useGroupChatUnread'
import { buildAnswerTable, buildGroupStatus, defaultGroupTab, remindUnansweredText, type GroupTab, type StatusAction } from './groupPageModel'

interface GroupMemberScreenProps {
  group: PrivateGroup
  scenario: { id?: string; slug?: string; title?: string; key_visual_url?: string } | undefined
  playerRange: { min: number | null; max: number | null }
  isLoggedIn: boolean
  existingMemberId: string
  isOrganizer: boolean
  organizerName: string
  memberCount: number
  inviteMemberCap: number | null
  linkedReservation: PrivateGroupLinkedReservation | null
  handover: PrivateGroupHandoverSummary | null
  bookingPhase: PrivateBookingPhase
  canMutateSchedule: boolean
  survey: { survey_enabled?: boolean; survey_url?: string | null; questions?: unknown[]; existing_response_id?: string | null; survey_deadline_at?: string | null } | undefined
  preferredStoreNames: string[]
  copied: boolean
  /** ?tab= の値（無い・分からないときは null） */
  tabParam: GroupTab | null
  /** ?sheet=dates（候補日の追加・編集を開いている） */
  dateEditorOpen: boolean
  chatMessages: ReturnType<typeof usePrivateGroupMessages>
  bookingActions: PrivateBookingActions
  bookingSummary: ReactNode
  chat: ReactNode
  navigate: NavigateFunction
  setTab: (tab: GroupTab | 'survey') => void
  openSheet: (name: string, extra?: Record<string, string>) => void
  closeSheet: () => void
  openBooking: (candidateId?: string) => void
  openStoreEdit: () => void
  copyInvite: () => Promise<void>
  shareLine: () => void
  getInviteUrl: () => string
  refetch: () => unknown
  submitDateResponses: (groupId: string, memberId: string, responses: Array<{ candidateDateId: string; response: DateResponse }>) => Promise<void>
  formatDateJaMd: (dateStr: string) => string
}

export function GroupMemberScreen(props: GroupMemberScreenProps) {
  const {
    group, scenario, playerRange, isLoggedIn, existingMemberId, isOrganizer, organizerName, memberCount, inviteMemberCap, linkedReservation, handover,
    bookingPhase, canMutateSchedule, survey, preferredStoreNames, copied, tabParam, dateEditorOpen, chatMessages, bookingActions, bookingSummary, chat,
    navigate, setTab, openSheet, closeSheet, openBooking, openStoreEdit, copyInvite, shareLine, getInviteUrl, refetch, submitDateResponses, formatDateJaMd,
  } = props

  const table = useMemo(() => buildAnswerTable(group, existingMemberId), [group, existingMemberId])
  const fallbackTab = defaultGroupTab(bookingPhase)
  const activeTab: GroupTab = dateEditorOpen ? 'dates' : tabParam ?? fallbackTab
  const desktopTab: GroupTab = fallbackTab
  const isDesktop = useIsDesktop()
  const unread = useGroupChatUnread(group.id, existingMemberId, chatMessages.messages, chatMessages.loading, activeTab === 'chat' || isDesktop)

  const status = useMemo(() => buildGroupStatus({
    status: group.status,
    phase: bookingPhase,
    isOrganizer,
    organizerName: isOrganizer ? null : organizerName,
    memberCount,
    table,
    myMemberId: existingMemberId,
    confirmed: group.confirmed_performance
      ? { date: group.confirmed_performance.date, start_time: group.confirmed_performance.start_time, store_name: group.confirmed_performance.store_name }
      : null,
    requestedAt: linkedReservation?.requested_at ?? null,
    surveyPending: isSurveyPending(survey, new Date()),
    handover: handover && (handover.is_recipient || handover.is_requester) ? toHandoverInfo(handover) : null,
    canMutateSchedule,
    todayYmd: toJstYmd(new Date()),
  }), [group, bookingPhase, isOrganizer, organizerName, memberCount, table, existingMemberId, linkedReservation, survey, handover, canMutateSchedule])

  const sendInvite = async () => {
    const url = getInviteUrl()
    const share = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share
    if (typeof share === 'function') {
      try {
        await share.call(navigator, { title: scenario?.title || '貸切のお誘い', text: `貸切マーダーミステリー「${scenario?.title || ''}」の日程調整です。参加・日程の回答はこちらから`, url })
        return
      } catch {
        // 取り消し・非対応はコピーに切り替える
      }
    }
    await copyInvite()
    toast.success('招待リンクをコピーしました')
  }

  const onStatusAction = (action: StatusAction) => {
    switch (action.kind) {
      case 'add_dates':
      case 'edit_dates':
        return openSheet('dates')
      case 'book':
        return openBooking(action.candidateId)
      case 'answer':
        return setTab('dates')
      case 'send_invite':
        return void sendInvite()
      case 'view_booking':
        return setTab('overview')
      case 'survey':
        return setTab('survey')
      case 'handover':
        return openSheet('handover', handover?.id ? { request: handover.id } : {})
    }
  }

  const onAnswer = async (candidateId: string, response: DateResponse) => {
    try {
      await submitDateResponses(group.id, existingMemberId, [{ candidateDateId: candidateId, response }])
      await refetch()
    } catch (err) {
      toast.error(getErrorMessage(err) || '回答を保存できませんでした')
    }
  }

  const onRemind = async (names: string[]) => {
    const { error } = await privateGroupMemberAction(group.id, existingMemberId, 'message', { message: remindUnansweredText(names) })
    if (error) {
      toast.error('お知らせを送れませんでした')
      return
    }
    toast.success('チャットにお知らせしました')
    await chatMessages.refetch()
  }

  const openScenario = scenario ? () => navigate(`/scenario/${scenario.slug || scenario.id}`) : undefined
  const menuButton = (onClick?: () => void) => (
    <button type="button" onClick={onClick} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-md border border-zinc-300 bg-background hover:bg-muted" aria-label="グループの操作" title="グループの操作" data-testid="group-settings">
      <MoreVertical className="w-4 h-4" aria-hidden="true" />
    </button>
  )
  const menu = isOrganizer ? (
    <PrivateBookingActionsMenu
      target={bookingActions.target}
      actions={bookingActions}
      nav={{ edit_dates: () => openSheet('dates'), edit_store: openStoreEdit, view_survey: () => setTab('survey') }}
      trigger={menuButton()}
    />
  ) : (
    menuButton(() => openSheet('settings'))
  )

  const header = (
    <GroupPageHeader
      title={scenario?.title || '貸切グループ'}
      subtitle={`貸切・参加 ${memberCount}${inviteMemberCap ? `/${inviteMemberCap}` : ''}名・${isOrganizer ? 'あなたが主催' : `${organizerName}さんが主催`}`}
      onBack={isLoggedIn ? () => navigate('/mypage?tab=reservations&sub=private') : null}
      backLabel="マイページ"
      onOpenScenario={openScenario}
      menu={menu}
    />
  )

  return (
    <GroupMemberPage
      header={header}
      status={status}
      onStatusAction={onStatusAction}
      activeTab={activeTab}
      desktopTab={activeTab === 'chat' ? desktopTab : activeTab}
      onTabChange={tab => {
        if (dateEditorOpen && tab !== 'dates') closeSheet()
        setTab(tab)
      }}
      unread={unread}
      chat={chat}
      panels={{
        overview: (
          <GroupOverviewTab
            group={group}
            title={scenario?.title || '貸切グループ'}
            imageUrl={scenario?.key_visual_url ?? null}
            memberCount={memberCount}
            playerRange={playerRange}
            preferredStoreNames={preferredStoreNames}
            bookingSummary={bookingSummary}
            onOpenScenario={openScenario}
          />
        ),
        dates: (
          <GroupDatesTab
            group={group}
            table={table}
            isOrganizer={isOrganizer}
            canMutateSchedule={canMutateSchedule}
            isMember
            onAnswer={onAnswer}
            onBook={openBooking}
            editorOpen={dateEditorOpen}
            onOpenEditor={() => openSheet('dates')}
            onCloseEditor={closeSheet}
            onDatesChanged={refetch}
            onRemind={onRemind}
            preferredStoreNames={preferredStoreNames}
            onEditStore={openStoreEdit}
            formatDateJaMd={formatDateJaMd}
          />
        ),
        members: (
          <GroupMembersTab
            table={table}
            hasCandidates={table.rows.some(r => !r.rejected)}
            inviteCap={inviteMemberCap}
            copied={copied}
            onCopyInvite={() => void copyInvite()}
            onShareLine={shareLine}
            onManage={isOrganizer ? bookingActions.openMembers : null}
          />
        ),
      }}
    />
  )
}

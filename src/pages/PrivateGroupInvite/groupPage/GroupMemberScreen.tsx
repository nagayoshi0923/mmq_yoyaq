/**
 * 参加中の人のグループページを組み立てる（刷新 段階 1）。読み取り結果から回答表・いまの状態を作り、
 * 見出し・状態の箱・タブ・各タブの中身・チャットを GroupMemberPage に渡す。
 * 公演後（段階 4）は 思い出／メンバー／チャット のタブと「開催しました」の箱になる。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { NavigateFunction } from 'react-router-dom'
import { deleteGroupMessage, privateGroupChatAction } from '@/lib/privateGroupChat'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { saveNextGroupSource } from '@/lib/nextPrivateGroup'
import { ConfirmDialog } from '@/components/patterns/modal'
import { getErrorMessage } from '@/lib/errorFields'
import { formatJstMonthDay, toJstYmd } from '@/utils/jstDate'
import type { DateResponse, PrivateGroup } from '@/types'
import type { PrivateGroupHandoverSummary, PrivateGroupLinkedReservation } from '@/lib/privateGroupRead'
import type { usePrivateGroupMessages } from '@/hooks/usePrivateGroupMessages'
import type { PrivateGroupChatState } from '@/hooks/usePrivateGroupChatState'
import { pinnedMessages } from '@/pages/PrivateGroupManage/components/chat/chatModel'
import { jumpToMessage } from '@/pages/PrivateGroupManage/components/chat/chatDom'
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
import { buildAnswerTable, buildGroupStatus, defaultGroupTab, groupTabsFor, isPerformanceEnded, resolveGroupTab, type GroupTab, type StatusAction } from './groupPageModel'
import { GroupMemoriesTab } from './GroupMemoriesTab'
import { GroupFeedbackDialog } from './GroupFeedbackDialog'
import { useGroupMemories } from './useGroupMemories'
import { GroupHeaderMenu } from './GroupHeaderMenu'
import { GroupPhotosSheet, GroupPinsSheet } from './GroupChatListSheets'
import { ChatVisibleContext } from '@/pages/PrivateGroupManage/components/chat/chatVisibility'
import { useGroupPush } from './useGroupPush'
import { PushPromptCard } from './PushPromptCard'

interface GroupMemberScreenProps {
  group: PrivateGroup
  scenario: { id?: string; slug?: string; title?: string; key_visual_url?: string } | undefined
  playerRange: { min: number | null; max: number | null }
  isLoggedIn: boolean
  /** ログイン中の会員（アルバムの登録に使う。ゲストは null） */
  userId: string | null
  /** 予約の状態（completed なら公演後） */
  reservationStatus: string | null
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
  /** 既読・リアクション（GroupChat と共用） */
  chatState: PrivateGroupChatState
  /** ⋮ から開く一覧（写真・ピン留め）。index.tsx が持ち、チャットの上のピン留めからも開く */
  listSheet: 'photos' | 'pins' | null
  setListSheet: (sheet: 'photos' | 'pins' | null) => void
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
    group, scenario, playerRange, isLoggedIn, userId, reservationStatus, existingMemberId, isOrganizer, organizerName, memberCount, inviteMemberCap, linkedReservation, handover,
    bookingPhase, canMutateSchedule, survey, preferredStoreNames, copied, tabParam, dateEditorOpen, chatMessages, chatState, listSheet, setListSheet, bookingActions, bookingSummary, chat,
    navigate, setTab, openSheet, closeSheet, openBooking, openStoreEdit, copyInvite, shareLine, getInviteUrl, refetch, submitDateResponses, formatDateJaMd,
  } = props

  const table = useMemo(() => buildAnswerTable(group, existingMemberId), [group, existingMemberId])
  // 公演後か（終了時刻を過ぎた・完了扱い）。開いたままでも 1 分ごとに見直す
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])
  const ended = bookingPhase === 'confirmed' && isPerformanceEnded(group.confirmed_performance, reservationStatus, now)
  const tabs = groupTabsFor(ended)
  const fallbackTab = defaultGroupTab(bookingPhase, ended)
  const activeTab: GroupTab = dateEditorOpen && !ended ? 'dates' : resolveGroupTab(tabParam, bookingPhase, ended)
  const desktopTab: GroupTab = fallbackTab
  const isDesktop = useIsDesktop()
  const unread = useGroupChatUnread(existingMemberId, chatMessages.messages, chatMessages.loading, chatState, activeTab === 'chat' || isDesktop, group)
  const pinned = useMemo(() => pinnedMessages(chatMessages.messages), [chatMessages.messages])
  // プッシュ通知（段階 3。会員だけ）
  const push = useGroupPush(group.id, isLoggedIn)
  const [actionsOpen, setActionsOpen] = useState(false)
  const title = scenario?.title || '貸切グループ'
  // 公演後の思い出（段階 4）
  const memories = useGroupMemories({
    groupId: group.id,
    memberId: existingMemberId,
    enabled: ended,
    userId,
    scenarioMasterId: group.scenario_master_id,
    scenarioTitle: title,
    reservationId: group.reservation_id,
    onPhotosSent: () => chatMessages.refetch(),
  })
  const photoInput = useRef<HTMLInputElement>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ messageId: string; count: number } | null>(null)
  const { data: extras } = useQuery({
    queryKey: ['group-page-overview', group.scenario_master_id, group.organization_id],
    enabled: ended && Boolean(group.organization_id),
    staleTime: 5 * 60 * 1000,
    queryFn: () => privateGroupPageReadApi.findGroupOverviewExtras(group.scenario_master_id, group.organization_id),
  })
  const nameOf = (memberId: string | null) => group.members?.find(m => m.id === memberId)?.guest_name || (memberId ? 'メンバー' : '退出したメンバー')

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
    todayYmd: toJstYmd(now),
    ended,
    performance: group.confirmed_performance
      ? { date: group.confirmed_performance.date, start_time: group.confirmed_performance.start_time, store_name: group.confirmed_performance.store_name }
      : null,
    canStartNext: isLoggedIn,
  }), [group, bookingPhase, isOrganizer, organizerName, memberCount, table, existingMemberId, linkedReservation, survey, handover, canMutateSchedule, now, ended, isLoggedIn])

  // 同じメンバーで次の貸切: もとのグループを覚えて作品選択へ。グループを作ったら招待がこのチャットに流れる
  const startNextGroup = () => {
    saveNextGroupSource({ groupId: group.id, memberId: existingMemberId, organizationId: group.organization_id, title, memberCount: Math.max(0, memberCount - 1) })
    navigate(extras?.slug ? `/${extras.slug}/catalog` : '/catalog')
  }

  const confirmDeletePhotos = async () => {
    if (!deleteTarget) return
    try {
      await deleteGroupMessage(group.id, existingMemberId, deleteTarget.messageId)
      toast.success('写真の投稿を削除しました')
      await Promise.all([memories.refetchPhotos(), chatMessages.refetch()])
    } catch (err) {
      toast.error(getErrorMessage(err) || '削除できませんでした')
    } finally {
      setDeleteTarget(null)
    }
  }

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
      case 'share_photos':
        // 押した操作のまま写真を選ぶ（スマホのブラウザは操作の外ではファイル選択を開かない）
        if (activeTab !== 'memories' && !isDesktop) setTab('memories')
        return photoInput.current?.click()
      case 'feedback':
        return setFeedbackOpen(true)
      case 'next_group':
        return startNextGroup()
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

  // 未回答の人に知らせる（主催者だけ）。チャットには灰色の 1 行のお知らせとして入る
  const onRemind = async (memberIds: string[]) => {
    try {
      await privateGroupChatAction(group.id, existingMemberId, 'remind_unanswered', { member_ids: memberIds })
    } catch (err) {
      toast.error(getErrorMessage(err) || 'お知らせを送れませんでした')
      return
    }
    toast.success('チャットにお知らせしました')
    await chatMessages.refetch()
  }

  // ピン留めの一覧から発言へ（スマホはチャットタブに切り替えてから動かす）
  const jumpFromList = (messageId: string) => {
    if (!isDesktop) setTab('chat')
    window.setTimeout(() => jumpToMessage(messageId), 250)
  }

  const openScenario = scenario ? () => navigate(`/scenario/${scenario.slug || scenario.id}`) : undefined
  const subtitle = ended && group.confirmed_performance
    ? `${formatJstMonthDay(group.confirmed_performance.date, true)} 開催済み・参加 ${memories.after?.performance?.participant_count ?? memberCount}名`
    : `貸切・参加 ${memberCount}${inviteMemberCap ? `/${inviteMemberCap}` : ''}名・${isOrganizer ? 'あなたが主催' : `${organizerName}さんが主催`}`
  const menu = (
    <GroupHeaderMenu
      memberCount={memberCount}
      pinnedCount={pinned.length}
      onMembers={() => setTab('members')}
      onPhotos={() => setListSheet('photos')}
      onPins={() => setListSheet('pins')}
      push={push.available ? { on: push.on, busy: push.busy, onToggle: () => void push.toggle() } : null}
      onActions={() => {
        if (!isOrganizer) return openSheet('settings')
        bookingActions.preparePolicy()
        setActionsOpen(true)
      }}
      actionsMenu={isOrganizer ? (
        <PrivateBookingActionsMenu
          target={bookingActions.target}
          actions={bookingActions}
          nav={{ edit_dates: () => openSheet('dates'), edit_store: openStoreEdit, view_survey: () => setTab('survey') }}
          trigger={<span className="block w-9 h-9" aria-hidden="true" />}
          open={actionsOpen}
          onOpenChange={setActionsOpen}
        />
      ) : undefined}
    />
  )

  const header = (
    <GroupPageHeader
      title={title}
      subtitle={subtitle}
      onBack={isLoggedIn ? () => navigate('/mypage?tab=reservations&sub=private') : null}
      backLabel="マイページ"
      onOpenScenario={openScenario}
      menu={menu}
    />
  )

  return (
    <ChatVisibleContext.Provider value={activeTab === 'chat' || isDesktop}>
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
      tabs={tabs}
      chat={chat}
      panels={{
        memories: ended ? (
          <GroupMemoriesTab
            title={title}
            imageUrl={scenario?.key_visual_url ?? null}
            photos={memories.photos}
            photosFailed={memories.photosFailed}
            myMemberId={existingMemberId}
            nameOf={nameOf}
            sending={memories.sending}
            onShare={() => photoInput.current?.click()}
            onDeleteMessage={(messageId, count) => setDeleteTarget({ messageId, count })}
            after={memories.after}
            memberCount={memberCount}
            albumState={memories.albumState}
            registering={memories.registering}
            onRegisterAlbum={() => { if (memories.after?.performance) void memories.registerAlbum(memories.after.performance) }}
            onOpenFeedback={() => setFeedbackOpen(true)}
            onOpenScenario={openScenario}
          />
        ) : null,
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
    {listSheet === 'photos' && <GroupPhotosSheet groupId={group.id} memberId={existingMemberId} nameOf={nameOf} onClose={() => setListSheet(null)} />}
    {listSheet === 'pins' && <GroupPinsSheet pinned={pinned} nameOf={nameOf} onJump={jumpFromList} onClose={() => setListSheet(null)} />}
    {push.prompt && <PushPromptCard kind={push.prompt} busy={push.busy} onAccept={() => void push.accept()} onDismiss={push.dismiss} />}
    {ended && (
      <>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { void memories.sharePhotos(e.target.files); e.target.value = '' }}
          data-testid="memories-photo-input"
        />
        <GroupFeedbackDialog
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          initial={memories.after?.my_feedback ?? null}
          onSave={memories.saveFeedback}
        />
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={open => { if (!open) setDeleteTarget(null) }}
          title="この写真の投稿を削除しますか？"
          message={`同じ投稿の写真 ${deleteTarget?.count ?? 1} 枚が消え、元に戻せません。チャットには「メッセージを削除しました」と表示されます。`}
          confirmLabel="削除する"
          variant="danger"
          onConfirm={confirmDeletePhotos}
        />
      </>
    )}
    </ChatVisibleContext.Provider>
  )
}

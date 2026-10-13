/**
 * 貸切グループのチャット（グループページ刷新 段階 2: X の DM グループ並みに）。
 * 発言（返信・リアクション・既読の人数・写真・ピン留め・削除）、入力中の表示。
 * 自動のお知らせはすべて灰色の 1 行（カードを流さない。2026-10-11）。配役の操作は全画面シート（#1035）。部品は ./chat/ に分けている。
 */
import { usePrivateGroupSnapshot } from '@/hooks/usePrivateGroupSnapshot'
import { usePrivateGroupMessages } from '@/hooks/usePrivateGroupMessages'
import { usePrivateGroupChatState, type PrivateGroupChatState } from '@/hooks/usePrivateGroupChatState'
import { privateGroupMemberAction } from '@/lib/privateGroupGuestSession'
import { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, ClipboardList, X } from 'lucide-react'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { deleteGroupMessage, privateGroupChatAction, sendGroupPhotos } from '@/lib/privateGroupChat'
import { getErrorMessage } from '@/lib/errorFields'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { Sentry } from '@/lib/sentry'
import { isPastPerformanceDate } from '@/lib/surveyCompletion'
import { toast } from 'sonner'
import type { PrivateGroupMember, PrivateGroupMessage } from '@/types'
import { SurveyResponseForm } from '@/pages/PrivateGroupInvite/components/SurveyResponseForm'
import { getJstParts, formatJstTime } from '@/utils/jstDate'
import { ConfirmDialog } from '@/components/patterns/modal'
import { castingLine, chunkChatEntries, closedHandoverRequestIds, surveyLine, formatChatDate, groupMessagesByDate, isNoticeForMe, noticeLineResolver, parseSystemMessage } from './groupChatMessages'
import { SystemNoticeLine } from './SystemNoticeLine'
import { ChatBubble } from './chat/ChatBubble'
import { ChatComposer } from './chat/ChatComposer'
import { MessageActionSheet } from './chat/MessageActionSheet'
import { PhotoViewer, type ViewerPhoto } from './chat/PhotoViewer'
import { jumpToMessage, savePhoto } from './chat/chatDom'
import { PinnedBar } from './chat/PinnedBar'
import { useTypingPresence } from './chat/useTypingPresence'
import { ChatVisibleContext, MESSAGE_SENT_EVENT, type MessageSentDetail } from './chat/chatVisibility'
import { useGroupPhotoUrls } from './chat/useGroupPhotoUrls'
import { resizePhoto } from './chat/photoResize'
import { groupReactions, pinnedMessages, quoteText, readCountFor, typingText } from './chat/chatModel'

interface GroupChatProps {
  groupId: string
  currentMemberId: string | null
  members: PrivateGroupMember[]
  fullHeight?: boolean
  onGoToSchedule?: () => void
  /** 概要タブへ（店舗の確定・取消のお知らせの「概要を見る」） */
  onGoToOverview?: () => void
  /** 概要タブの「配役」欄へ（?tab=overview#casting）。配役の操作はそこで行う */
  onGoToCasting?: () => void
  /** 配役の全画面シートを開く（?sheet=casting-method / casting-pick、#1035） */
  onOpenCastingSheet?: (sheet: 'casting-method' | 'casting-pick') => void
  scenarioId?: string
  organizationId?: string
  performanceDate?: string
  needsCharAssignmentChoice?: boolean
  charAssignmentMethod?: string | null
  /** 作品の登場人物（配役の状態の 1 行を出すかの判定だけに使う） */
  characters?: ReadonlyArray<{ id: string; name: string }>
  isOrganizer?: boolean
  /** アンケートを別の画面で開く（招待ページ）。渡さない場合はチャットの上の枠で開く */
  onOpenSurvey?: () => void
  /** 主催者の引き継ぎ確認画面を開く（依頼 id を渡す） */
  onOpenHandover?: (requestId: string) => void
  /** 親（グループページ）が読んでいるメッセージ。渡されたらここでは読まない（未読数と二重に読まないため） */
  messagesSource?: ReturnType<typeof usePrivateGroupMessages>
  /** 親が読んでいる既読・リアクション（未読数と共用） */
  chatStateSource?: PrivateGroupChatState
  /** ピン留めの一覧を開く（⋮ メニューと同じ） */
  onOpenPins?: () => void
  /** 招待コード（入力中・いま見ている人の Realtime チャンネル名のもと。段階 3）。無ければグループ id */
  channelKey?: string
}

/** 下端からこの距離以内なら、新しい発言が来たら下まで動かす */
const STICK_TO_BOTTOM_PX = 160

export function GroupChat({ groupId, currentMemberId, fullHeight = false, onGoToSchedule, onGoToOverview, onGoToCasting, onOpenCastingSheet, scenarioId, organizationId, performanceDate, needsCharAssignmentChoice, charAssignmentMethod, characters = [], isOrganizer = false, onOpenSurvey, onOpenHandover, messagesSource, chatStateSource, onOpenPins, channelKey }: GroupChatProps) {
  const { user } = useAuth()
  const ownMessages = usePrivateGroupMessages(groupId, currentMemberId, { enabled: !messagesSource })
  const { messages, loading, error: messagesError, refetch: refetchMessages } = messagesSource ?? ownMessages
  const ownChatState = usePrivateGroupChatState(groupId, currentMemberId, { enabled: !chatStateSource })
  const chatState = chatStateSource ?? ownChatState
  const { group: chatGroup, refetch: refreshGroup } = usePrivateGroupSnapshot(groupId, null, currentMemberId, 5000)
  const members = useMemo(() => chatGroup?.members || [], [chatGroup?.members])
  const scrollRef = useRef<HTMLDivElement>(null)
  // 個別お知らせのフォールバック表示を検知したら1回だけ診断ログを送る（#278）
  const noticeFallbackLoggedRef = useRef(false)
  const [showSurveyDialog, setShowSurveyDialog] = useState(false)
  // チャットの上の小さな枠で回答できないという報告があったため（2026-10-05）、招待ページではアンケートだけの画面で開く
  const openSurvey = useCallback(() => { if (onOpenSurvey) onOpenSurvey(); else setShowSurveyDialog(true) }, [onOpenSurvey])
  const [replyTo, setReplyTo] = useState<PrivateGroupMessage | null>(null)
  const [menuFor, setMenuFor] = useState<PrivateGroupMessage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PrivateGroupMessage | null>(null)
  const [viewer, setViewer] = useState<{ photos: ViewerPhoto[]; index: number } | null>(null)
  const [deadlineText, setDeadlineText] = useState<string | null>(null)
  // アンケートが有効で、質問か外部の回答先があるか（配役方法に関わらず回答できるようにする。#911）
  const [surveyAvailable, setSurveyAvailable] = useState(false)
  const [chatEnabled, setChatEnabled] = useState(true)
  const [chatGuestAllowed, setChatGuestAllowed] = useState(true)
  // 組織が決めた「事前読み込み」のお知らせの見出し（ほかの見出しは 1 行の決まった文にした）
  const [preReadingTitle, setPreReadingTitle] = useState('事前読み込みについて')
  const isGuest = !user

  // 組織のチャット設定を取得
  useEffect(() => {
    if (!organizationId) return
    ;(async () => {
      const { data } = await privateGroupPageReadApi.getChatSettings(organizationId)
      if (data) {
        const d = data as Record<string, unknown>
        setChatEnabled((d.chat_enabled as boolean | undefined) ?? true)
        setChatGuestAllowed((d.chat_guest_allowed as boolean | undefined) ?? true)
        setPreReadingTitle(prev => (d.system_msg_pre_reading_notice_title as string) || prev)
      }
    })()
  }, [organizationId])

  const chatBlockedForGuest = isGuest && !chatGuestAllowed
  const sendDisabled = !chatEnabled || chatBlockedForGuest
  const sendBlockMessage = !chatEnabled
    ? 'チャット機能はこの店舗で無効化されています'
    : chatBlockedForGuest
      ? 'ゲストの投稿は許可されていません（MMQアカウントでログインしてください）'
      : null

  // 回答画面と同じ公演・店舗・作品・組織の適用値を使う。
  useEffect(() => {
    setDeadlineText('')
    setSurveyAvailable(false)
    if (!currentMemberId || !performanceDate) return
    let cancelled = false
    void (async () => {
      const { data, error } = await privateGroupMemberAction(groupId, currentMemberId, 'survey_read')
      if (error) { logger.error('アンケート期限の取得エラー:', error); return }
      if (!cancelled && data?.survey_enabled) {
        // このカードは配役方法が「アンケート」以外のときに出し、その場合キャラクター選択は出さないので数えない
        const hasQuestions = Array.isArray(data.questions)
          && data.questions.some((q: { question_type?: string }) => q?.question_type !== 'character_selection')
        const hasUrl = typeof data.survey_url === 'string' && /^https?:\/\//i.test(data.survey_url)
        setSurveyAvailable(hasQuestions || hasUrl)
      }
      if (!cancelled && data?.survey_enabled && data.survey_deadline_days != null) {
        const deadline = data.survey_deadline_at ? new Date(data.survey_deadline_at) : new Date(new Date(performanceDate + 'T23:59:59.999+09:00').getTime() - data.survey_deadline_days * 86400000)
        const p = getJstParts(deadline)
        if (p) setDeadlineText(`${Number(p.mo)}月${Number(p.d)}日まで`)
      }
    })()
    return () => { cancelled = true }
  }, [groupId, currentMemberId, performanceDate])

  // pre_reading_notice が送信済みであれば配役フローを表示する
  // 認可済みグループ情報で人数上限が未設定の場合のフォールバック
  const hasPreReadingNotice = messages.some(m => {
    try { return JSON.parse(m.message)?.action === 'pre_reading_notice' } catch { return false }
  })
  const effectiveNeedsCharAssignmentChoice = needsCharAssignmentChoice || (hasPreReadingNotice && !charAssignmentMethod)

  // 過去の配役通知は履歴に残し、最後に方法を選び直した後の確定だけを現在の状態とする。
  let currentAssignmentConfirmed = false
  for (const message of messages) {
    try {
      const action = JSON.parse(message.message)?.action
      if (action === 'character_method_selected') currentAssignmentConfirmed = false
      else if (action === 'character_assignment') currentAssignmentConfirmed = true
    } catch { /* 通常のチャット本文 */ }
  }

  const getMemberName = useCallback((memberId: string | null) => {
    if (!memberId) return '退出したメンバー'
    const member = members.find(m => m.id === memberId)
    if (member) {
      return member.guest_name || member.users?.email?.split('@')[0] || 'メンバー'
    }
    // メンバー情報がまだ取得できていない可能性があるので「メンバー」と表示
    if (memberId === currentMemberId) {
      return 'メンバー'
    }
    return '退出したメンバー'
  }, [members, currentMemberId])

  const myName = useMemo(() => members.find(m => m.id === currentMemberId)?.guest_name || 'メンバー', [members, currentMemberId])
  const chatVisible = useContext(ChatVisibleContext)
  const { typingNames, notifyTyping, notifyStopped } = useTypingPresence(channelKey || groupId, currentMemberId, myName, Boolean(currentMemberId) && chatEnabled, chatVisible)
  const { urlOf } = useGroupPhotoUrls(groupId, currentMemberId, messages)
  const reactionsByMessage = useMemo(() => groupReactions(chatState.state.reactions), [chatState.state.reactions])
  const messageById = useMemo(() => new Map(messages.map(m => [m.id, m])), [messages])
  const pinned = useMemo(() => pinnedMessages(messages), [messages])

  // 下の方を見ているときは、新しい発言・写真の読み込み・ピン留めの帯などで高さが変わっても下に付けておく。
  // 上を読み返しているときは動かさない（自分が送ったときは下へ）
  const stickToBottom = useRef(true)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content || typeof ResizeObserver === 'undefined') return
    const onScroll = () => { stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX }
    const observer = new ResizeObserver(() => { if (stickToBottom.current) scrollToEnd() })
    el.addEventListener('scroll', onScroll, { passive: true })
    observer.observe(content)
    observer.observe(el)
    return () => { el.removeEventListener('scroll', onScroll); observer.disconnect() }
  }, [scrollToEnd, loading])
  const lastCount = useRef(0)
  useEffect(() => {
    const grew = messages.length > lastCount.current
    lastCount.current = messages.length
    if (grew && (stickToBottom.current || messages[messages.length - 1]?.member_id === currentMemberId)) {
      stickToBottom.current = true
      scrollToEnd()
    }
  }, [messages, currentMemberId, scrollToEnd])

  const handleSend = async (text: string, files: File[]): Promise<boolean> => {
    if (!currentMemberId) return false
    const firstOwn = !messages.some(m => m.member_id === currentMemberId && !parseSystemMessage(m.message))
    try {
      if (files.length > 0) {
        const photos = []
        for (const file of files) photos.push(await resizePhoto(file))
        await sendGroupPhotos({ groupId, memberId: currentMemberId, photos, caption: text, replyTo: replyTo?.id ?? null })
      } else {
        await privateGroupChatAction(groupId, currentMemberId, 'message', { message: text, reply_to: replyTo?.id ?? null })
      }
      setReplyTo(null)
      notifyStopped()
      window.dispatchEvent(new CustomEvent<MessageSentDetail>(MESSAGE_SENT_EVENT, { detail: { groupId, firstOwn } }))
      await refetchMessages()
      void refreshGroup(true)
      return true
    } catch (err) {
      logger.error('Failed to send message', err)
      toast.error(files.length > 0 ? `写真を送信できませんでした${getErrorMessage(err) ? `（${getErrorMessage(err)}）` : ''}` : 'メッセージを送信できませんでした。入力内容を確認して再度お試しください')
      return false
    }
  }

  const togglePin = async (msg: PrivateGroupMessage) => {
    if (!currentMemberId) return
    try {
      await privateGroupChatAction(groupId, currentMemberId, 'pin', { message_id: msg.id, pinned: !msg.pinned_at })
      toast.success(msg.pinned_at ? 'ピン留めを外しました' : 'ピン留めしました')
      await refetchMessages()
    } catch (err) {
      toast.error(getErrorMessage(err) || 'ピン留めできませんでした')
    }
  }

  const react = (messageId: string, emoji: string) => {
    void chatState.react(messageId, emoji).catch(err => toast.error(getErrorMessage(err) || 'リアクションできませんでした'))
  }

  const photosOf = (msg: PrivateGroupMessage): ViewerPhoto[] => (msg.photos ?? []).map(p => ({ url: urlOf(msg.id, p.position), label: getMemberName(msg.member_id) }))

  const saveMessagePhotos = async (msg: PrivateGroupMessage) => {
    const photos = photosOf(msg)
    for (const [i, p] of photos.entries()) if (p.url) await savePhoto(p.url, `photo-${i + 1}.jpg`)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !currentMemberId) return
    try {
      await deleteGroupMessage(groupId, currentMemberId, deleteTarget.id)
      if (replyTo?.id === deleteTarget.id) setReplyTo(null)
      await refetchMessages()
      toast.success('メッセージを削除しました')
    } catch (err) {
      toast.error(getErrorMessage(err) || '削除できませんでした')
    } finally {
      setDeleteTarget(null)
    }
  }

  const formatTime = (dateStr: string) => formatJstTime(dateStr)
  const formatDate = (dateStr: string) => formatChatDate(dateStr)

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const messageGroups = groupMessagesByDate(messages)
  // 主催者の引き継ぎ依頼のうち、成立・お断り・取り消し・期限切れの記録が出たもの（個別お知らせの「確認する」を消す）
  const closedHandoverIds = closedHandoverRequestIds(messages)
  // ゲストユーザーの場合はcurrentMemberIdを使用、ログインユーザーの場合はuser_idで検索
  const memberIdFromUser = user ? members.find(m => m.user_id === user.id)?.id : null
  const effectiveMemberId = currentMemberId || memberIdFromUser
  // 自動のお知らせはすべて灰色の 1 行（チャットにカードを流さない。2026-10-11 社長決定）。吹き出しは人の発言と写真だけ
  const currentCandidates = chatGroup?.candidate_dates ?? null
  const resolveLine = noticeLineResolver({
    getMemberName, current: currentCandidates, status: chatGroup?.status, myMemberId: effectiveMemberId ?? null,
    userId: user?.id ?? null, closedHandoverIds: closedHandoverIds, charAssignmentMethod, preReadingTitle,
  })
  const lineOf = (msg: PrivateGroupMessage) => {
    const system = parseSystemMessage(msg.message)
    // 診断: currentMemberId では宛先と一致しないがフォールバックで表示できた個別お知らせを 1 回だけ記録（#278）
    if (system?.action === 'individual_notice' && system.target_member_id !== currentMemberId && !noticeFallbackLoggedRef.current
      && isNoticeForMe(system, effectiveMemberId ?? null, user?.id ?? null)) {
      noticeFallbackLoggedRef.current = true
      Sentry.captureMessage('individual_notice: currentMemberId未解決のためフォールバック表示', {
        level: 'warning',
        tags: { feature: 'group-chat' },
        extra: { groupId, currentMemberId, memberIdFromUser, hasUser: !!user },
      })
    }
    return resolveLine(msg)
  }
  const canOpenSurvey = Boolean(scenarioId && organizationId && currentMemberId)
  const lineHandlers = { onGoToSchedule, onGoToOverview, onGoToCasting, onOpenCastingSheet, onOpenSurvey: canOpenSurvey ? openSurvey : undefined, onOpenHandover }
  const myPreference = effectiveMemberId ? (chatGroup?.character_assignments as Record<string, string> | null | undefined)?.[effectiveMemberId] : null
  const casting = castingLine({
    isOrganizer, needsMethodChoice: effectiveNeedsCharAssignmentChoice, method: charAssignmentMethod, hasCharacters: characters.length > 0,
    confirmed: currentAssignmentConfirmed, myPreference, isMember: Boolean(effectiveMemberId),
  })
  const survey = surveyLine({ canOpen: canOpenSurvey, method: charAssignmentMethod, available: surveyAvailable, past: isPastPerformanceDate(performanceDate), deadlineText })
  const typing = typingText(typingNames)
  const menuMessage = menuFor ? messageById.get(menuFor.id) ?? null : null

  return (
    <>
    <Card className={`flex flex-col ${fullHeight ? 'flex-1 h-full border-0 shadow-none' : 'h-[500px]'}`}>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <PinnedBar
          pinned={pinned}
          nameOf={getMemberName}
          canUnpin={isOrganizer}
          onJump={id => jumpToMessage(id)}
          onUnpin={id => { const m = messageById.get(id); if (m) void togglePin(m) }}
          onOpenList={onOpenPins}
        />
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 bg-muted/40" data-testid="chat-scroll">
          <div ref={contentRef}>
          {/* 未ログイン閲覧の警告（#275: 未ログインでもページは正常表示されるが個別お知らせだけ消えるため） */}
          {!user && !currentMemberId && (
            <div className="flex justify-center">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 max-w-sm text-center">
                ログインしていないため、あなた宛の個別のお知らせは表示されません。参加時のアカウントでログインしてご確認ください。
              </div>
            </div>
          )}
          {messagesError ? (
            <div role="alert" className="text-center text-sm py-8">
              チャットを取得できませんでした。参加時のアカウントまたはゲスト認証をご確認ください。
              <Button variant="outline" onClick={() => void refetchMessages()}>再読み込み</Button>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              まだメッセージがありません。<br />
              最初のメッセージを送信してみましょう
            </div>
          ) : (
            messageGroups.map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-1">
                <p className="text-center text-xs text-muted-foreground pt-2">{formatDate(group.date)}</p>
                {chunkChatEntries(group.messages, lineOf).map((entry) => {
                  if (entry.kind === 'line') return <SystemNoticeLine key={entry.key} lines={entry.lines} handlers={lineHandlers} />
                  const msg = entry.message
                  const isOwnMessage = msg.member_id === effectiveMemberId

                  // 参加者の発言
                  const sender = members.find(m => m.id === msg.member_id)
                  const replied = msg.reply_to_message_id ? messageById.get(msg.reply_to_message_id) : null
                  return (
                    <ChatBubble
                      key={msg.id}
                      msg={msg}
                      isOwn={isOwnMessage}
                      name={getMemberName(msg.member_id)}
                      isGuest={Boolean(sender && !sender.user_id)}
                      time={formatTime(msg.created_at)}
                      quote={msg.reply_to_message_id ? quoteText(replied ? getMemberName(replied.member_id) : 'メッセージ', replied) : null}
                      onQuoteClick={replied ? () => jumpToMessage(replied.id) : undefined}
                      reactions={reactionsByMessage.get(msg.id) ?? []}
                      readCount={isOwnMessage ? readCountFor(msg.created_at, chatState.state.read_times) : null}
                      urlOf={urlOf}
                      onOpenPhoto={position => setViewer({ photos: photosOf(msg), index: Math.max(0, (msg.photos ?? []).findIndex(p => p.position === position)) })}
                      onOpenMenu={() => setMenuFor(msg)}
                      onToggleReaction={emoji => react(msg.id, emoji)}
                    />
                  )
                })}
              </div>
            ))
          )}
          {/* 配役の操作はいまの状態の箱から開く全画面シート（#1035）。チャットには状態の灰色 1 行と事前配役アンケートのお願いだけ */}
          {casting && <SystemNoticeLine lines={[casting]} handlers={lineHandlers} />}
          {survey && <SystemNoticeLine lines={[survey]} handlers={lineHandlers} />}
          {typing && <p className="text-center text-xs text-muted-foreground mt-3" data-testid="chat-typing">{typing}</p>}
          </div>
        </div>

        <ChatComposer
          disabled={!currentMemberId || sendDisabled}
          blockMessage={sendBlockMessage}
          replyQuote={replyTo ? quoteText(getMemberName(replyTo.member_id), replyTo) : null}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSend}
          onTyping={notifyTyping}
        />
      </CardContent>
    </Card>

      {menuMessage && (
        <MessageActionSheet
          myReaction={(reactionsByMessage.get(menuMessage.id) ?? []).find(r => r.mine)?.emoji ?? null}
          canPin={isOrganizer}
          pinned={Boolean(menuMessage.pinned_at)}
          hasText={Boolean(menuMessage.message)}
          hasPhotos={(menuMessage.photos?.length ?? 0) > 0}
          canDelete={menuMessage.member_id === effectiveMemberId}
          onReact={emoji => react(menuMessage.id, emoji)}
          onReply={() => setReplyTo(menuMessage)}
          onCopy={() => void navigator.clipboard?.writeText(menuMessage.message).then(() => toast.success('コピーしました'), () => toast.error('コピーできませんでした'))}
          onTogglePin={() => void togglePin(menuMessage)}
          onSavePhotos={() => void saveMessagePhotos(menuMessage)}
          onDelete={() => setDeleteTarget(menuMessage)}
          onClose={() => setMenuFor(null)}
        />
      )}
      {viewer && <PhotoViewer photos={viewer.photos} startIndex={viewer.index} onClose={() => setViewer(null)} />}

      {/* 事前配役アンケート（グループ画面から開くときは onOpenSurvey で全画面のシートへ。ここは渡されていない場合の予備） */}
      {showSurveyDialog && currentMemberId && (
        <SurveyResponseForm
          groupId={groupId}
          memberId={currentMemberId}
          performanceDate={performanceDate}
          characters={characters}
          hideCharacterSelection={charAssignmentMethod !== 'survey'}
          onClose={() => setShowSurveyDialog(false)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="このメッセージを削除しますか？"
        message={(deleteTarget?.photos?.length ?? 0) > 0 ? '写真も消え、元に戻せません。チャットには「メッセージを削除しました」と表示されます。' : '元に戻せません。チャットには「メッセージを削除しました」と表示されます。'}
        confirmLabel="削除する"
        variant="danger"
        onConfirm={confirmDelete}
      />
    </>
  )
}

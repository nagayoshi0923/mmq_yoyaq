import { usePrivateGroupSnapshot } from '@/hooks/usePrivateGroupSnapshot'
import { usePrivateGroupMessages } from '@/hooks/usePrivateGroupMessages'
import { privateGroupMemberAction } from '@/lib/privateGroupGuestSession'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Send, Loader2, CheckCircle2, X, ClipboardList, Users, AlertTriangle } from 'lucide-react'
import { privateGroupRpcApi } from '@/lib/api/privateGroupRpcApi'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { Sentry } from '@/lib/sentry'
import { toast } from 'sonner'
import type { PrivateGroupMessage, PrivateGroupMember } from '@/types'
import { SurveyResponseForm } from '@/pages/PrivateGroupInvite/components/SurveyResponseForm'
import { formatJstDateJa, getJstParts, formatJstTime } from '@/utils/jstDate'
import { ConfirmDialog } from '@/components/patterns/modal'
import { formatChatDate, groupMessagesByDate, parseSystemMessage, type SystemMessage } from './groupChatMessages'
import { SIMPLE_SYSTEM_MESSAGE_ACTIONS, SystemNoticeCard } from './SystemNoticeCard'
import { renderMessageWithLinks } from './renderMessageWithLinks'

interface CharacterData {
  id: string
  name: string
  gender?: string
  image_url?: string
  image_position?: string
  image_scale?: number | null
}

interface GroupChatProps {
  groupId: string
  currentMemberId: string | null
  members: PrivateGroupMember[]
  fullHeight?: boolean
  onGoToSchedule?: () => void
  scenarioId?: string
  organizationId?: string
  performanceDate?: string
  needsCharAssignmentChoice?: boolean
  onCharAssignmentMethodSelected?: (method: 'survey' | 'self') => void | Promise<void>
  charAssignmentMethod?: string | null
  characters?: CharacterData[]
  isOrganizer?: boolean
  onCharAssignmentConfirmed?: () => void
  onResetCharAssignmentMethod?: () => void | Promise<void>
  scenarioPlayerCount?: number | null
}


export function GroupChat({ groupId, currentMemberId, fullHeight = false, onGoToSchedule, scenarioId, organizationId, performanceDate, needsCharAssignmentChoice, onCharAssignmentMethodSelected, charAssignmentMethod, characters = [], isOrganizer = false, onCharAssignmentConfirmed, onResetCharAssignmentMethod, scenarioPlayerCount }: GroupChatProps) {
  const { user } = useAuth()
  const { messages, loading, error: messagesError, refetch: refetchMessages } = usePrivateGroupMessages(groupId, currentMemberId)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const { group: chatGroup, refetch: refreshGroup } = usePrivateGroupSnapshot(groupId, null, currentMemberId, 5000)
  const members = useMemo(() => chatGroup?.members || [], [chatGroup?.members])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // 個別お知らせのフォールバック表示を検知したら1回だけ診断ログを送る（#278）
  const noticeFallbackLoggedRef = useRef(false)
  const [showSurveyDialog, setShowSurveyDialog] = useState(false)
  // 配役方法変更の確認ダイアログ（アンケート回答カード/キャラクター選択カードの両方から起動）
  const [showResetCharAssignmentConfirm, setShowResetCharAssignmentConfirm] = useState(false)
  const [charPreferences, setCharPreferences] = useState<Record<string, string>>({})
  const [charSaving, setCharSaving] = useState(false)
  const [methodSaving, setMethodSaving] = useState(false)
  const [charConfirmStep, setCharConfirmStep] = useState(false)
  const [charDecisions, setCharDecisions] = useState<Record<string, string>>({})
  const [charConfirmExpected, setCharConfirmExpected] = useState<Record<string, string>>({})
  const [charSubmitting, setCharSubmitting] = useState(false)
  const [deadlineText, setDeadlineText] = useState<string | null>(null)
  const [chatEnabled, setChatEnabled] = useState(true)
  const [chatGuestAllowed, setChatGuestAllowed] = useState(true)
  const [systemMsgTitles, setSystemMsgTitles] = useState<{
    candidate_dates_added: string
    pre_reading_notice: string
    survey_notice: string
    performance_cancelled: string
  }>({
    candidate_dates_added: '候補日程が追加されました',
    pre_reading_notice: '事前読み込みについて',
    survey_notice: 'アンケートのご協力のお願い',
    performance_cancelled: '公演中止のお知らせ',
  })
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
        setSystemMsgTitles(prev => ({
          candidate_dates_added: (d.system_msg_candidate_dates_added_title as string) || prev.candidate_dates_added,
          pre_reading_notice:    (d.system_msg_pre_reading_notice_title as string)    || prev.pre_reading_notice,
          survey_notice:         (d.system_msg_survey_notice_title as string)         || prev.survey_notice,
          performance_cancelled: (d.system_msg_performance_cancelled_title as string) || prev.performance_cancelled,
        }))
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
    if (!currentMemberId || !performanceDate) return
    let cancelled = false
    void (async () => {
      const { data, error } = await privateGroupMemberAction(groupId, currentMemberId, 'survey_read')
      if (error) { logger.error('アンケート期限の取得エラー:', error); return }
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

  // デバッグログ
  logger.log('📋 GroupChat: props', { groupId, currentMemberId, scenarioId, organizationId, performanceDate })

  const fetchMembers = useCallback(() => refreshGroup(true), [refreshGroup])
  useEffect(() => {
    setCharPreferences((chatGroup?.character_assignments || {}) as Record<string, string>)
  }, [chatGroup])

  const handleSelectCharPreference = useCallback(async (charId: string) => {
    if (!currentMemberId) return
    setCharPreferences(prev => ({ ...prev, [currentMemberId]: charId }))
    setCharSaving(true)
    try {
      const { error } = await privateGroupMemberAction(groupId, currentMemberId, 'character_preference', { characterId: charId })
      if (error) throw error
    } catch (err) {
      logger.error('キャラクター選択エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      await refreshGroup()
      setCharSaving(false)
    }
  }, [currentMemberId, groupId, refreshGroup])

  const handleGoToCharConfirm = useCallback(async () => {
    // 取得できないときに空の配役で上書きしない。
    const latestSnapshot = await refreshGroup()
    if (!latestSnapshot) {
      toast.error('配役情報を取得できませんでした。再読み込みしてください')
      return
    }
    const latest = (latestSnapshot.group.character_assignments || {}) as Record<string, string>
    setCharPreferences(latest)
    setCharDecisions({ ...latest })
    setCharConfirmExpected({ ...latest })
    setCharConfirmStep(true)
  }, [refreshGroup])

  const handleCharConfirmAndSend = useCallback(async () => {
    setCharSubmitting(true)
    try {
      const activeMembers = members.filter(m => (m.status as string) === 'active' || m.status === 'joined')
      const assignments = Object.fromEntries(activeMembers.map(m => [m.id, charDecisions[m.id]]))
      const { error } = await privateGroupRpcApi.confirmCharacters({
        p_group_id: groupId,
        p_assignments: assignments,
        p_expected_assignments: charConfirmExpected,
      })
      if (error) throw error
      await refreshGroup()
      toast.success('配役を確定しました')
      setCharConfirmStep(false)
      onCharAssignmentConfirmed?.()
    } catch (err) {
      logger.error('配役確定エラー:', err)
      toast.error('配役の確定に失敗しました。希望や参加者が変更されていないか確認してください')
    } finally {
      setCharSubmitting(false)
    }
  }, [members, charDecisions, charConfirmExpected, groupId, onCharAssignmentConfirmed, refreshGroup])

  const selectCharacterMethod = async (method: 'survey' | 'self') => {
    if (methodSaving) return
    setMethodSaving(true)
    try {
      await onCharAssignmentMethodSelected?.(method)
      setCharConfirmStep(false)
      await Promise.all([refreshGroup(), refetchMessages()])
    } catch (error) {
      logger.error('配役方法の変更エラー:', error)
      toast.error('配役方法を保存できませんでした。最新の状態を確認してください')
    } finally { setMethodSaving(false) }
  }

  const resetCharacterMethod = async () => {
    try {
      await onResetCharAssignmentMethod?.()
      setCharConfirmStep(false)
      await Promise.all([refreshGroup(), refetchMessages()])
    } catch (error) {
      toast.error('配役方法を変更できませんでした。最新の状態を確認してください')
      throw error
    }
  }

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
    // メンバーが見つからないが、currentMemberIdと一致する場合は「あなた」と表示しない（自分のメッセージは右側に表示されるため）
    // ただしメンバー情報がまだ取得できていない可能性があるので「メンバー」と表示
    if (memberId === currentMemberId) {
      return 'メンバー'
    }
    return '退出したメンバー'
  }, [members, currentMemberId])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!newMessage.trim() || !currentMemberId || sending) return

    setSending(true)
    try {
      const { error } = await privateGroupMemberAction(groupId, currentMemberId, 'message', { message: newMessage.trim() })

      if (error) throw error
      setNewMessage('')
      await refetchMessages()
      
      // メッセージ送信後、メンバー一覧を再取得して最新状態に
      fetchMembers()
    } catch (err) {
      logger.error('Failed to send message', err)
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (dateStr: string) => {
    return formatJstTime(dateStr)
  }

  const formatDate = (dateStr: string) => formatChatDate(dateStr)

  const formatDateTime = (dateStr: string) => {
    return `${formatDate(dateStr)} ${formatTime(dateStr)}`
  }

  // システムメッセージかどうか判定（DB/クライアントで string または object のどちらでも来うる）
  // 候補日を見やすい形式に整形
  const formatCandidateDate = (dateStr: string, timeSlot: string) => {
    return `${formatJstDateJa(dateStr, true)} ${timeSlot}`
  }

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
  // ゲストユーザーの場合はcurrentMemberIdを使用、ログインユーザーの場合はuser_idで検索
  // currentMemberIdを優先し、なければmembersから検索
  const memberIdFromUser = user ? members.find(m => m.user_id === user.id)?.id : null
  const effectiveMemberId = currentMemberId || memberIdFromUser

  return (
    <>
    <Card className={`flex flex-col ${fullHeight ? 'flex-1 h-full border-0 shadow-none' : 'h-[500px]'}`}>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              最初のメッセージを送信してみましょう！
            </div>
          ) : (
            messageGroups.map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-2">
                <div className="flex justify-center">
                  <span className="text-xs text-muted-foreground bg-gray-100 px-3 py-1 rounded-full">
                    {formatDate(group.date)}
                  </span>
                </div>
                {group.messages.map((msg) => {
                  const isOwnMessage = msg.member_id === effectiveMemberId
                  const systemMsg = parseSystemMessage(msg.message)

                  // 表示だけのお知らせ（候補日追加・日程確定・事前読み込み・アンケート・作成・参加・申込・却下・取消・スタッフ）
                  if (systemMsg && SIMPLE_SYSTEM_MESSAGE_ACTIONS.has(systemMsg.action)) {
                    return (
                      <SystemNoticeCard
                        key={msg.id}
                        systemMsg={systemMsg}
                        msg={msg}
                        systemMsgTitles={systemMsgTitles}
                        getMemberName={getMemberName}
                        formatDateTime={formatDateTime}
                        formatCandidateDate={formatCandidateDate}
                        onGoToSchedule={onGoToSchedule}
                        canOpenSurvey={Boolean(scenarioId && organizationId && currentMemberId)}
                        onOpenSurvey={() => setShowSurveyDialog(true)}
                      />
                    )
                  }

                  // システムメッセージ（個別お知らせ）- 対象者本人のみに表示
                  if (systemMsg && systemMsg.action === 'individual_notice') {
                    // 対象本人か判定（#275/#278）:
                    // - member_id 一致（prop の currentMemberId が未解決でも user_id から引き直した effectiveMemberId で補完）
                    // - または通知に埋め込まれた target_user_id とログインユーザーの一致（メンバー行の再作成後も届く）
                    const isTargetByMember = !!effectiveMemberId && systemMsg.target_member_id === effectiveMemberId
                    const isTargetByUser = !!user && !!systemMsg.target_user_id && systemMsg.target_user_id === user.id
                    if (!isTargetByMember && !isTargetByUser) {
                      return null
                    }
                    // 診断: currentMemberId prop では不一致だがフォールバックで表示できた場合を記録（#278）
                    if (systemMsg.target_member_id !== currentMemberId && !noticeFallbackLoggedRef.current) {
                      noticeFallbackLoggedRef.current = true
                      Sentry.captureMessage('individual_notice: currentMemberId未解決のためフォールバック表示', {
                        level: 'warning',
                        tags: { feature: 'group-chat' },
                        extra: { groupId, currentMemberId, memberIdFromUser, hasUser: !!user },
                      })
                    }
                    const currentMember = members.find(m => m.id === effectiveMemberId)
                    const nickname = currentMember?.guest_name || 'あなた'
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">!</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-indigo-800">
                                {nickname}さんへのお知らせ
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-3 mt-2 border border-indigo-100 overflow-hidden">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap break-all">
                              {renderMessageWithLinks(systemMsg.message || '')}
                            </p>
                          </div>
                          <p className="text-xs text-indigo-400 mt-2 text-center">
                            🔒 このお知らせはあなただけに表示されています
                          </p>
                        </div>
                      </div>
                    )
                  }

                  // 配役方法選択
                  if (systemMsg && systemMsg.action === 'character_method_selected') {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                              <Users className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-purple-800">
                                {systemMsg.title || '配役方法が選択されました'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-purple-100">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {systemMsg.body}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // キャラクター配役確定（方法がリセットされている場合は非表示）
                  if (systemMsg && systemMsg.action === 'character_assignment') {
                    if (!charAssignmentMethod) return null
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-purple-800">
                                {systemMsg.title || 'キャラクター配役が確定しました'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-purple-100">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {systemMsg.body}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // 通常のメッセージ
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] ${
                          isOwnMessage ? 'order-1' : ''
                        }`}
                      >
                        {!isOwnMessage && (
                          <div className="text-xs text-muted-foreground mb-1">
                            {getMemberName(msg.member_id)}
                          </div>
                        )}
                        <div
                          className={`px-3 py-2 rounded-2xl ${
                            isOwnMessage
                              ? 'bg-purple-600 text-white rounded-br-sm'
                              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.message}
                          </p>
                        </div>
                        <div
                          className={`text-xs text-muted-foreground mt-0.5 ${
                            isOwnMessage ? 'text-right' : ''
                          }`}
                        >
                          {formatTime(msg.created_at)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}
          {/* 配役方法の選択カード（主催者のみ） */}
          {effectiveNeedsCharAssignmentChoice && isOrganizer && onCharAssignmentMethodSelected && (
            <div className="flex justify-center my-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="font-semibold text-sm">キャラクターの配役方法</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  キャラクターの配役をどのように決めますか？
                </p>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full h-auto py-3 flex flex-col items-start gap-0.5 border-purple-200 hover:bg-purple-100"
                    disabled={methodSaving}
                    onClick={() => void selectCharacterMethod('survey')}
                  >
                    <span className="font-medium text-sm">アンケートで希望を伝える</span>
                    <span className="text-[10px] text-muted-foreground">スタッフが決定します</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-auto py-3 flex flex-col items-start gap-0.5 border-purple-200 hover:bg-purple-100"
                    disabled={methodSaving}
                    onClick={() => void selectCharacterMethod('self')}
                  >
                    <span className="font-medium text-sm">自分たちで決める</span>
                    <span className="text-[10px] text-muted-foreground">参加者同士で選択します</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 配役方法=survey: アンケート回答カード */}
          {charAssignmentMethod === 'survey' && scenarioId && organizationId && currentMemberId && (
            <div className="flex justify-center my-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                      <ClipboardList className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-sm text-blue-800">{systemMsgTitles.survey_notice}</span>
                  </div>
                  {isOrganizer && onResetCharAssignmentMethod && (
                    <button
                      onClick={() => setShowResetCharAssignmentConfirm(true)}
                      className="text-xs text-purple-600 underline hover:text-purple-800"
                    >
                      方法変更
                    </button>
                  )}
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-100 space-y-3">
                  <p className="text-sm text-gray-700">
                    キャラクター選択のため、アンケートへのご回答をお願いいたします。
                  </p>
                  {deadlineText && (
                    <p className="text-xs text-blue-600 font-medium">回答期限: {deadlineText}</p>
                  )}
                  <Button
                    onClick={() => setShowSurveyDialog(true)}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    <ClipboardList className="w-4 h-4 mr-2" />
                    アンケートに回答する
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 配役方法=self: インラインキャラクター選択（確定済みメッセージがあれば非表示） */}
          {charAssignmentMethod === 'self' && characters.length > 0 && !currentAssignmentConfirmed && (() => {
            const activeMembers = members.filter(m => (m.status as string) === 'active' || m.status === 'joined')
            const charNameById = (id: string | undefined) => id ? characters.find(c => c.id === id)?.name : null
            const allPreferred = activeMembers.every(m => charPreferences[m.id])
            const myPreference = currentMemberId ? charPreferences[currentMemberId] : undefined

            // 主催者の確定ステップ
            if (charConfirmStep && isOrganizer) {
              const decisionDupes = (() => {
                const chosen = activeMembers.map(m => charDecisions[m.id]).filter(Boolean)
                return [...new Set(chosen.filter((v, i) => chosen.indexOf(v) !== i))]
              })()
              const allDecided = activeMembers.every(m => charDecisions[m.id])
              logger.log('🎭 確定ステップ表示中:', { allDecided, decisionDupes, charDecisions, activeMemberIds: activeMembers.map(m=>m.id) })

              return (
                <div className="flex justify-center my-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                        <Users className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="font-semibold text-sm">配役の確定</span>
                    </div>
                    <p className="text-xs text-muted-foreground">希望を参考に配役を決定してください</p>

                    {activeMembers.map(m => {
                      const prefCharName = charNameById(charPreferences[m.id])
                      return (
                        <div key={m.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {m.guest_name || '参加者'}
                              {m.id === currentMemberId && <span className="text-xs text-purple-600 ml-1">（あなた）</span>}
                            </span>
                            {prefCharName && (
                              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                                希望: {prefCharName}
                              </Badge>
                            )}
                          </div>
                          <Select
                            value={charDecisions[m.id] || 'none'}
                            onValueChange={(v) => v !== 'none' && setCharDecisions(prev => ({ ...prev, [m.id]: v }))}
                          >
                            <SelectTrigger className="w-full h-8 text-sm">
                              <SelectValue placeholder="配役を選択" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" disabled>配役を選択</SelectItem>
                              {characters.map(char => (
                                <SelectItem key={char.id} value={char.id}>
                                  {char.name}
                                  {char.gender && ` (${char.gender === 'male' ? '男性' : char.gender === 'female' ? '女性' : char.gender === 'any' ? '性別自由' : 'その他'})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    })}

                    {decisionDupes.length > 0 && (
                      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{decisionDupes.map(id => charNameById(id)).filter(Boolean).join('、')} が複数人に割り当てられています</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCharConfirmStep(false)}
                        className="flex-1"
                      >
                        戻る
                      </Button>
                      {allDecided && decisionDupes.length === 0 ? (
                        <Button
                          size="sm"
                          onClick={handleCharConfirmAndSend}
                          disabled={charSubmitting}
                          className="flex-1 bg-purple-600 hover:bg-purple-700"
                        >
                          {charSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '配役を確定'}
                        </Button>
                      ) : (
                        <Button size="sm" disabled className="flex-1">
                          {!allDecided ? '全員選択してください' : '被り解消してください'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            // 通常の希望選択ステップ
            return (
              <div className="flex justify-center my-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-sm">キャラクター選択</span>
                    {isOrganizer && onResetCharAssignmentMethod && (
                      <button
                      onClick={() => setShowResetCharAssignmentConfirm(true)}
                      className="text-xs text-purple-600 underline hover:text-purple-800"
                    >
                      方法変更
                    </button>
                    )}
                    <Badge variant="outline" className={`ml-auto text-[10px] ${myPreference ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                      {myPreference ? '希望済' : '未回答'}
                    </Badge>
                  </div>

                  {/* キャラクター一覧: 画像 + 誰が選んだか表示 */}
                  <div className="space-y-2">
                    {characters.map(char => {
                      const selectedBy = activeMembers.filter(m => charPreferences[m.id] === char.id)
                      const isMyChoice = myPreference === char.id
                      return (
                        <button
                          key={char.id}
                          onClick={() => handleSelectCharPreference(char.id)}
                          disabled={charSaving}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                            isMyChoice
                              ? 'bg-purple-100 border-purple-300'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {/* キャラクター画像 */}
                          {char.image_url ? (
                            <div className="w-[60px] h-[60px] rounded-lg overflow-hidden shrink-0 bg-gray-100">
                              <img
                                src={char.image_url}
                                alt={char.name}
                                className="w-full h-full object-cover"
                                style={{
                                  objectPosition: char.image_position
                                    ? `${char.image_position.split(' ')[0]}% ${char.image_position.split(' ')[1]}%`
                                    : '50% 30%',
                                  transform: char.image_scale ? `scale(${char.image_scale / 100})` : undefined,
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-[60px] h-[60px] rounded-lg bg-gray-200 shrink-0 flex items-center justify-center">
                              <Users className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          {/* 名前 + 選択者 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {isMyChoice && <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />}
                              <span className="text-sm font-medium truncate">
                                {char.name}
                              </span>
                              {char.gender && (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  ({char.gender === 'male' ? '男' : char.gender === 'female' ? '女' : char.gender === 'any' ? '自由' : char.gender})
                                </span>
                              )}
                            </div>
                            {selectedBy.length > 0 ? (
                              <p className="text-xs text-purple-700 mt-0.5 truncate">
                                {selectedBy.map(m => m.id === currentMemberId ? 'あなた' : (m.guest_name || '参加者')).join(', ')}
                              </p>
                            ) : (
                              <p className="text-xs text-gray-400 mt-0.5">未選択</p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {charSaving && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
                      <Loader2 className="w-3 h-3 animate-spin" /> 保存中...
                    </p>
                  )}

                  {deadlineText && (
                    <p className="text-xs text-center text-purple-600 font-medium">回答期限: {deadlineText}</p>
                  )}

                  {/* 参加人数の進捗 */}
                  {(() => {
                    const preferredCount = activeMembers.filter(m => charPreferences[m.id]).length
                    const requiredCount = scenarioPlayerCount || characters.length
                    const memberShortage = activeMembers.length < requiredCount
                    return (
                      <>
                        <p className="text-xs text-center text-muted-foreground">
                          {preferredCount}/{activeMembers.length}人が回答済み{isOrganizer && '（全員揃わなくても確定できます）'}
                        </p>
                        {memberShortage && (
                          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>参加メンバー（{activeMembers.length}人）がシナリオの必要人数（{requiredCount}人）に足りません。全員揃ってから配役を確定してください。</span>
                          </div>
                        )}
                      </>
                    )
                  })()}

                  {/* 主催者は確定ボタン表示（メンバー不足時は無効） */}
                  {isOrganizer && (
                    <Button
                      size="sm"
                      onClick={handleGoToCharConfirm}
                      disabled={activeMembers.length < (scenarioPlayerCount || characters.length)}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      配役を確定する
                    </Button>
                  )}
                  {allPreferred && !isOrganizer && (
                    <p className="text-xs text-center text-green-600 bg-green-50 rounded p-1.5">
                      全員の希望が揃いました。主催者が配役を確定します。
                    </p>
                  )}
                </div>
              </div>
            )
          })()}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t p-3">
          {sendBlockMessage && (
            <p className="text-xs text-muted-foreground mb-2 px-1">{sendBlockMessage}</p>
          )}
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={sendDisabled ? '送信できません' : 'メッセージを入力...'}
              disabled={!currentMemberId || sending || sendDisabled}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim() || !currentMemberId || sending || sendDisabled}
              size="icon"
              className="bg-purple-600 hover:bg-purple-700"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>

    </Card>

      {/* アンケート回答ダイアログ */}
      {showSurveyDialog && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowSurveyDialog(false)}>
          <div 
            className="absolute bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] bg-white rounded-t-2xl lg:rounded-2xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ハンドル（モバイルのみ） */}
            <div className="flex justify-center py-2 shrink-0 lg:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 pb-2 border-b shrink-0">
              <h3 className="font-semibold flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-purple-600" />
                公演前アンケート
              </h3>
              <button 
                onClick={() => setShowSurveyDialog(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            
            {/* コンテンツ */}
            <div className="overflow-y-auto flex-1 p-4">
              {!currentMemberId ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm">メンバー情報を読み込み中...</p>
                </div>
              ) : (
                <SurveyResponseForm
                  groupId={groupId}
                  memberId={currentMemberId}
                  performanceDate={performanceDate}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showResetCharAssignmentConfirm}
        onOpenChange={setShowResetCharAssignmentConfirm}
        title="配役方法を変更しますか？"
        message="配役方法を変更すると、現在送信されている回答が無効になります。よろしいですか？"
        confirmLabel="変更する"
        onConfirm={resetCharacterMethod}
      />
    </>
  )
}

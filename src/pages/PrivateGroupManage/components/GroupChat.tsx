import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Send, Loader2, Calendar, CheckCircle2, X, ClipboardList, AlertCircle, Users, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { RpcSetCharacterPreferenceParams, RpcUpsertCharacterAssignmentsToSurveyParams } from '@/lib/rpcTypes'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import type { PrivateGroupMessage, PrivateGroupMember } from '@/types'
import { SurveyResponseForm } from '@/pages/PrivateGroupInvite/components/SurveyResponseForm'

interface SystemMessage {
  type: 'system'
  action: 'candidate_dates_added' | 'schedule_confirmed' | 'pre_reading_notice' | 'survey_notice' | 'group_created' | 'member_joined' | 'booking_requested' | 'booking_rejected' | 'booking_cancelled' | 'individual_notice' | 'performance_cancelled' | 'staff_message' | 'character_assignment' | 'character_method_selected'
  count?: number
  dates?: Array<{ date: string; time_slot: string }>
  confirmedDate?: string
  confirmedTimeSlot?: string
  storeName?: string
  message?: string
  organizerName?: string
  targetCount?: number | null
  memberName?: string
  memberId?: string
  candidateCount?: number
  // 設定可能なメッセージ文言
  title?: string
  body?: string
  note?: string
  // 個別お知らせ用
  target_member_id?: string
  target_member_name?: string
  // 配役結果用
  assignments?: Record<string, string>
}

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
  onCharAssignmentMethodSelected?: (method: 'survey' | 'self') => void
  charAssignmentMethod?: string | null
  characters?: CharacterData[]
  isOrganizer?: boolean
  onCharAssignmentConfirmed?: () => void
  onResetCharAssignmentMethod?: () => void
  scenarioPlayerCount?: number | null
}

function renderMessageWithLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline break-all"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function GroupChat({ groupId, currentMemberId, members: initialMembers, fullHeight = false, onGoToSchedule, scenarioId, organizationId, performanceDate, needsCharAssignmentChoice, onCharAssignmentMethodSelected, charAssignmentMethod, characters = [], isOrganizer = false, onCharAssignmentConfirmed, onResetCharAssignmentMethod, scenarioPlayerCount }: GroupChatProps) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<PrivateGroupMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [members, setMembers] = useState<PrivateGroupMember[]>(initialMembers)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showSurveyDialog, setShowSurveyDialog] = useState(false)
  const [charPreferences, setCharPreferences] = useState<Record<string, string>>({})
  const [charSaving, setCharSaving] = useState(false)
  const [charConfirmStep, setCharConfirmStep] = useState(false)
  const [charDecisions, setCharDecisions] = useState<Record<string, string>>({})
  const [charSubmitting, setCharSubmitting] = useState(false)
  const [deadlineText, setDeadlineText] = useState<string | null>(null)

  // 回答期限を取得
  useEffect(() => {
    if (!scenarioId || !organizationId || !performanceDate) return
    ;(async () => {
      const { data } = await supabase
        .from('organization_scenarios')
        .select('survey_deadline_days')
        .eq('scenario_master_id', scenarioId)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (data?.survey_deadline_days !== undefined && data.survey_deadline_days !== null) {
        const perfDate = new Date(performanceDate + 'T00:00:00+09:00')
        perfDate.setDate(perfDate.getDate() - data.survey_deadline_days)
        setDeadlineText(`${perfDate.getMonth() + 1}月${perfDate.getDate()}日まで`)
      }
    })()
  }, [scenarioId, organizationId, performanceDate])

  // pre_reading_notice が送信済みであれば配役フローを表示する
  // enrichGroupWithViewData が RLS 制限等で失敗した場合のフォールバック
  const hasPreReadingNotice = messages.some(m => {
    try { return JSON.parse(m.message)?.action === 'pre_reading_notice' } catch { return false }
  })
  const effectiveNeedsCharAssignmentChoice = needsCharAssignmentChoice || (hasPreReadingNotice && !charAssignmentMethod)

  // デバッグログ
  logger.log('📋 GroupChat: props', { groupId, currentMemberId, scenarioId, organizationId, performanceDate })

  // メンバー情報を取得（ニックネームを優先的に取得）
  const fetchMembers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('private_group_members')
        .select('id, group_id, user_id, guest_name, guest_email, is_organizer, status')
        .eq('group_id', groupId)
        .eq('status', 'joined')

      if (error) throw error
      if (!data) {
        setMembers(initialMembers)
        return
      }

      // user_idがあるメンバーのニックネームをcustomersテーブルから取得
      const userIds = data.filter(m => m.user_id).map(m => m.user_id)
      const customerNicknames: Record<string, string> = {}
      
      if (userIds.length > 0) {
        let customerQuery = supabase
          .from('customers')
          .select('user_id, nickname, name')
          .in('user_id', userIds)
        if (organizationId) {
          customerQuery = customerQuery.eq('organization_id', organizationId)
        }
        const { data: customers } = await customerQuery

        if (customers) {
          customers.forEach((c: { user_id: string; nickname: string | null; name: string | null }) => {
            customerNicknames[c.user_id] = c.nickname || c.name || ''
          })
        }
      }

      // ニックネームを優先してguest_nameを設定
      const membersWithNicknames = data.map(m => ({
        ...m,
        guest_name: (m.user_id && customerNicknames[m.user_id]) 
          ? customerNicknames[m.user_id] 
          : m.guest_name || m.guest_email?.split('@')[0] || '参加者'
      }))

      setMembers(membersWithNicknames as PrivateGroupMember[])
    } catch (err) {
      logger.error('Failed to fetch members for chat', err)
    }
  }, [groupId, initialMembers, organizationId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // currentMemberIdが変更されたら、メンバー情報を再取得
  useEffect(() => {
    if (currentMemberId && !members.some(m => m.id === currentMemberId)) {
      fetchMembers()
    }
  }, [currentMemberId, members, fetchMembers])

  // メンバー変更をリアルタイム監視
  useEffect(() => {
    const channel = supabase
      .channel(`group-members-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'private_group_members',
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          fetchMembers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [groupId, fetchMembers])

  // キャラクター希望をDBから取得する関数
  const fetchCharPreferences = useCallback(async () => {
    const { data } = await supabase
      .from('private_groups')
      .select('character_assignments')
      .eq('id', groupId)
      .single()
    if (data?.character_assignments) {
      setCharPreferences(data.character_assignments as Record<string, string>)
    }
  }, [groupId])

  // キャラクター希望: 初回取得 + Realtime購読 + ポーリング（フォールバック）
  useEffect(() => {
    if (charAssignmentMethod !== 'self' || characters.length === 0) return

    void fetchCharPreferences()

    // Realtime購読（RLSの制約で届かない場合があるのでポーリングも併用）
    const channel = supabase
      .channel(`char_prefs_inline_${groupId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'private_groups', filter: `id=eq.${groupId}` },
        (payload) => {
          const newAssigns = (payload.new as any)?.character_assignments
          if (newAssigns) {
            setCharPreferences(newAssigns as Record<string, string>)
          }
        }
      )
      .subscribe()

    // ポーリング: 5秒ごとにDBから最新を取得（Realtimeが届かない場合のフォールバック）
    const pollInterval = setInterval(() => {
      void fetchCharPreferences()
    }, 5000)

    // タブ復帰時にも取得
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchCharPreferences()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      void supabase.removeChannel(channel)
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [groupId, charAssignmentMethod, characters.length, fetchCharPreferences])

  const handleSelectCharPreference = useCallback(async (charId: string) => {
    if (!currentMemberId) return
    setCharPreferences(prev => ({ ...prev, [currentMemberId]: charId }))
    setCharSaving(true)
    try {
      const charPrefParams: RpcSetCharacterPreferenceParams = {
        p_group_id: groupId,
        p_member_id: currentMemberId,
        p_character_id: charId,
      }
      const { error } = await supabase.rpc('set_character_preference', charPrefParams)
      if (error) throw error
    } catch (err) {
      logger.error('キャラクター選択エラー:', err)
      toast.error('保存に失敗しました')
    } finally {
      setCharSaving(false)
    }
  }, [currentMemberId, groupId])

  const handleGoToCharConfirm = useCallback(async () => {
    // 確定ステップに進む前にDBから最新の希望を取得
    const { data } = await supabase
      .from('private_groups')
      .select('character_assignments')
      .eq('id', groupId)
      .single()
    const latest = (data?.character_assignments || {}) as Record<string, string>
    console.log('🎭 handleGoToCharConfirm:', { latest, groupId })
    setCharPreferences(latest)
    setCharDecisions({ ...latest })
    setCharConfirmStep(true)
  }, [groupId])

  const handleCharConfirmAndSend = useCallback(async () => {
    console.log('🎭 handleCharConfirmAndSend 開始')
    setCharSubmitting(true)
    try {
      const activeMembers = members.filter(m => (m.status as string) === 'active' || m.status === 'joined')
      console.log('🎭 activeMembers:', activeMembers.length, 'charDecisions:', charDecisions)
      const lines = activeMembers.map(m => {
        const charId = charDecisions[m.id]
        const charName = characters.find(c => c.id === charId)?.name || '未定'
        const memberName = m.guest_name || '参加者'
        const prefCharId = charPreferences[m.id]
        const changed = prefCharId && prefCharId !== charId
        return `${memberName} → ${charName}${changed ? '（変更あり）' : ''}`
      }).join('\n')

      // チャットにシステムメッセージを送信
      console.log('🎭 チャットメッセージ送信中...')
      const { error } = await supabase
        .from('private_group_messages')
        .insert({
          group_id: groupId,
          member_id: null,
          message: JSON.stringify({
            type: 'system',
            action: 'character_assignment',
            title: 'キャラクター配役が確定しました',
            body: lines,
            assignments: charDecisions,
          }),
        })
      console.log('🎭 チャットメッセージ結果:', { error })
      if (error) throw error

      // アンケート回答にもキャラクター選択として保存（RPC経由でRLS回避）
      try {
        // デバッグ: RPCの前提条件を確認
        const { data: groupData } = await supabase
          .from('private_groups')
          .select('scenario_master_id, organization_id')
          .eq('id', groupId)
          .single()
        console.log('🎭 DEBUG グループ情報:', groupData)

        if (groupData?.scenario_master_id && groupData?.organization_id) {
          const { data: os1 } = await supabase
            .from('organization_scenarios')
            .select('id')
            .eq('scenario_master_id', groupData.scenario_master_id)
            .eq('organization_id', groupData.organization_id)
            .maybeSingle()
          console.log('🎭 DEBUG org_scenario (by master_id):', os1)

          const orgScenarioId = os1?.id || groupData.scenario_master_id
          const { data: questions } = await supabase
            .from('org_scenario_survey_questions')
            .select('id, question_type, question_text')
            .eq('org_scenario_id', orgScenarioId)
          const charSelQ = questions?.filter((q: any) => q.question_type === 'character_selection')
          console.log('🎭 DEBUG survey questions:', { orgScenarioId, total: questions?.length, charSelQuestions: charSelQ, allTypes: questions?.map((q: any) => q.question_type) })
        }

        console.log('🎭 配役→アンケート反映 RPC呼び出し:', { groupId, charDecisions })
        const upsertCharParams: RpcUpsertCharacterAssignmentsToSurveyParams = {
          p_group_id: groupId,
          p_assignments: charDecisions,
        }
        const { data: rpcData, error: rpcError } = await supabase.rpc('upsert_character_assignments_to_survey', upsertCharParams)
        console.log('🎭 配役→アンケート反映 RPC結果:', { rpcData, rpcError })
        if (rpcError) {
          console.error('🎭 アンケート回答への配役反映エラー:', rpcError)
        }
        // RPC後にDBを直接確認
        const { data: checkResponses } = await supabase
          .from('private_group_survey_responses')
          .select('member_id, responses')
          .eq('group_id', groupId)
        console.log('🎭 DEBUG RPC後の回答データ:', checkResponses)
      } catch (surveyErr) {
        console.error('🎭 アンケート回答への配役反映エラー:', surveyErr)
      }

      toast.success('配役を確定しました')
      setCharConfirmStep(false)
      onCharAssignmentConfirmed?.()
    } catch (err) {
      logger.error('配役確定エラー:', err)
      toast.error('送信に失敗しました')
    } finally {
      setCharSubmitting(false)
    }
  }, [members, charDecisions, charPreferences, characters, groupId, onCharAssignmentConfirmed])

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
    const fetchMessages = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('private_group_messages')
          .select('id, group_id, member_id, message, created_at')
          .eq('group_id', groupId)
          .order('created_at', { ascending: true })
          .limit(100)

        if (error) throw error
        setMessages(data || [])
      } catch (err) {
        logger.error('Failed to fetch messages', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMessages()
  }, [groupId])

  // メンバー情報を保持するRef（クロージャ問題回避用）
  const membersRef = useRef<PrivateGroupMember[]>(members)
  useEffect(() => {
    membersRef.current = members
  }, [members])

  useEffect(() => {
    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const newMsg = payload.new as PrivateGroupMessage
          setMessages((prev) => [...prev, newMsg])
          
          // 新しいメッセージの送信者がメンバー一覧にない場合は再取得
          if (newMsg.member_id && !membersRef.current.some(m => m.id === newMsg.member_id)) {
            fetchMembers()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [groupId, fetchMembers])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!newMessage.trim() || !currentMemberId || sending) return

    setSending(true)
    try {
      const { error } = await supabase.from('private_group_messages').insert({
        group_id: groupId,
        member_id: currentMemberId,
        message: newMessage.trim(),
      })

      if (error) throw error
      setNewMessage('')
      
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
    const date = new Date(dateStr)
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return '今日'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨日'
    } else {
      return date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
    }
  }

  const formatDateTime = (dateStr: string) => {
    return `${formatDate(dateStr)} ${formatTime(dateStr)}`
  }

  const groupMessagesByDate = (messages: PrivateGroupMessage[]) => {
    const groups: { date: string; messages: PrivateGroupMessage[] }[] = []
    let currentDate = ''

    for (const msg of messages) {
      const msgDate = new Date(msg.created_at).toDateString()
      if (msgDate !== currentDate) {
        currentDate = msgDate
        groups.push({ date: msg.created_at, messages: [msg] })
      } else {
        groups[groups.length - 1].messages.push(msg)
      }
    }

    return groups
  }

  // システムメッセージかどうか判定（DB/クライアントで string または object のどちらでも来うる）
  const parseSystemMessage = (message: string | Record<string, unknown> | null | undefined): SystemMessage | null => {
    if (message == null) return null
    try {
      let parsed: unknown
      if (typeof message === 'string') {
        const t = message.trim()
        if (!t.startsWith('{')) return null
        parsed = JSON.parse(t)
      } else if (typeof message === 'object') {
        parsed = message
      } else {
        return null
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        'type' in parsed &&
        (parsed as { type: unknown }).type === 'system'
      ) {
        return parsed as SystemMessage
      }
    } catch {
      // 通常のテキストメッセージ
    }
    return null
  }

  // 候補日を見やすい形式に整形
  const formatCandidateDate = (dateStr: string, timeSlot: string) => {
    const date = new Date(dateStr + 'T00:00:00+09:00')
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]}) ${timeSlot}`
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
          {messages.length === 0 ? (
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

                  // システムメッセージ（候補日追加通知）
                  if (systemMsg && systemMsg.action === 'candidate_dates_added') {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                              <Calendar className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-purple-800">
                                候補日程が追加されました（{systemMsg.count}件）
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {getMemberName(msg.member_id)} • {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-3 mb-3 space-y-1 border border-purple-100">
                            {systemMsg.dates?.slice(0, 5).map((d, i) => (
                              <div key={i} className="text-sm text-gray-700">
                                {formatCandidateDate(d.date, d.time_slot)}
                              </div>
                            ))}
                            {(systemMsg.dates?.length || 0) > 5 && (
                              <p className="text-xs text-muted-foreground">
                                他 {(systemMsg.dates?.length || 0) - 5} 件
                              </p>
                            )}
                          </div>
                          {onGoToSchedule && (
                            <Button
                              onClick={onGoToSchedule}
                              size="sm"
                              variant="outline"
                              className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
                            >
                              <Calendar className="w-4 h-4 mr-1.5" />
                              日程を確認・回答する
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  }

                  // システムメッセージ（日程確定通知）
                  if (systemMsg && systemMsg.action === 'schedule_confirmed') {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-green-800">
                                {systemMsg.title || '日程が確定いたしました'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          {systemMsg.confirmedDate && (
                            <div className="bg-white rounded-lg p-3 space-y-1 border border-green-100">
                              <div className="text-sm text-gray-900">
                                <span className="text-gray-500">日時：</span>
                                {formatCandidateDate(systemMsg.confirmedDate, systemMsg.confirmedTimeSlot || '')}
                              </div>
                              {systemMsg.storeName && (
                                <div className="text-sm text-gray-900">
                                  <span className="text-gray-500">店舗：</span>
                                  {systemMsg.storeName}
                                </div>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-gray-600 mt-2">
                            {systemMsg.body || 'ご予約ありがとうございます。当日のご来店をお待ちしております。'}
                          </p>
                        </div>
                      </div>
                    )
                  }

                  // システムメッセージ（事前読み込み通知）
                  if (systemMsg && systemMsg.action === 'pre_reading_notice') {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">!</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-amber-800">
                                事前読み込みについて
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-amber-100 overflow-hidden">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap break-all">
                              {renderMessageWithLinks(systemMsg.message || '')}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // システムメッセージ（アンケート回答のお願い）
                  if (systemMsg && systemMsg.action === 'survey_notice') {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                              <ClipboardList className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-blue-800">
                                アンケートのご協力のお願い
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-blue-100 space-y-3 overflow-hidden">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap break-all">
                              {renderMessageWithLinks(systemMsg.message || '')}
                            </p>
                            {scenarioId && organizationId && currentMemberId && (
                              <Button
                                onClick={() => setShowSurveyDialog(true)}
                                className="w-full bg-blue-600 hover:bg-blue-700"
                                size="sm"
                              >
                                <ClipboardList className="w-4 h-4 mr-2" />
                                アンケートに回答する
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // システムメッセージ（グループ作成）
                  if (systemMsg && systemMsg.action === 'group_created') {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-purple-800">
                                {systemMsg.title || '貸切リクエストグループを作成しました'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            {systemMsg.body || '招待リンクを共有して、参加メンバーを招待してください。'}
                          </p>
                          {(systemMsg.note || !systemMsg.body) && (
                            <p className="text-xs text-gray-500 mt-1">
                              {systemMsg.note || '※ 全員を招待していなくても日程確定は可能ですが、当日は参加人数全員でお越しください。'}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  }

                  // システムメッセージ（メンバー参加）
                  if (systemMsg && systemMsg.action === 'member_joined') {
                    return (
                      <div key={msg.id} className="flex justify-center my-2">
                        <div className="bg-gray-100 rounded-full px-4 py-1.5">
                          <p className="text-xs text-gray-600">
                            <span className="font-medium">{systemMsg.memberName}</span> が参加しました
                          </p>
                        </div>
                      </div>
                    )
                  }

                  // システムメッセージ（予約申込）
                  if (systemMsg && systemMsg.action === 'booking_requested') {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-blue-800">
                                {systemMsg.title || '貸切リクエストを送信しました'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            {systemMsg.body || '店舗より日程確定のご連絡をいたしますので、しばらくお待ちください。'}
                          </p>
                        </div>
                      </div>
                    )
                  }

                  // システムメッセージ（却下通知）
                  if (systemMsg && systemMsg.action === 'booking_rejected') {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
                              <X className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-red-800">
                                {systemMsg.title || '日程リクエストが却下されました'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            {systemMsg.body || '店舗の都合がつかず、ご希望の日程でのご予約をお受けすることができませんでした。お手数ですが、別の候補日を選択のうえ再度お申し込みください。'}
                          </p>
                        </div>
                      </div>
                    )
                  }

                  // システムメッセージ（キャンセル通知）
                  if (systemMsg && systemMsg.action === 'booking_cancelled') {
                    return (
                      <div key={msg.id} className="flex justify-center my-4">
                        <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 w-full max-w-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center">
                              <X className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">
                                {systemMsg.title || 'ご予約がキャンセルされました'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-gray-600 mt-2">
                            {systemMsg.body || '誠に申し訳ございませんが、やむを得ない事情によりご予約がキャンセルとなりました。'}
                          </p>
                        </div>
                      </div>
                    )
                  }

                  // システムメッセージ（店舗からのお知らせ）
                  if (systemMsg && systemMsg.action === 'staff_message') {
                    return (
                      <div key={msg.id} className="flex justify-center my-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 w-full max-w-sm">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 bg-amber-600 rounded-full flex items-center justify-center shrink-0">
                              <span className="text-white text-[10px] leading-none">📢</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-amber-800">
                                {systemMsg.title || '店舗からのお知らせ'}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {formatDateTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-2.5 mt-2 border border-amber-100 overflow-hidden">
                            <p className="text-sm text-gray-900 whitespace-pre-wrap break-all leading-relaxed">
                              {renderMessageWithLinks(systemMsg.body || '')}
                            </p>
                          </div>
                          <p className="mt-2 px-0.5 text-[10px] text-muted-foreground leading-snug">
                            ※ 返信は店舗に届きません。ご連絡は「店舗への問い合わせ」からお願いします。
                          </p>
                        </div>
                      </div>
                    )
                  }

                  // システムメッセージ（個別お知らせ）- 対象者本人のみに表示
                  if (systemMsg && systemMsg.action === 'individual_notice') {
                    // 対象メンバー本人でなければ表示しない
                    if (systemMsg.target_member_id !== currentMemberId) {
                      return null
                    }
                    const currentMember = members.find(m => m.id === currentMemberId)
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
                    onClick={() => onCharAssignmentMethodSelected('survey')}
                  >
                    <span className="font-medium text-sm">アンケートで希望を伝える</span>
                    <span className="text-[10px] text-muted-foreground">スタッフが決定します</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-auto py-3 flex flex-col items-start gap-0.5 border-purple-200 hover:bg-purple-100"
                    onClick={() => onCharAssignmentMethodSelected('self')}
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
                    <span className="font-semibold text-sm text-blue-800">アンケートのご協力のお願い</span>
                  </div>
                  {isOrganizer && onResetCharAssignmentMethod && (
                    <button
                      onClick={() => {
                        if (window.confirm('配役方法を変更すると、現在送信されている回答が無効になります。よろしいですか？')) {
                          onResetCharAssignmentMethod()
                        }
                      }}
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
          {charAssignmentMethod === 'self' && characters.length > 0 && !messages.some(m => {
            try { return JSON.parse(m.message)?.action === 'character_assignment' } catch { return false }
          }) && (() => {
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
              console.log('🎭 確定ステップ表示中:', { allDecided, decisionDupes, charDecisions, activeMemberIds: activeMembers.map(m=>m.id) })

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
                      onClick={() => {
                        if (window.confirm('配役方法を変更すると、現在送信されている回答が無効になります。よろしいですか？')) {
                          onResetCharAssignmentMethod()
                        }
                      }}
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
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="メッセージを入力..."
              disabled={!currentMemberId || sending}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim() || !currentMemberId || sending}
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
              ) : !scenarioId || !organizationId ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
                  <p className="text-sm">アンケート情報を取得できませんでした</p>
                </div>
              ) : (
                <SurveyResponseForm
                  groupId={groupId}
                  memberId={currentMemberId}
                  scenarioId={scenarioId}
                  organizationId={organizationId}
                  performanceDate={performanceDate}
                  hideCharacterSelection={charAssignmentMethod === 'survey'}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

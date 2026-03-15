import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Send, Loader2, Calendar, CheckCircle2, X, ClipboardList, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import type { PrivateGroupMessage, PrivateGroupMember } from '@/types'
import { SurveyResponseForm } from '@/pages/PrivateGroupInvite/components/SurveyResponseForm'

interface SystemMessage {
  type: 'system'
  action: 'candidate_dates_added' | 'schedule_confirmed' | 'pre_reading_notice' | 'survey_notice' | 'group_created' | 'member_joined' | 'booking_requested' | 'booking_rejected' | 'booking_cancelled' | 'individual_notice' | 'performance_cancelled'
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
}

export function GroupChat({ groupId, currentMemberId, members: initialMembers, fullHeight = false, onGoToSchedule, scenarioId, organizationId, performanceDate }: GroupChatProps) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<PrivateGroupMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [members, setMembers] = useState<PrivateGroupMember[]>(initialMembers)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [showSurveyDialog, setShowSurveyDialog] = useState(false)

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
      let customerNicknames: Record<string, string> = {}
      
      if (userIds.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('user_id, nickname, name')
          .in('user_id', userIds)
        
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
  }, [groupId, initialMembers])

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
          .select('*')
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

  // システムメッセージかどうか判定
  const parseSystemMessage = (message: string): SystemMessage | null => {
    try {
      const parsed = JSON.parse(message)
      if (parsed.type === 'system') {
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
                          <div className="bg-white rounded-lg p-3 border border-amber-100">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {systemMsg.message}
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
                          <div className="bg-white rounded-lg p-3 border border-blue-100 space-y-3">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {systemMsg.message}
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
                          <div className="bg-white rounded-lg p-3 mt-2 border border-indigo-100">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {systemMsg.message}
                            </p>
                          </div>
                          <p className="text-xs text-indigo-400 mt-2 text-center">
                            🔒 このお知らせはあなただけに表示されています
                          </p>
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
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

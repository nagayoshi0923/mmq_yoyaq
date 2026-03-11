import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Send, Loader2, Calendar, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import type { PrivateGroupMessage, PrivateGroupMember } from '@/types'

interface SystemMessage {
  type: 'system'
  action: 'candidate_dates_added'
  count: number
  dates: Array<{ date: string; time_slot: string }>
}

interface GroupChatProps {
  groupId: string
  currentMemberId: string | null
  members: PrivateGroupMember[]
  fullHeight?: boolean
  onGoToSchedule?: () => void
}

export function GroupChat({ groupId, currentMemberId, members: initialMembers, fullHeight = false, onGoToSchedule }: GroupChatProps) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<PrivateGroupMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [members, setMembers] = useState<PrivateGroupMember[]>(initialMembers)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // メンバー情報を取得
  const fetchMembers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('private_group_members')
        .select('id, group_id, user_id, guest_name, guest_email, is_organizer, status, users(email)')
        .eq('group_id', groupId)
        .eq('status', 'joined')

      if (error) throw error
      setMembers(data as PrivateGroupMember[] || initialMembers)
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
                        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4 max-w-[90%] shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                              <Calendar className="w-4 h-4 text-purple-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-purple-800">
                                候補日が{systemMsg.count}件追加されました
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {getMemberName(msg.member_id)} • {formatTime(msg.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-3 mb-3 space-y-1">
                            {systemMsg.dates.slice(0, 5).map((d, i) => (
                              <div key={i} className="text-sm text-gray-700 flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                                {formatCandidateDate(d.date, d.time_slot)}
                              </div>
                            ))}
                            {systemMsg.dates.length > 5 && (
                              <p className="text-xs text-muted-foreground">
                                他 {systemMsg.dates.length - 5} 件
                              </p>
                            )}
                          </div>
                          {onGoToSchedule && (
                            <Button
                              onClick={onGoToSchedule}
                              size="sm"
                              className="w-full bg-purple-600 hover:bg-purple-700"
                            >
                              <Calendar className="w-4 h-4 mr-1.5" />
                              日程を回答する
                            </Button>
                          )}
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
  )
}

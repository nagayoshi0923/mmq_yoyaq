import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Users,
  Calendar,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageCircle,
  Loader2,
  Send,
  History,
  ClipboardList,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { RpcSendStaffGroupMessageParams } from '@/lib/rpcTypes'
import { showToast } from '@/utils/toast'
import { getCurrentOrganizationId } from '@/lib/organization'
import { usePrivateGroupList, type PrivateGroupListItem } from '../hooks/usePrivateGroupList'
import { PrivateGroupAnnouncementHistoryDialog } from './PrivateGroupAnnouncementHistoryDialog'
import { useLocalState } from '@/hooks/useLocalState'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  'draft': { label: '下書き', color: 'bg-gray-100 text-gray-700', icon: <Clock className="w-3 h-3" /> },
  'inviting': { label: '招待中', color: 'bg-blue-100 text-blue-700', icon: <Users className="w-3 h-3" /> },
  'date_adjusting': { label: '日程調整中', color: 'bg-yellow-100 text-yellow-700', icon: <Calendar className="w-3 h-3" /> },
  'booking_requested': { label: '予約申請中', color: 'bg-purple-100 text-purple-700', icon: <Clock className="w-3 h-3" /> },
  'confirmed': { label: '予約確定', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  'cancelled': { label: 'キャンセル', color: 'bg-red-100 text-red-700', icon: <AlertCircle className="w-3 h-3" /> },
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return '今日'
  if (diffDays === 1) return '昨日'
  if (diffDays < 7) return `${diffDays}日前`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}週間前`
  return formatDate(dateStr)
}

function getResponseProgress(group: PrivateGroupListItem) {
  if (!group.candidate_dates || group.candidate_dates.length === 0) {
    return { answered: 0, total: 0, percentage: 0 }
  }
  
  const memberCount = group.members.length
  const totalResponses = group.candidate_dates.length * memberCount
  const answeredResponses = group.candidate_dates.reduce((sum, cd) => {
    return sum + cd.responses.length
  }, 0)
  
  return {
    answered: answeredResponses,
    total: totalResponses,
    percentage: totalResponses > 0 ? Math.round((answeredResponses / totalResponses) * 100) : 0
  }
}

interface PrivateGroupListProps {
  onGroupClick?: (group: PrivateGroupListItem) => void
}

export function PrivateGroupList({ onGroupClick }: PrivateGroupListProps) {
  const navigate = useNavigate()
  const { groups, loading, error, loadGroups } = usePrivateGroupList()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useLocalState<string>('privateGroupStatusFilter', 'all')
  const [hideCompleted, setHideCompleted] = useLocalState<boolean>('privateGroupHideCompleted', false)
  const [showSurveyOnly, setShowSurveyOnly] = useLocalState<boolean>('privateGroupShowSurveyOnly', false)
  
  // メッセージ送信用
  const [messageDialogOpen, setMessageDialogOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<PrivateGroupListItem | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [historyGroup, setHistoryGroup] = useState<PrivateGroupListItem | null>(null)

  // アンケート送信用
  const [surveyDialogOpen, setSurveyDialogOpen] = useState(false)
  const [selectedGroupForSurvey, setSelectedGroupForSurvey] = useState<PrivateGroupListItem | null>(null)
  const [sendingSurvey, setSendingSurvey] = useState(false)

  const handleSendMessage = async () => {
    if (!selectedGroup || !message.trim()) return
    
    setSending(true)
    try {
      // スタッフ用RPCでメッセージを送信
      const msgParams: RpcSendStaffGroupMessageParams = {
        p_group_id: selectedGroup.id,
        p_message: message.trim(),
      }
      const { error: rpcError } = await supabase.rpc('send_staff_group_message', msgParams)
      
      if (rpcError) {
        console.error('メッセージ送信エラー:', rpcError)
        throw rpcError
      }
      
      showToast.success('メッセージを送信しました')
      setMessageDialogOpen(false)
      setMessage('')
      setSelectedGroup(null)
    } catch (err: any) {
      console.error('メッセージ送信例外:', err)
      showToast.error('メッセージの送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  const handleSendSurveyNotification = async () => {
    if (!selectedGroupForSurvey) return
    setSendingSurvey(true)
    try {
      const orgId = await getCurrentOrganizationId()
      if (!orgId) throw new Error('組織情報が取得できません')

      const { data: orgScenarioData } = await supabase
        .from('organization_scenarios_with_master')
        .select('survey_enabled, survey_deadline_days, characters')
        .eq('scenario_master_id', selectedGroupForSurvey.scenario_master_id)
        .eq('organization_id', orgId)
        .maybeSingle()

      if (!orgScenarioData?.survey_enabled) {
        showToast.error('このシナリオにはアンケートが設定されていません')
        return
      }

      const organizerMember = selectedGroupForSurvey.members.find(m => m.is_organizer)
      if (!organizerMember) throw new Error('主催者メンバーが見つかりません')

      const hasPlayableCharacters = Array.isArray(orgScenarioData.characters) &&
        orgScenarioData.characters.some((c: any) => !c.is_npc)

      if (hasPlayableCharacters) {
        const { data: globalSettings } = await supabase
          .from('global_settings')
          .select('pre_reading_notice_message')
          .eq('organization_id', orgId)
          .maybeSingle()

        const preReadingMessage = globalSettings?.pre_reading_notice_message ||
          '【ご確認ください】\n\nこのシナリオには事前配役アンケートがございます。\n\n公演日までに参加者全員がこのグループに参加している必要があります。まだ参加されていない方がいらっしゃいましたら、招待リンクを共有してグループへの参加をお願いいたします。\n\nご不明点がございましたら、店舗までお問い合わせください。'

        const { error: msgError } = await supabase.from('private_group_messages').insert({
          group_id: selectedGroupForSurvey.id,
          member_id: organizerMember.id,
          message: JSON.stringify({ type: 'system', action: 'pre_reading_notice', message: preReadingMessage })
        })
        if (msgError) throw msgError
      } else {
        let deadlineText = ''
        const { data: bookingRequest } = await supabase
          .from('private_booking_requests')
          .select('candidate_datetimes')
          .eq('private_group_id', selectedGroupForSurvey.id)
          .eq('status', 'confirmed')
          .maybeSingle()

        if (bookingRequest?.candidate_datetimes?.candidates && orgScenarioData.survey_deadline_days !== undefined) {
          const confirmedCandidate = bookingRequest.candidate_datetimes.candidates.find((c: any) => c.status === 'confirmed')
          if (confirmedCandidate?.date) {
            const perfDate = new Date(confirmedCandidate.date + 'T00:00:00+09:00')
            perfDate.setDate(perfDate.getDate() - orgScenarioData.survey_deadline_days)
            deadlineText = `\n\n回答期限: ${perfDate.getMonth() + 1}月${perfDate.getDate()}日まで`
          }
        }

        const surveyMessage = `【事前配役アンケートのご協力のお願い】\n\nこちらの公演では事前配役アンケートへのご回答をお願いしております。\n\n上記の「日程を確認・回答する」ボタンからアンケートにお答えください。${deadlineText}\n\nご不明点がございましたら、お気軽にお問い合わせください。`

        const { error: msgError } = await supabase.from('private_group_messages').insert({
          group_id: selectedGroupForSurvey.id,
          member_id: organizerMember.id,
          message: JSON.stringify({ type: 'system', action: 'survey_notice', message: surveyMessage })
        })
        if (msgError) throw msgError
      }

      showToast.success('アンケート通知を送信しました')
      setSurveyDialogOpen(false)
      setSelectedGroupForSurvey(null)
    } catch (err: any) {
      console.error('アンケート通知送信エラー:', err)
      showToast.error(err.message || 'アンケート通知の送信に失敗しました')
    } finally {
      setSendingSurvey(false)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const filteredGroups = groups.filter(group => {
    const matchesSearch =
      group.scenario_masters?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.organizer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.organizer?.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.invite_code.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || group.status === statusFilter

    // 完了公演フィルター: キャンセル済み、または確定日が過去のグループを非表示
    if (hideCompleted) {
      if (group.status === 'cancelled') return false
      if (group.status === 'confirmed' && group.confirmed_date) {
        const perfDate = new Date(group.confirmed_date + 'T00:00:00+09:00')
        if (perfDate < today) return false
      }
    }

    // 事前配役公演フィルター
    if (showSurveyOnly && !group.survey_enabled) return false

    return matchesSearch && matchesStatus
  })

  // ステータス別の件数
  const statusCounts = groups.reduce((acc, g) => {
    acc[g.status] = (acc[g.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">読み込み中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-600">{error}</p>
        <Button variant="outline" onClick={loadGroups} className="mt-4">
          再読み込み
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* フィルター */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="シナリオ名、主催者名、招待コードで検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('all')}
            >
              全て ({groups.length})
            </Button>
            <Button
              variant={statusFilter === 'date_adjusting' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('date_adjusting')}
            >
              日程調整中 ({statusCounts['date_adjusting'] || 0})
            </Button>
            <Button
              variant={statusFilter === 'booking_requested' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('booking_requested')}
            >
              予約申請中 ({statusCounts['booking_requested'] || 0})
            </Button>
            <Button
              variant={statusFilter === 'confirmed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('confirmed')}
            >
              確定 ({statusCounts['confirmed'] || 0})
            </Button>
          </div>
        </div>
        {/* 追加フィルター */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={hideCompleted ? 'default' : 'outline'}
            size="sm"
            onClick={() => setHideCompleted(!hideCompleted)}
          >
            完了公演を非表示
          </Button>
          <Button
            variant={showSurveyOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowSurveyOnly(!showSurveyOnly)}
          >
            <ClipboardList className="w-3.5 h-3.5 mr-1" />
            事前配役公演のみ
          </Button>
        </div>
      </div>

      {/* グループ一覧 */}
      {filteredGroups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {searchTerm || statusFilter !== 'all' 
            ? '条件に一致するグループがありません' 
            : '貸切グループがありません'}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredGroups.map(group => {
            const status = STATUS_CONFIG[group.status] || STATUS_CONFIG['draft']
            const progress = getResponseProgress(group)
            
            return (
              <Card
                key={group.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  onGroupClick?.(group)
                  navigate(`/group/manage/${group.id}`)
                }}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* シナリオ画像 */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      {group.scenario_masters?.key_visual_url ? (
                        <img 
                          src={group.scenario_masters.key_visual_url} 
                          alt={group.scenario_masters.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <MessageCircle className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    
                    {/* メイン情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium truncate">
                          {group.scenario_masters?.title || '(シナリオ未設定)'}
                        </h3>
                        <Badge className={`${status.color} flex items-center gap-1 flex-shrink-0`}>
                          {status.icon}
                          {status.label}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                          #{group.invite_code}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {group.organizer?.nickname || group.organizer?.name || '不明'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {group.members.length}/{group.scenario_masters?.player_count_max || '?'}名
                        </span>
                        {group.status !== 'confirmed' && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            候補: {group.candidate_dates.length}件
                          </span>
                        )}
                        <span className="text-xs">
                          作成: {formatRelativeDate(group.created_at)}
                        </span>
                      </div>

                      {/* 確定公演の日程・時間・GM */}
                      {group.status === 'confirmed' && group.confirmed_date && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-green-700">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {group.confirmed_date.replace(/-/g, '/')}
                            {group.confirmed_time && <span className="ml-1">{group.confirmed_time}</span>}
                          </span>
                          {group.confirmed_gm_name && (
                            <span className="flex items-center gap-1 text-muted-foreground font-normal">
                              <Users className="w-3.5 h-3.5" />
                              GM: {group.confirmed_gm_name}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 回答進捗 */}
                      {group.candidate_dates.length > 0 && group.members.length > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <span>回答進捗: {progress.answered}/{progress.total} ({progress.percentage}%)</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all"
                              style={{ width: `${progress.percentage}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* アクション */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setHistoryGroup(group)
                          setHistoryDialogOpen(true)
                        }}
                      >
                        <History className="w-4 h-4 mr-1" />
                        履歴
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedGroupForSurvey(group)
                          setSurveyDialogOpen(true)
                        }}
                      >
                        <ClipboardList className="w-4 h-4 mr-1" />
                        アンケート送信
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedGroup(group)
                          setMessageDialogOpen(true)
                        }}
                      >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        メッセージ
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* アンケート送信確認ダイアログ */}
      <Dialog open={surveyDialogOpen} onOpenChange={(open) => {
        setSurveyDialogOpen(open)
        if (!open) setSelectedGroupForSurvey(null)
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              アンケート通知を送信
            </DialogTitle>
          </DialogHeader>

          {selectedGroupForSurvey && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {selectedGroupForSurvey.scenario_masters?.title || '(シナリオ未設定)'}
                </span>
                <span className="mx-2">・</span>
                <span>{selectedGroupForSurvey.members.length}名のグループ</span>
              </div>
              <p className="text-sm">
                このグループに事前配役アンケートの通知を送信します。シナリオ設定に応じて、キャラクターあり→招待促進メッセージ、キャラクターなし→アンケート回答依頼（締め切り日付き）が送信されます。
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSurveyDialogOpen(false)
                setSelectedGroupForSurvey(null)
              }}
              disabled={sendingSurvey}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSendSurveyNotification}
              disabled={sendingSurvey}
            >
              {sendingSurvey ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1" />
              )}
              送信
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* メッセージ送信ダイアログ */}
      <PrivateGroupAnnouncementHistoryDialog
        open={historyDialogOpen}
        onOpenChange={(o) => {
          setHistoryDialogOpen(o)
          if (!o) setHistoryGroup(null)
        }}
        groupId={historyGroup?.id ?? null}
        scenarioTitle={historyGroup?.scenario_masters?.title || '(シナリオ未設定)'}
      />

      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              グループにメッセージを送信
            </DialogTitle>
          </DialogHeader>
          
          {selectedGroup && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {selectedGroup.scenario_masters?.title || '(シナリオ未設定)'}
                </span>
                <span className="mx-2">・</span>
                <span>{selectedGroup.members.length}名のグループ</span>
              </div>
              
              <Textarea
                placeholder="メッセージを入力..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMessageDialogOpen(false)
                setMessage('')
              }}
              disabled={sending}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={sending || !message.trim()}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-1" />
              )}
              送信
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useState } from 'react'
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
  Send
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { usePrivateGroupList, type PrivateGroupListItem } from '../hooks/usePrivateGroupList'

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
  const { groups, loading, error, loadGroups } = usePrivateGroupList()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  
  // メッセージ送信用
  const [messageDialogOpen, setMessageDialogOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<PrivateGroupListItem | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const handleSendMessage = async () => {
    if (!selectedGroup || !message.trim()) return
    
    setSending(true)
    try {
      // スタッフ用RPCでメッセージを送信
      const { error: rpcError } = await supabase.rpc('send_staff_group_message', {
        p_group_id: selectedGroup.id,
        p_message: message.trim()
      })
      
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

  const filteredGroups = groups.filter(group => {
    const matchesSearch = 
      group.scenario_masters?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.organizer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.organizer?.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      group.invite_code.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || group.status === statusFilter
    
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
                onClick={() => onGroupClick?.(group)}
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
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {group.organizer?.nickname || group.organizer?.name || '不明'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {group.members.length}/{group.scenario_masters?.player_count_max || group.target_participant_count || '?'}名
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          候補: {group.candidate_dates.length}件
                        </span>
                        <span className="text-xs">
                          作成: {formatRelativeDate(group.created_at)}
                        </span>
                      </div>

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

      {/* メッセージ送信ダイアログ */}
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

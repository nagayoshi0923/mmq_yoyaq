import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import {
  Calendar,
  Clock,
  Users,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Circle,
  X,
  HelpCircle,
  Loader2,
  Copy,
  ExternalLink,
  Check,
  MessageCircle,
  UserPlus,
  Share2,
  UserMinus,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePrivateGroup, usePrivateGroupData } from '@/hooks/usePrivateGroup'
import { GroupChat } from './components/GroupChat'
import { UserSearchInvite } from './components/UserSearchInvite'
import { AddCandidateDates } from './components/AddCandidateDates'
import { logger } from '@/utils/logger'

export function PrivateGroupManage() {
  const navigate = useNavigate()
  const location = useLocation()
  
  // URLからグループIDを抽出: /group/manage/{id}
  const id = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    if (segments[0] === 'group' && segments[1] === 'manage' && segments[2]) {
      return segments[2]
    }
    return null
  }, [location.pathname])
  
  const { user } = useAuth()
  const { group, loading: groupLoading, error: groupError, refetch, linkedReservationStatus } = usePrivateGroupData(id || null)
  const { updateGroupStatus, getDateResponsesSummary, removeMember, loading: actionLoading } = usePrivateGroup()

  // 統合ページにリダイレクト
  useEffect(() => {
    if (group?.invite_code) {
      navigate(`/group/invite/${group.invite_code}`, { replace: true })
    }
  }, [group?.invite_code, navigate])

  const [copied, setCopied] = useState(false)
  const [progressCopied, setProgressCopied] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showDateSelectionModal, setShowDateSelectionModal] = useState(false)
  const [selectedDatesForBooking, setSelectedDatesForBooking] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState('chat')

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00+09:00')
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
  }

  const getInviteUrl = () => {
    if (!group) return ''
    return `${window.location.origin}/group/invite/${group.invite_code}`
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getInviteUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      logger.error('Failed to copy')
    }
  }

  const handleShareLine = () => {
    if (!group) return
    const scenario = group.scenario_masters as { title?: string; player_count_max?: number } | undefined
    const playerCount = scenario?.player_count_max || '?'
    const text = `貸切マーダーミステリーに参加しませんか？\n\n🎭 ${scenario?.title || 'シナリオ'}\n👥 ${playerCount}名で貸切\n\n以下のリンクから参加・日程回答をお願いします👇`
    const url = getInviteUrl()
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
  }

  const handleShareProgress = async () => {
    if (!group) return
    const scenario = group.scenario_masters as { title?: string; player_count_max?: number } | undefined
    const candidateDates = group.candidate_dates || []
    const playerCount = scenario?.player_count_max || '?'

    let progressText = `📊 貸切リクエスト進捗状況\n\n`
    progressText += `🎭 ${scenario?.title || 'シナリオ'}\n`
    progressText += `👥 メンバー: ${joinedMembers.length}/${playerCount}名\n\n`

    if (candidateDates.length > 0) {
      progressText += `📅 候補日の回答状況:\n`
      responseSummary.forEach((summary, index) => {
        const cd = summary.candidateDate
        const okIcon = summary.okCount > 0 ? '🟢' : '⚪'
        progressText += `${index + 1}. ${formatDate(cd.date)} ${cd.time_slot}\n`
        progressText += `   ${okIcon} OK:${summary.okCount} / △:${summary.maybeCount} / NG:${summary.ngCount}\n`
      })
    } else {
      progressText += `📅 候補日: まだ設定されていません\n`
    }

    progressText += `\n📎 ${getInviteUrl()}`

    try {
      await navigator.clipboard.writeText(progressText)
      setProgressCopied(true)
      setTimeout(() => setProgressCopied(false), 2000)
    } catch {
      logger.error('Failed to copy progress')
    }
  }

  const handleProceedToBooking = () => {
    if (!group) return
    // 候補日が1件のみの場合は直接申込へ
    if (group.candidate_dates?.length === 1) {
      proceedWithSelectedDates([group.candidate_dates[0].id])
    } else {
      // 複数候補がある場合は選択モーダルを表示
      setSelectedDatesForBooking([])
      setShowDateSelectionModal(true)
    }
  }

  const proceedWithSelectedDates = (dateIds: string[]) => {
    if (!group) return
    
    const selectedDates = group.candidate_dates?.filter(cd => dateIds.includes(cd.id)) || []
    const params = new URLSearchParams()
    params.set('groupId', group.id)
    
    // 選択した日程をパラメータに追加（最大6件）
    const datesToSend = selectedDates.slice(0, 6)
    if (datesToSend.length > 0) {
      params.set('preferredDate', datesToSend[0].date)
      params.set('preferredSlot', datesToSend[0].time_slot)
      // 追加の候補日をカンマ区切りで追加
      if (datesToSend.length > 1) {
        params.set('additionalDates', datesToSend.slice(1).map(d => `${d.date}_${d.time_slot}`).join(','))
      }
    }
    
    if (group.preferred_store_ids && group.preferred_store_ids.length > 0) {
      params.set('storeIds', group.preferred_store_ids.join(','))
    }
    if (group.scenario_master_id) {
      params.set('scenarioId', group.scenario_master_id)
    }

    navigate(`/private-booking?${params.toString()}`)
  }

  const toggleDateSelection = (dateId: string) => {
    setSelectedDatesForBooking(prev => {
      if (prev.includes(dateId)) {
        return prev.filter(id => id !== dateId)
      }
      // 最大6件まで選択可能
      if (prev.length >= 6) return prev
      return [...prev, dateId]
    })
  }

  const handleCancelGroup = async () => {
    if (!group || !confirm('グループをキャンセルしますか？この操作は取り消せません。')) return

    setCancelling(true)
    try {
      await updateGroupStatus(group.id, 'cancelled')
      refetch()
    } catch (err) {
      logger.error('Failed to cancel group', err)
    } finally {
      setCancelling(false)
    }
  }

  const responseSummary = useMemo(() => {
    if (!group?.candidate_dates) return []
    return getDateResponsesSummary(group.candidate_dates)
  }, [group?.candidate_dates, getDateResponsesSummary])

  const joinedMembers = useMemo(() => {
    return group?.members?.filter(m => m.status === 'joined') || []
  }, [group?.members])

  const isScheduleConfirmedUi = useMemo(
    () => Boolean(group && (group.status === 'confirmed' || linkedReservationStatus === 'confirmed')),
    [group, linkedReservationStatus]
  )

  /** 紐づく未キャンセル予約がある間は候補追加などを禁止（invite ページと同じ基準） */
  const canMutateScheduleBeforeStoreReply = useMemo(() => {
    if (!group) return false
    if (group.status === 'booking_requested' || group.status === 'confirmed') return false
    if (!(group.status === 'gathering' || group.status === 'date_adjusting')) return false
    if (group.reservation_id) {
      return linkedReservationStatus === 'cancelled'
    }
    return true
  }, [group, linkedReservationStatus])

  const isOrganizer = user && group?.organizer_id === user.id
  
  // メンバーかどうかをチェック（ログインユーザーがメンバーに含まれているか）
  const isMember = user && group?.members?.some(m => m.user_id === user.id && m.status === 'joined')

  if (groupLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-3xl px-4 py-12">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            読み込み中...
          </div>
        </div>
      </div>
    )
  }

  if (groupError || !group) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-3xl px-4 py-12">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">グループが見つかりません</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {groupError || 'グループが存在しないか、アクセス権がありません'}
              </p>
              <Button onClick={() => navigate('/')}>
                トップへ戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // 主催者でもメンバーでもない場合はアクセス拒否
  if (!isOrganizer && !isMember) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="/" />
        <div className="container mx-auto max-w-3xl px-4 py-12">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">アクセス権がありません</h2>
              <p className="text-sm text-muted-foreground mb-4">
                このグループのメンバーのみ閲覧できます
              </p>
              <Button onClick={() => navigate('/')}>
                トップへ戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const scenario = group.scenario_masters as { title?: string; key_visual_url?: string; player_count_max?: number; characters?: unknown[] } | undefined
  const targetCount = scenario?.player_count_max || 1
  const allMembersResponded = joinedMembers.every(m => {
    const memberResponses = group.candidate_dates?.every(cd =>
      cd.responses?.some(r => r.member_id === m.id)
    )
    return memberResponses
  })
  const hasViableDate = responseSummary.some(r => r.isViable && r.okCount >= targetCount)
  const targetReached = joinedMembers.length >= targetCount

  // 現在のユーザーのメンバーID
  const currentMemberId = group.members?.find(m => m.user_id === user?.id)?.id || null

  // 進捗ステップ数の計算
  // booking_requested以降のステータスであれば、ステップ1〜4は完了済みとして扱う
  const isBookingRequested = group.status === 'booking_requested' || group.status === 'confirmed'
  const completedSteps = [
    isBookingRequested || joinedMembers.length >= 2,
    isBookingRequested || (group.candidate_dates?.length || 0) > 0,
    isBookingRequested || allMembersResponded,
    isBookingRequested,
    isScheduleConfirmedUi
  ].filter(Boolean).length

  // チャットモード時は専用レイアウト
  if (activeTab === 'chat') {
    return (
      <div className="fixed inset-0 flex flex-col bg-background z-50">
        {/* ヘッダー */}
        <div className="shrink-0 border-b bg-white">
          <div className="flex items-center gap-3 px-4 py-2">
            <button 
              onClick={() => navigate(-1)}
              className="p-1.5 hover:bg-gray-100 rounded"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            {scenario?.key_visual_url && (
              <img
                src={scenario.key_visual_url}
                alt={scenario.title || ''}
                className="w-8 h-8 object-cover rounded"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-medium truncate">{scenario?.title || 'グループチャット'}</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{joinedMembers.length}名参加</span>
                <span>•</span>
                <span className={isScheduleConfirmedUi ? 'text-green-600' : group.status === 'booking_requested' ? 'text-blue-600' : ''}>
                  {isScheduleConfirmedUi ? '確定' : group.status === 'booking_requested' ? '確定待ち' : `進捗 ${completedSteps}/5`}
                </span>
              </div>
            </div>
            <button 
              onClick={() => setActiveTab('members')}
              className="p-1.5 hover:bg-gray-100 rounded"
            >
              <Users className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* PC: 2カラム / モバイル: チャットのみ */}
        <div className="flex-1 flex overflow-hidden">
          {/* チャット */}
          <div className="flex-1 flex flex-col min-w-0">
            <GroupChat
              groupId={group.id}
              currentMemberId={currentMemberId}
              members={group.members || []}
              fullHeight={true}
              scenarioId={group.scenario_master_id || undefined}
              organizationId={group.organization_id || undefined}
              performanceDate={group.candidate_dates?.[0]?.date}
            />
          </div>

          {/* PC用サイドバー */}
          <div className="hidden lg:block w-80 border-l bg-gray-50 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* 進捗ステップ */}
              <div className="bg-white rounded-lg p-3 border">
                <h3 className="font-semibold text-sm mb-2">進捗</h3>
                <div className="space-y-1.5">
                  <div className={`flex items-center gap-2 text-xs ${joinedMembers.length >= 2 ? 'text-green-600' : 'text-gray-500'}`}>
                    {joinedMembers.length >= 2 ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    メンバー招待 ({joinedMembers.length}名)
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${(group.candidate_dates?.length || 0) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                    {(group.candidate_dates?.length || 0) > 0 ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    候補日追加 ({group.candidate_dates?.length || 0}件)
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${allMembersResponded ? 'text-green-600' : 'text-gray-500'}`}>
                    {allMembersResponded ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    日程回答
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${group.status !== 'gathering' ? 'text-green-600' : 'text-gray-500'}`}>
                    {group.status !== 'gathering' ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    予約申込
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${isScheduleConfirmedUi ? 'text-green-600' : 'text-gray-500'}`}>
                    {isScheduleConfirmedUi ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    日程確定
                  </div>
                </div>
              </div>

              {/* 候補日程 */}
              {group.candidate_dates && group.candidate_dates.length > 0 && (
                <div className="bg-white rounded-lg p-3 border">
                  <h3 className="font-semibold text-sm mb-2">候補日程</h3>
                  <div className="space-y-2">
                    {group.candidate_dates.slice(0, 3).map((cd, i) => {
                      const summary = responseSummary.find(s => s.candidateDate.id === cd.id)
                      return (
                        <div key={cd.id} className="text-xs">
                          <div className="font-medium">{new Date(cd.date + 'T00:00:00+09:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}</div>
                          <div className="text-muted-foreground flex gap-2">
                            <span className="text-green-600">○{summary?.okCount || 0}</span>
                            <span className="text-amber-600">△{summary?.maybeCount || 0}</span>
                            <span className="text-red-600">×{summary?.ngCount || 0}</span>
                          </div>
                        </div>
                      )
                    })}
                    {group.candidate_dates.length > 3 && (
                      <button 
                        onClick={() => setActiveTab('members')}
                        className="text-xs text-purple-600 hover:underline"
                      >
                        他{group.candidate_dates.length - 3}件を表示
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* メンバー */}
              <div className="bg-white rounded-lg p-3 border">
                <h3 className="font-semibold text-sm mb-2">メンバー ({joinedMembers.length}名)</h3>
                <div className="space-y-1.5">
                  {joinedMembers.slice(0, 5).map(member => (
                    <div key={member.id} className="flex items-center gap-2 text-xs">
                      <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
                        <Users className="w-3 h-3 text-purple-600" />
                      </div>
                      <span className="truncate">{member.guest_name || member.users?.email?.split('@')[0] || 'メンバー'}</span>
                      {member.is_organizer && <Badge variant="outline" className="text-[10px] px-1 py-0">主催</Badge>}
                    </div>
                  ))}
                  {joinedMembers.length > 5 && (
                    <button 
                      onClick={() => setActiveTab('members')}
                      className="text-xs text-purple-600 hover:underline"
                    >
                      他{joinedMembers.length - 5}名を表示
                    </button>
                  )}
                </div>
              </div>

              {/* アクションボタン */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setActiveTab('members')}
                >
                  <Calendar className="w-3.5 h-3.5 mr-1.5" />
                  日程・詳細を見る
                </Button>
                {isOrganizer && group.status === 'gathering' && (
                  <Button
                    size="sm"
                    className="w-full text-xs bg-purple-600 hover:bg-purple-700"
                    onClick={() => setActiveTab('invite')}
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                    メンバーを招待
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="/" />

      <div className="bg-background border-b">
        <div className="container mx-auto max-w-5xl px-4 py-2">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 hover:bg-accent h-8 px-2 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">貸切リクエスト</h1>
          <Badge
            variant="outline"
            className={
              group.status === 'gathering'
                ? 'bg-purple-100 text-purple-800 border-purple-200'
                : isScheduleConfirmedUi
                ? 'bg-green-100 text-green-800 border-green-200'
                : group.status === 'booking_requested'
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : 'bg-gray-100 text-gray-800 border-gray-200'
            }
          >
            {group.status === 'gathering' && '募集中'}
            {group.status === 'booking_requested' && !isScheduleConfirmedUi && '予約申込済'}
            {isScheduleConfirmedUi && '確定'}
            {group.status === 'cancelled' && 'キャンセル'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* シナリオ情報 */}
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {scenario?.key_visual_url && (
                    <img
                      src={scenario.key_visual_url}
                      alt={scenario.title || ''}
                      className="w-20 h-28 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <h2 className="text-base font-medium">{scenario?.title || 'シナリオ'}</h2>
                    {group.name && (
                      <p className="text-sm text-muted-foreground mt-1">{group.name}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span className={targetReached ? 'text-green-600 font-medium' : ''}>
                          {joinedMembers.length}/{targetCount}名
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* タブ化されたコンテンツ */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full rounded-lg">
                <TabsTrigger value="members" className="flex-1 gap-1.5 rounded-md">
                  <Users className="w-4 h-4" />
                  メンバー・日程
                </TabsTrigger>
                <TabsTrigger value="chat" className="flex-1 gap-1.5 rounded-md">
                  <MessageCircle className="w-4 h-4" />
                  チャット
                </TabsTrigger>
                {group.status !== 'cancelled' && (
                  <TabsTrigger value="invite" className="flex-1 gap-1.5 rounded-md">
                    <UserPlus className="w-4 h-4" />
                    招待
                  </TabsTrigger>
                )}
              </TabsList>

              {/* メンバー・日程タブ */}
              <TabsContent value="members" className="space-y-6 mt-4">
                {/* 招待リンク (簡易版) */}
                {group.status !== 'cancelled' && (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h3 className="font-semibold">招待リンク</h3>
                      <div className="flex items-center gap-2">
                        <Input
                          value={getInviteUrl()}
                          readOnly
                          className="text-sm"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleCopyLink}
                          className="shrink-0"
                        >
                          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={handleShareLine}
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                          </svg>
                          LINEで共有
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* メンバー一覧 */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-semibold">メンバー（{joinedMembers.length}名）</h3>
                    <div className="space-y-2">
                      {joinedMembers.map(member => {
                        const hasResponded = group.candidate_dates?.every(cd =>
                          cd.responses?.some(r => r.member_id === member.id)
                        )
                        const handleRemoveMember = async () => {
                          if (!confirm(`${member.guest_name || member.users?.email || 'このメンバー'}を削除しますか？`)) return
                          try {
                            await removeMember(member.id)
                            refetch()
                          } catch (err) {
                            logger.error('Failed to remove member', err)
                          }
                        }
                        return (
                          <div
                            key={member.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {member.guest_name || member.users?.email || 'メンバー'}
                              </span>
                              {member.is_organizer && (
                                <Badge variant="outline" className="text-xs">主催者</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={hasResponded
                                  ? 'bg-green-100 text-green-800 border-green-200 text-xs'
                                  : 'bg-amber-100 text-amber-800 border-amber-200 text-xs'
                                }
                              >
                                {hasResponded ? '回答済' : '未回答'}
                              </Badge>
                              {/* 主催者のみメンバー削除可能 */}
                              {isOrganizer && !member.is_organizer && group.status === 'gathering' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={handleRemoveMember}
                                  disabled={actionLoading}
                                >
                                  <UserMinus className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* 日程調整結果 */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">候補日時（{group.candidate_dates?.length || 0}件）</h3>
                      {isOrganizer && canMutateScheduleBeforeStoreReply && (
                        <AddCandidateDates
                          groupId={group.id}
                          organizationId={group.organization_id || ''}
                          scenarioId={group.scenario_master_id || ''}
                          storeIds={group.preferred_store_ids || []}
                          existingDates={group.candidate_dates || []}
                          onDatesAdded={refetch}
                        />
                      )}
                    </div>

                    {(!group.candidate_dates || group.candidate_dates.length === 0) ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">候補日時がまだ設定されていません</p>
                        {isOrganizer && (
                          <p className="text-xs mt-1">「候補日を追加」から日時を設定してください</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {responseSummary.map((summary, index) => {
                          const cd = summary.candidateDate
                          const isRecommended = summary.isViable && summary.okCount >= targetCount
                          return (
                            <div
                              key={cd.id}
                              className={`p-3 rounded-lg border ${
                                isRecommended
                                  ? 'border-green-300 bg-green-50'
                                  : summary.isViable
                                  ? 'border-gray-200 bg-gray-50'
                                  : 'border-red-200 bg-red-50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm">
                                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                                      候補 {index + 1}
                                    </Badge>
                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                    <span>{formatDate(cd.date)}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Clock className="w-4 h-4" />
                                    <span>{cd.time_slot} {cd.start_time} - {cd.end_time}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1 text-sm">
                                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                      <Circle className="w-2.5 h-2.5 text-white" />
                                    </div>
                                    <span className="text-green-700 font-medium">{summary.okCount}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-sm">
                                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                                      <HelpCircle className="w-2.5 h-2.5 text-white" />
                                    </div>
                                    <span className="text-amber-700 font-medium">{summary.maybeCount}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-sm">
                                    <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                                      <X className="w-2.5 h-2.5 text-white" />
                                    </div>
                                    <span className="text-red-700 font-medium">{summary.ngCount}</span>
                                  </div>
                                  {isRecommended && (
                                    <Badge className="bg-green-600 text-white text-xs">おすすめ</Badge>
                                  )}
                                  {!summary.isViable && (
                                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs">NG</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* チャットタブ */}
              <TabsContent value="chat" className="mt-4">
                <GroupChat
                  groupId={group.id}
                  currentMemberId={joinedMembers.find(m => m.user_id === user?.id)?.id || null}
                  members={joinedMembers}
                  scenarioId={group.scenario_master_id || undefined}
                  organizationId={group.organization_id || undefined}
                  performanceDate={group.candidate_dates?.[0]?.date}
                />
              </TabsContent>

              {/* 招待タブ */}
              {group.status !== 'cancelled' && (
                <TabsContent value="invite" className="mt-4">
                  <UserSearchInvite
                    groupId={group.id}
                    inviteCode={group.invite_code}
                    members={joinedMembers}
                    onInvitationSent={refetch}
                  />
                </TabsContent>
              )}
            </Tabs>
          </div>

          {/* 右側サイドバー */}
          <div className="space-y-6">
            <Card className="sticky top-4">
              <CardContent className="p-4 space-y-4">
                {/* ステップ形式の進捗表示（全ステータス共通） */}
                {group.status !== 'cancelled' && (
                  <>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-sm text-gray-700">貸切予約の進捗</h3>
                      {group.status === 'gathering' && (
                        <div className="text-xs text-muted-foreground">
                          申込準備中（{[joinedMembers.length >= 1, (group.candidate_dates?.length || 0) > 0, allMembersResponded].filter(Boolean).length}/3 完了）
                        </div>
                      )}
                      {group.status === 'booking_requested' && !isScheduleConfirmedUi && (
                        <div className="text-xs text-blue-600 font-medium">日程確定待ち</div>
                      )}
                      {isScheduleConfirmedUi && (
                        <div className="text-xs text-green-600 font-medium">公演日まであと少し！</div>
                      )}
                    </div>

                    <div className="space-y-2">
                      {/* STEP 1: メンバー招待 */}
                      <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                        group.status !== 'gathering' || joinedMembers.length >= 2 
                          ? 'bg-green-50 border-green-200' 
                          : 'bg-amber-50 border-amber-200'
                      }`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          group.status !== 'gathering' || joinedMembers.length >= 2 
                            ? 'bg-green-600 text-white' 
                            : 'bg-amber-500 text-white'
                        }`}>
                          {group.status !== 'gathering' || joinedMembers.length >= 2 ? <Check className="w-3 h-3" /> : '1'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">メンバーを招待</div>
                          <div className="text-xs text-muted-foreground">
                            {joinedMembers.length}名参加中
                          </div>
                        </div>
                      </div>

                      {/* STEP 2: 候補日追加 */}
                      <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                        group.status !== 'gathering' || (group.candidate_dates?.length || 0) > 0 
                          ? 'bg-green-50 border-green-200' 
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          group.status !== 'gathering' || (group.candidate_dates?.length || 0) > 0 
                            ? 'bg-green-600 text-white' 
                            : 'bg-gray-400 text-white'
                        }`}>
                          {group.status !== 'gathering' || (group.candidate_dates?.length || 0) > 0 ? <Check className="w-3 h-3" /> : '2'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">候補日を追加</div>
                          <div className="text-xs text-muted-foreground">
                            {group.candidate_dates?.length || 0}件
                          </div>
                        </div>
                      </div>

                      {/* STEP 3: 日程回答待ち */}
                      <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                        group.status !== 'gathering' || allMembersResponded 
                          ? 'bg-green-50 border-green-200' 
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          group.status !== 'gathering' || allMembersResponded 
                            ? 'bg-green-600 text-white' 
                            : 'bg-gray-400 text-white'
                        }`}>
                          {group.status !== 'gathering' || allMembersResponded ? <Check className="w-3 h-3" /> : '3'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">日程回答を集める</div>
                          <div className="text-xs text-muted-foreground">
                            {group.status !== 'gathering' 
                              ? '完了' 
                              : `${joinedMembers.filter(m => group.candidate_dates?.every(cd => cd.responses?.some(r => r.member_id === m.id))).length}/${joinedMembers.length}名回答済`}
                          </div>
                        </div>
                      </div>

                      {/* STEP 4: 予約申込 */}
                      <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                        group.status === 'booking_requested' || group.status === 'confirmed'
                          ? 'bg-green-50 border-green-200' 
                          : group.status === 'gathering' && hasViableDate
                            ? 'bg-purple-50 border-purple-200'
                            : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          group.status === 'booking_requested' || group.status === 'confirmed'
                            ? 'bg-green-600 text-white' 
                            : group.status === 'gathering' && hasViableDate
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-400 text-white'
                        }`}>
                          {group.status === 'booking_requested' || group.status === 'confirmed' ? <Check className="w-3 h-3" /> : '4'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">貸切を申し込む</div>
                          <div className="text-xs text-muted-foreground">
                            {group.status === 'booking_requested' || group.status === 'confirmed'
                              ? '申込完了' 
                              : hasViableDate 
                                ? '申込可能！' 
                                : '調整中'}
                          </div>
                        </div>
                      </div>

                      {/* STEP 5: 日程確定 */}
                      <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                        isScheduleConfirmedUi
                          ? 'bg-green-50 border-green-200' 
                          : group.status === 'booking_requested'
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isScheduleConfirmedUi
                            ? 'bg-green-600 text-white' 
                            : group.status === 'booking_requested'
                              ? 'bg-blue-600 text-white animate-pulse'
                              : 'bg-gray-400 text-white'
                        }`}>
                          {isScheduleConfirmedUi ? <Check className="w-3 h-3" /> : '5'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">日程確定</div>
                          <div className="text-xs text-muted-foreground">
                            {isScheduleConfirmedUi
                              ? '確定しました！' 
                              : group.status === 'booking_requested'
                                ? '店舗からの連絡待ち'
                                : '申込後'}
                          </div>
                        </div>
                      </div>

                      {/* STEP 6: 事前アンケート（キャラクター設定がある場合のみ表示） */}
                      {group.scenario_masters?.characters && (group.scenario_masters.characters as unknown[]).length > 0 && (
                        <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                          isScheduleConfirmedUi
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}>
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isScheduleConfirmedUi
                              ? 'bg-amber-500 text-white'
                              : 'bg-gray-400 text-white'
                          }`}>
                            6
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">事前アンケート</div>
                            <div className="text-xs text-muted-foreground">
                              {isScheduleConfirmedUi ? '回答してください' : '確定後'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* STEP 7: 配役確定（キャラクター設定がある場合のみ表示） */}
                      {group.scenario_masters?.characters && (group.scenario_masters.characters as unknown[]).length > 0 && (
                        <div className={`flex items-start gap-3 p-2.5 rounded-lg border bg-gray-50 border-gray-200`}>
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-400 text-white">
                            7
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">配役確定</div>
                            <div className="text-xs text-muted-foreground">
                              アンケート後
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 進捗共有ボタン */}
                    {group.status === 'gathering' && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={handleShareProgress}
                          className="flex-1 gap-2"
                        >
                          {progressCopied ? (
                            <>
                              <Check className="w-4 h-4 text-green-600" />
                              コピーしました
                            </>
                          ) : (
                            <>
                              <Share2 className="w-4 h-4" />
                              進捗を共有
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* 主催者のみ予約申込・キャンセルが可能 */}
                    {group.status === 'gathering' && isOrganizer && (
                      <>
                        <Button
                          onClick={handleProceedToBooking}
                          disabled={(group.candidate_dates?.length || 0) === 0}
                          className="w-full bg-purple-600 hover:bg-purple-700"
                        >
                          貸切を申し込む
                        </Button>

                        <Button
                          variant="ghost"
                          onClick={handleCancelGroup}
                          disabled={cancelling}
                          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {cancelling ? 'キャンセル中...' : 'グループをキャンセル'}
                        </Button>
                      </>
                    )}

                    {/* booking_requested 状態のアクション */}
                    {group.status === 'booking_requested' && !isScheduleConfirmedUi && (
                      <div className="pt-2 border-t space-y-2">
                        <p className="text-sm text-center text-muted-foreground">
                          店舗からの確定連絡をお待ちください
                        </p>
                      </div>
                    )}

                    {/* confirmed 状態のアクション */}
                    {isScheduleConfirmedUi && (
                      <div className="pt-2 border-t space-y-2">
                        <Button
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => navigate('/mypage')}
                        >
                          <ExternalLink className="w-4 h-4" />
                          マイページで確認
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {group.status === 'cancelled' && (
                  <div className="text-center space-y-2">
                    <Badge variant="outline" className="bg-gray-100 text-gray-800">キャンセル済み</Badge>
                    <p className="text-sm text-muted-foreground">
                      このグループはキャンセルされました
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* 日程選択モーダル */}
      {showDateSelectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[80vh] overflow-hidden">
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-lg">申込日程を選択</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  店舗に申し込む候補日を選んでください（最大6件）
                </p>
              </div>
              
              <div className="p-4 max-h-[50vh] overflow-y-auto space-y-2">
                {responseSummary.map((summary, index) => {
                  const cd = summary.candidateDate
                  const isSelected = selectedDatesForBooking.includes(cd.id)
                  const isRecommended = summary.isViable && summary.okCount >= targetCount
                  
                  return (
                    <div
                      key={cd.id}
                      onClick={() => toggleDateSelection(cd.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50'
                          : isRecommended
                          ? 'border-green-300 bg-green-50 hover:border-green-400'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-purple-600 bg-purple-600' : 'border-gray-300'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{formatDate(cd.date)}</span>
                            <Badge variant="outline" className="text-xs">
                              {cd.time_slot}
                            </Badge>
                            {isRecommended && (
                              <Badge className="bg-green-600 text-white text-xs">おすすめ</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {cd.start_time} - {cd.end_time} ･ {summary.okCount}名が参加可能
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              
              <div className="p-4 border-t bg-gray-50 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDateSelectionModal(false)}
                >
                  キャンセル
                </Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  disabled={selectedDatesForBooking.length === 0}
                  onClick={() => {
                    setShowDateSelectionModal(false)
                    proceedWithSelectedDates(selectedDatesForBooking)
                  }}
                >
                  {selectedDatesForBooking.length}件で申し込む
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

import { useState, useMemo } from 'react'
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
  const { group, loading: groupLoading, error: groupError, refetch } = usePrivateGroupData(id || null)
  const { updateGroupStatus, getDateResponsesSummary, removeMember, loading: actionLoading } = usePrivateGroup()

  const [copied, setCopied] = useState(false)
  const [progressCopied, setProgressCopied] = useState(false)
  const [cancelling, setCancelling] = useState(false)

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
    const scenario = group.scenario_masters
    const text = `貸切マーダーミステリーに参加しませんか？\n\n🎭 ${scenario?.title || 'シナリオ'}\n👥 ${group.target_participant_count}名で貸切\n\n以下のリンクから参加・日程回答をお願いします👇`
    const url = getInviteUrl()
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
  }

  const handleShareProgress = async () => {
    if (!group) return
    const scenario = group.scenario_masters
    const candidateDates = group.candidate_dates || []

    let progressText = `📊 貸切グループ進捗状況\n\n`
    progressText += `🎭 ${scenario?.title || 'シナリオ'}\n`
    progressText += `👥 メンバー: ${joinedMembers.length}/${group.target_participant_count}名\n\n`

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

    const bestDate = responseSummary.find(r => r.isViable)
    const params = new URLSearchParams()
    params.set('groupId', group.id)
    if (bestDate) {
      params.set('preferredDate', bestDate.candidateDate.date)
      params.set('preferredSlot', bestDate.candidateDate.time_slot)
    }
    if (group.preferred_store_ids && group.preferred_store_ids.length > 0) {
      params.set('storeIds', group.preferred_store_ids.join(','))
    }
    if (group.scenario_id) {
      params.set('scenarioId', group.scenario_id)
    }

    navigate(`/private-booking?${params.toString()}`)
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

  const isOrganizer = user && group?.organizer_id === user.id

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

  if (!isOrganizer) {
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
                グループの管理は主催者のみ可能です
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

  const scenario = group.scenario_masters
  const allMembersResponded = joinedMembers.every(m => {
    const memberResponses = group.candidate_dates?.every(cd =>
      cd.responses?.some(r => r.member_id === m.id)
    )
    return memberResponses
  })
  const hasViableDate = responseSummary.some(r => r.isViable && r.okCount >= (group.target_participant_count || 1))
  const targetReached = joinedMembers.length >= (group.target_participant_count || 1)

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
          <h1 className="text-xl font-bold">貸切グループ管理</h1>
          <Badge
            variant="outline"
            className={
              group.status === 'gathering'
                ? 'bg-purple-100 text-purple-800 border-purple-200'
                : group.status === 'booking_requested'
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : group.status === 'confirmed'
                ? 'bg-green-100 text-green-800 border-green-200'
                : 'bg-gray-100 text-gray-800 border-gray-200'
            }
          >
            {group.status === 'gathering' && '募集中'}
            {group.status === 'booking_requested' && '予約申込済'}
            {group.status === 'confirmed' && '確定'}
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
                          {joinedMembers.length}/{group.target_participant_count || '?'}名
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* タブ化されたコンテンツ */}
            <Tabs defaultValue="members" className="w-full">
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
                              {/* 主催者以外は削除可能 */}
                              {!member.is_organizer && group.status === 'gathering' && (
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
                      {isOrganizer && group.status === 'gathering' && (
                        <AddCandidateDates
                          groupId={group.id}
                          scenarioId={group.scenario_id || ''}
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
                          const isRecommended = summary.isViable && summary.okCount >= (group.target_participant_count || 1)
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
                {group.status === 'gathering' && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {targetReached ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                        )}
                        <span className="text-sm">
                          {targetReached ? '目標人数に達しました' : `あと${(group.target_participant_count || 1) - joinedMembers.length}名`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {allMembersResponded ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                        )}
                        <span className="text-sm">
                          {allMembersResponded ? '全員回答済み' : '未回答のメンバーがいます'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasViableDate ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                        )}
                        <span className="text-sm">
                          {hasViableDate ? '全員参加可能な日程あり' : '全員参加可能な日程なし'}
                        </span>
                      </div>
                    </div>

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

                {group.status === 'booking_requested' && (
                  <div className="text-center space-y-2">
                    <Badge className="bg-blue-600 text-white">予約申込済み</Badge>
                    <p className="text-sm text-muted-foreground">
                      店舗からの確定連絡をお待ちください
                    </p>
                  </div>
                )}

                {group.status === 'confirmed' && (
                  <div className="text-center space-y-2">
                    <Badge className="bg-green-600 text-white">予約確定</Badge>
                    <p className="text-sm text-muted-foreground">
                      予約が確定しました
                    </p>
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
    </div>
  )
}

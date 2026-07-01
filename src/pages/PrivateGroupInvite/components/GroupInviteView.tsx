// 貸切グループ 非チャット表示（招待/参加フロー・進捗ステップ/タブ/参加費/PIN認証/ゲスト情報 等）
// PrivateGroupInvite/index.tsx から presentational 抽出（byte 逐語移送・挙動不変）
import React from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, Clock, Users, AlertCircle, Circle, HelpCircle, Loader2, Ticket, CreditCard, LogOut, MessageCircle, Check, UserPlus, Copy, Share2, ArrowLeft, X } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GroupChat } from '@/pages/PrivateGroupManage/components/GroupChat'
import { AddCandidateDates } from '@/pages/PrivateGroupManage/components/AddCandidateDates'
import { SurveyResponseForm } from './SurveyResponseForm'
import { formatJstDateJa } from '@/utils/jstDate'
import type { NavigateFunction } from 'react-router-dom'
import type { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'
import type { usePrivateGroup } from '@/hooks/usePrivateGroup'
import type { useAuth } from '@/contexts/AuthContext'
import type { DateResponse } from '@/types'

type GroupType = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>
type GroupMember = NonNullable<GroupType['members']>[number]
type ResponseValue = DateResponse | null
interface Coupon {
  id: string
  name: string
  discount_amount: number
  expires_at: string | null
  status: string
}
type ScenarioView = {
  id?: string
  slug?: string
  title?: string
  key_visual_url?: string
  player_count_min?: number
  player_count_max?: number
  effective_player_count_min?: number
  effective_player_count_max?: number
  characters?: unknown[]
} | undefined

interface GroupInviteViewProps {
  group: GroupType
  scenario: ScenarioView
  joinedMembers: GroupMember[]
  organizerMember: GroupMember | undefined
  organizerName: string
  memberCount: number
  inviteMemberCap: number | null
  isGroupFull: boolean
  user: ReturnType<typeof useAuth>['user']
  code: string | null
  existingMemberId: string | null
  responses: Record<string, ResponseValue>
  isOrganizer: boolean | null
  isChatMode: string | boolean | null
  isScheduleConfirmedUi: boolean
  allMembersResponded: boolean
  canMutateScheduleBeforeStoreReply: boolean
  bookingProgressReady: boolean
  hasCharacters: boolean | undefined
  needsCharAssignmentChoice: boolean
  charAssignmentMethod: string | null
  scenarioCharacters: any[]
  scenarioMax: number | null
  confirmedByName: ReturnType<typeof usePrivateGroupByInviteCode>['confirmedByName']
  actionLoading: boolean
  cancelling: boolean
  copied: boolean
  error: string | null
  activeTab: string
  showPinAuth: boolean
  guestName: string
  guestEmail: string
  pinEmail: string
  pinCode: string
  pinError: string | null
  couponLoading: boolean
  coupons: Coupon[]
  selectedCoupon: Coupon | null
  selectedCouponId: string | null
  perPersonPrice: number
  discountAmount: number
  finalAmount: number
  setActiveTab: (tab: string) => void
  setExistingMemberId: React.Dispatch<React.SetStateAction<string | null>>
  setGuestName: React.Dispatch<React.SetStateAction<string>>
  setGuestEmail: React.Dispatch<React.SetStateAction<string>>
  setPinEmail: React.Dispatch<React.SetStateAction<string>>
  setPinCode: React.Dispatch<React.SetStateAction<string>>
  setSelectedCouponId: React.Dispatch<React.SetStateAction<string | null>>
  navigate: NavigateFunction
  refetch: ReturnType<typeof usePrivateGroupByInviteCode>['refetch']
  leaveGroup: ReturnType<typeof usePrivateGroup>['leaveGroup']
  formatDate: (dateStr: string) => string
  getResponseIcon: (response: ResponseValue, type: DateResponse) => React.ReactNode
  getInviteUrl: () => string
  openSheet: (name: string) => void
  closeSheet: () => void
  clearGuestSession: () => void
  handleCancelGroup: () => Promise<void>
  handlePinAuth: () => Promise<void>
  handleCopyUrl: () => Promise<void>
  handleRemoveMember: (memberId: string) => Promise<void>
  handleResponseChange: (candidateDateId: string, response: DateResponse) => void
  handleOpenBookingDialog: () => Promise<void>
  handleSubmit: (options?: { skipSuccessPage?: boolean }) => Promise<void>
}

export function GroupInviteView({
  group, scenario, joinedMembers, organizerMember, organizerName, memberCount, inviteMemberCap, isGroupFull,
  user, code, existingMemberId, responses, isOrganizer, isChatMode, isScheduleConfirmedUi, allMembersResponded,
  canMutateScheduleBeforeStoreReply, bookingProgressReady, hasCharacters, needsCharAssignmentChoice, charAssignmentMethod,
  scenarioCharacters, scenarioMax, confirmedByName, actionLoading, cancelling, copied, error, activeTab, showPinAuth,
  guestName, guestEmail, pinEmail, pinCode, pinError, couponLoading, coupons, selectedCoupon, selectedCouponId,
  perPersonPrice, discountAmount, finalAmount,
  setActiveTab, setExistingMemberId, setGuestName, setGuestEmail, setPinEmail, setPinCode, setSelectedCouponId,
  navigate, refetch, leaveGroup, formatDate, getResponseIcon, getInviteUrl, openSheet, closeSheet, clearGuestSession,
  handleCancelGroup, handlePinAuth, handleCopyUrl, handleRemoveMember, handleResponseChange, handleOpenBookingDialog, handleSubmit,
}: GroupInviteViewProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <NavigationBar currentPage="/" />

      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 戻るボタン */}
        <button
          onClick={() => navigate('/mypage')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          マイページに戻る
        </button>

        <Card className="border-purple-200 bg-purple-50/50 mb-6">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-purple-800">
              <span className="font-medium">{organizerName}</span>さんからの貸切お誘い
            </p>
          </CardContent>
        </Card>

        {/* 新規登録特典案内 */}
        {!user && (
          <Card className="mb-6 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">🎁</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-800">
                    新規会員登録で2,000円分クーポンプレゼント！
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    ログインして参加すると、次回予約で使えるクーポンがもらえます
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={() => navigate(`/signup?redirect=${encodeURIComponent(location.pathname)}`)}
                >
                  新規登録
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-amber-500 text-amber-700 hover:bg-amber-100"
                  onClick={() => navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)}
                >
                  ログイン
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* シナリオ情報 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex gap-4">
              {scenario?.key_visual_url && (
                <img
                  src={scenario.key_visual_url}
                  alt={scenario.title || ''}
                  className="w-20 h-28 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
                />
              )}
              <div className="flex-1">
                <h2 
                  className="text-base font-medium cursor-pointer hover:text-primary transition-colors"
                  onClick={() => scenario && navigate(`/scenario/${scenario.slug || scenario.id}`)}
                >
                  {scenario?.title || 'シナリオ'}
                </h2>
                {group.name && (
                  <p className="text-sm text-muted-foreground mt-1">{group.name}</p>
                )}
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>
                      {memberCount}/{inviteMemberCap ?? '?'}名
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="mt-2 bg-purple-100 text-purple-800 border-purple-200 text-xs">
                  貸切リクエスト
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-4 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        {/* 進捗ステップ表示（参加済みメンバー向け、チャットモード時は非表示） */}
        {existingMemberId && (group.status as string) !== 'cancelled' && !isChatMode && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="space-y-1 mb-3">
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
                {/* STEP 1: メンバー招待（1名以上または申込済みで完了） */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                  group.status !== 'gathering' || joinedMembers.length >= 1 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    group.status !== 'gathering' || joinedMembers.length >= 1 
                      ? 'bg-green-600 text-white' 
                      : 'bg-amber-500 text-white'
                  }`}>
                    {group.status !== 'gathering' || joinedMembers.length >= 1 ? <Check className="w-3 h-3" /> : '1'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">メンバーを招待</span>
                    <span className="text-xs text-muted-foreground ml-2">{joinedMembers.length}名</span>
                  </div>
                </div>

                {/* STEP 2: 候補日追加 */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
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
                    <span className="text-sm">候補日を追加</span>
                    <span className="text-xs text-muted-foreground ml-2">{group.candidate_dates?.length || 0}件</span>
                  </div>
                </div>

                {/* STEP 3: 日程回答待ち */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
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
                    <span className="text-sm">日程回答を集める</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {group.status !== 'gathering' 
                        ? '完了' 
                        : `${joinedMembers.filter(m => group.candidate_dates?.every(cd => cd.responses?.some(r => r.member_id === m.id))).length}/${joinedMembers.length}名`}
                    </span>
                  </div>
                </div>

                {/* STEP 4: 予約申込 */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
                  group.status === 'booking_requested' || group.status === 'confirmed'
                    ? 'bg-green-50 border-green-200' 
                    : (group.status === 'gathering' || group.status === 'date_adjusting') && bookingProgressReady
                      ? 'bg-purple-50 border-purple-200'
                      : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    group.status === 'booking_requested' || group.status === 'confirmed'
                      ? 'bg-green-600 text-white' 
                      : (group.status === 'gathering' || group.status === 'date_adjusting') && bookingProgressReady
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-400 text-white'
                  }`}>
                    {group.status === 'booking_requested' || group.status === 'confirmed' ? <Check className="w-3 h-3" /> : '4'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">貸切を申し込む</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {group.status === 'booking_requested' || group.status === 'confirmed'
                        ? '申込完了' 
                        : bookingProgressReady ? '申込可能！' : '調整中'}
                    </span>
                  </div>
                </div>

                {/* STEP 5: 日程確定 */}
                <div className={`flex items-center gap-3 p-2 rounded-lg border ${
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
                    <div className="flex items-center gap-1">
                      <span className="text-sm">日程確定</span>
                      <span className="text-xs text-muted-foreground">
                        {isScheduleConfirmedUi
                          ? '確定！' 
                          : group.status === 'booking_requested'
                            ? '連絡待ち'
                            : '申込後'}
                      </span>
                    </div>
                    {isScheduleConfirmedUi && confirmedByName && (
                      <div className="text-xs text-green-700">
                        承認者: {confirmedByName}
                      </div>
                    )}
                  </div>
                </div>

                {/* STEP 6: 事前アンケート */}
                {hasCharacters && (
                  <div className={`flex items-center gap-3 p-2 rounded-lg border ${
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
                      <span className="text-sm">事前アンケート</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {isScheduleConfirmedUi ? '回答してください' : '確定後'}
                      </span>
                    </div>
                  </div>
                )}

                {/* STEP 7: 配役確定 */}
                {hasCharacters && (
                  <div className="flex items-center gap-3 p-2 rounded-lg border bg-gray-50 border-gray-200">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-400 text-white">
                      7
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">配役確定</span>
                      <span className="text-xs text-muted-foreground ml-2">アンケート後</span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* チャットを開くボタン */}
              <Button
                onClick={() => setActiveTab('chat')}
                className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                チャットを開く
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 参加済みメンバー向けタブ */}
        {existingMemberId && group.members && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
            <TabsList className={`grid w-full mb-4 ${isOrganizer ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <TabsTrigger value="schedule" className="gap-1.5">
                <Calendar className="w-4 h-4" />
                日程
              </TabsTrigger>
              <TabsTrigger value="chat" className="gap-1.5">
                <MessageCircle className="w-4 h-4" />
                チャット
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-1.5">
                <Users className="w-4 h-4" />
                メンバー
              </TabsTrigger>
              {isOrganizer && (
                <TabsTrigger value="manage" className="gap-1.5">
                  <UserPlus className="w-4 h-4" />
                  管理
                </TabsTrigger>
              )}
            </TabsList>

            {/* 日程タブ */}
            <TabsContent value="schedule">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">参加可能な日時を選んでください</h3>
                {group.candidate_dates?.map((cd, index) => {
                  const dateResponses = cd.responses || []
                  const okCount = dateResponses.filter(r => r.response === 'ok').length
                  const maybeCount = dateResponses.filter(r => r.response === 'maybe').length
                  const ngCount = dateResponses.filter(r => r.response === 'ng').length
                  const totalMembers = joinedMembers.length
                  const respondedCount = dateResponses.length
                  const isRejected = cd.status === 'rejected'
                  const showIcons = group.status === 'gathering' && !isRejected
                  
                  return (
                    <Card key={cd.id} className={isRejected ? 'opacity-70 bg-gray-50' : ''}>
                      <CardContent className="p-2.5 sm:p-3">
                        <div className={`flex items-center gap-2 ${showIcons ? 'mb-1.5' : ''}`}>
                          <div className="flex-1 min-w-0 leading-tight">
                            <div className="flex items-center gap-1.5 flex-wrap text-xs">
                              {isRejected ? (
                                <Badge variant="outline" className="h-5 px-1.5 py-0 text-[10px] bg-red-100 text-red-800 border-red-200">
                                  却下
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="h-5 px-1.5 py-0 text-[10px] bg-purple-100 text-purple-800 border-purple-200">
                                  {index + 1}
                                </Badge>
                              )}
                              <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className={`font-medium ${isRejected ? 'line-through text-muted-foreground' : ''}`}>{formatDate(cd.date)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span className={isRejected ? 'line-through' : ''}>{cd.time_slot} {cd.start_time} - {cd.end_time}</span>
                            </div>
                          </div>
                          {/* 回答状況サマリー（却下された場合は非表示） */}
                          {!isRejected && (
                            <div className="text-right shrink-0">
                              <div className="flex items-center justify-end gap-0.5 text-[10px]">
                                <span className="text-green-600">○{okCount}</span>
                                <span className="text-amber-600">△{maybeCount}</span>
                                <span className="text-red-600">×{ngCount}</span>
                              </div>
                              <div className="text-[9px] text-muted-foreground leading-none mt-0.5">
                                {respondedCount}/{totalMembers}人
                              </div>
                            </div>
                          )}
                        </div>
                        {/* 回答ボタン（日程申込前かつ却下されていない場合のみ表示） */}
                        {showIcons && (
                          <div className="flex gap-2">
                            <div onClick={() => handleResponseChange(cd.id, 'ok')}>
                              {getResponseIcon(responses[cd.id], 'ok')}
                            </div>
                            <div onClick={() => handleResponseChange(cd.id, 'maybe')}>
                              {getResponseIcon(responses[cd.id], 'maybe')}
                            </div>
                            <div onClick={() => handleResponseChange(cd.id, 'ng')}>
                              {getResponseIcon(responses[cd.id], 'ng')}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
                <div className="flex justify-center gap-6 mt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                      <Circle className="w-2 h-2 text-white" />
                    </div>
                    参加可能
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                      <HelpCircle className="w-2 h-2 text-white" />
                    </div>
                    未定
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                      <X className="w-2 h-2 text-white" />
                    </div>
                    不可
                  </div>
                </div>
                
                {/* 回答更新ボタン（日程申込前のみ表示） */}
                {group.status === 'gathering' && (
                  <Button
                    onClick={() => handleSubmit()}
                    disabled={actionLoading}
                    className="w-full bg-purple-600 hover:bg-purple-700 mt-4"
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        送信中...
                      </>
                    ) : '回答を更新する'}
                  </Button>
                )}
                
                {/* 主催者向け申請ボタン（日程調整中・再調整中の両方） */}
                {isOrganizer && canMutateScheduleBeforeStoreReply && (group.candidate_dates?.length || 0) > 0 && (
                  <Button
                    onClick={handleOpenBookingDialog}
                    className="w-full bg-green-600 hover:bg-green-700 mt-3"
                  >
                    予約リクエストを作成
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* チャットタブ */}
            <TabsContent value="chat">
              <GroupChat
                groupId={group.id}
                currentMemberId={existingMemberId}
                members={group.members}
                onGoToSchedule={() => setActiveTab('schedule')}
                scenarioId={group.scenario_master_id || undefined}
                organizationId={group.organization_id || undefined}
                performanceDate={group.candidate_dates?.[0]?.date}
                needsCharAssignmentChoice={needsCharAssignmentChoice}
                onCharAssignmentMethodSelected={async (method) => {
                  await supabase.from('private_groups').update({ character_assignment_method: method, character_assignments: null }).eq('id', group.id)
                  await supabase.rpc('clear_character_selection_from_survey', { p_group_id: group.id })
                  const methodLabel = method === 'survey' ? 'アンケート' : '自分たちで決める'
                  await supabase.from('private_group_messages').insert({
                    group_id: group.id,
                    member_id: existingMemberId,
                    message: JSON.stringify({ type: 'system', action: 'character_method_selected', title: `配役方法が選択されました`, body: `「${methodLabel}」が選択されました。` }),
                  })
                  refetch()
                }}
                charAssignmentMethod={charAssignmentMethod}
                characters={scenarioCharacters}
                isOrganizer={group.members?.find(m => m.id === existingMemberId)?.is_organizer || false}
                onCharAssignmentConfirmed={() => refetch()}
                onResetCharAssignmentMethod={async () => {
                  await supabase.from('private_groups').update({ character_assignment_method: null, character_assignments: null }).eq('id', group.id)
                  await supabase.rpc('clear_character_selection_from_survey', { p_group_id: group.id })
                  refetch()
                }}
                scenarioPlayerCount={scenarioMax}
              />
            </TabsContent>

            {/* メンバータブ */}
            <TabsContent value="members">
              <div className="space-y-3">
                <h3 className="text-base font-semibold">参加メンバー（{group.members.filter(m => m.status === 'joined').length}名）</h3>
                {group.members.filter(m => m.status === 'joined').map(member => (
                  <Card key={member.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                          <Users className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {member.guest_name || member.users?.nickname || member.users?.email?.split('@')[0] || 'メンバー'}
                          </p>
                          {member.is_organizer && (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                              主催者
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.id === existingMemberId && (
                          <Badge variant="outline" className="text-xs">あなた</Badge>
                        )}
                        {isOrganizer && !member.is_organizer && member.id !== existingMemberId && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveMember(member.id)}
                            className="text-red-600 border-red-200 hover:text-red-700 hover:bg-red-50 hover:border-red-300"
                          >
                            退出させる
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* 管理タブ（主催者のみ） */}
            {isOrganizer && (
              <TabsContent value="manage">
                <div className="space-y-6">
                  {/* 招待URL共有 */}
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <h3 className="text-base font-semibold flex items-center gap-2">
                        <Share2 className="w-4 h-4" />
                        招待リンクを共有
                      </h3>
                      <div className="flex gap-2">
                        <Input
                          value={getInviteUrl()}
                          readOnly
                          className="text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyUrl}
                          className="shrink-0"
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 候補日追加 */}
                  {isOrganizer && canMutateScheduleBeforeStoreReply && (
                    <AddCandidateDates
                      groupId={group.id}
                      organizationId={group.organization_id || ''}
                      scenarioId={group.scenario_master_id || ''}
                      storeIds={group.preferred_store_ids || []}
                      existingDates={group.candidate_dates || []}
                      onDatesAdded={refetch}
                      organizerMemberId={organizerMember?.id}
                    />
                  )}

                  {/* 申込ガイダンス */}
                  {isOrganizer && canMutateScheduleBeforeStoreReply && (group.candidate_dates?.length || 0) > 0 && (
                    <Card className="border-green-200 bg-green-50">
                      <CardContent className="p-4 text-center text-sm text-muted-foreground">
                        ↑ 上の候補日から採用する日程を選んで「この日程で申請する」を押してください
                      </CardContent>
                    </Card>
                  )}

                  {/* キャンセルボタン */}
                  {group.status === 'gathering' && (
                    <Card className="border-red-200">
                      <CardContent className="p-4">
                        <Button
                          variant="outline"
                          onClick={handleCancelGroup}
                          disabled={cancelling}
                          className="w-full text-red-600 border-red-300 hover:bg-red-50"
                        >
                          {cancelling ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              キャンセル中...
                            </>
                          ) : 'グループをキャンセル'}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}

        {/* 参加費・クーポン */}
        {perPersonPrice > 0 && (
          <Card className="mb-6 border-blue-200">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold">参加費</h3>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">1人あたり参加費</span>
                  <span className="font-medium">¥{perPersonPrice.toLocaleString()}</span>
                </div>
                
                {selectedCoupon && (
                  <div className="flex justify-between items-center text-sm text-green-600">
                    <span className="flex items-center gap-1">
                      <Ticket className="w-4 h-4" />
                      クーポン割引
                    </span>
                    <span>-¥{discountAmount.toLocaleString()}</span>
                  </div>
                )}
                
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="font-medium">お支払い金額</span>
                  <span className="text-lg font-bold text-blue-600">¥{finalAmount.toLocaleString()}</span>
                </div>
              </div>

              {/* クーポン選択（ログインユーザーのみ） */}
              {user && (
                <div className="pt-2 border-t">
                  <Label className="text-sm font-medium mb-2 block flex items-center gap-1">
                    <Ticket className="w-4 h-4 text-amber-500" />
                    クーポンを使う
                  </Label>
                  {couponLoading ? (
                    <div className="text-sm text-muted-foreground">読み込み中...</div>
                  ) : coupons.length > 0 ? (
                    <Select
                      value={selectedCouponId || 'none'}
                      onValueChange={(value) => setSelectedCouponId(value === 'none' ? null : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="クーポンを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">クーポンを使用しない</SelectItem>
                        {coupons.map((coupon) => (
                          <SelectItem key={coupon.id} value={coupon.id}>
                            {coupon.name} - ¥{coupon.discount_amount.toLocaleString()}OFF
                            {coupon.expires_at && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({formatJstDateJa(coupon.expires_at)}まで)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      利用可能なクーポンがありません
                    </p>
                  )}
                </div>
              )}

              {/* 未ログインの場合のクーポン案内 */}
              {!user && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    <Ticket className="w-4 h-4 inline-block mr-1 text-amber-500" />
                    ログインするとクーポンを使用できます
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                💡 お支払いは当日、店舗でお願いします。現金またはクレジットカードがご利用いただけます。
              </p>
            </CardContent>
          </Card>
        )}

        {/* ゲスト情報（非ログイン時） */}
        {!user && !existingMemberId && !showPinAuth && (
          <Card className="mb-6">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">お名前を入力</h3>
                <Button
                  variant="link"
                  size="sm"
                  className="text-purple-600 hover:text-purple-700 p-0 h-auto"
                  onClick={() => navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)}
                >
                  ログインして参加 →
                </Button>
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">お名前 *</Label>
                <Input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="山田 太郎"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">メールアドレス *</Label>
                <Input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="example@example.com"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  再訪問時の認証と予約確定のご連絡に使用します
                </p>
              </div>
              
              {/* 既に参加済みの方向け */}
              <div className="border-t pt-3">
                <Button
                  variant="link"
                  size="sm"
                  className="text-gray-600 hover:text-gray-800 p-0 h-auto text-xs"
                  onClick={() => openSheet('pin')}
                >
                  既に参加済みの方はこちら（PIN認証）
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* PIN認証フォーム */}
        {!user && !existingMemberId && showPinAuth && (
          <Card className="mb-6 border-purple-200">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">PINで認証</h3>
                <Button
                  variant="link"
                  size="sm"
                  className="text-gray-500 hover:text-gray-700 p-0 h-auto text-xs"
                  onClick={() => closeSheet()}
                >
                  新規参加に戻る
                </Button>
              </div>
              
              <p className="text-sm text-muted-foreground">
                以前参加登録した際のメールアドレスとPINを入力してください
              </p>
              
              {pinError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-2 rounded">
                  {pinError}
                </div>
              )}
              
              <div>
                <Label className="text-sm font-medium mb-1.5 block">メールアドレス</Label>
                <Input
                  type="email"
                  value={pinEmail}
                  onChange={(e) => setPinEmail(e.target.value)}
                  placeholder="example@example.com"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">PIN（4桁）</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="1234"
                  className="text-sm text-center text-xl tracking-widest font-mono"
                />
              </div>
              <Button
                onClick={handlePinAuth}
                className="w-full bg-purple-600 hover:bg-purple-700"
                disabled={!pinEmail || pinCode.length !== 4}
              >
                認証する
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ログイン中のユーザー情報 */}
        {user && !existingMemberId && (
          <Card className="mb-6 border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <p className="text-sm text-blue-800">
                <span className="font-medium">{user.email}</span> としてログイン中
              </p>
            </CardContent>
          </Card>
        )}

        {/* アンケート or キャラクター選択（配役方法選択済み・日程確定後） */}
        {isScheduleConfirmedUi && existingMemberId && group.scenario_master_id && !needsCharAssignmentChoice && (() => {
          const hasCharacters = scenarioCharacters.length > 0
          const method = charAssignmentMethod

          if (!hasCharacters || method === 'survey') {
            return (
              <SurveyResponseForm
                groupId={group.id}
                memberId={existingMemberId}
                performanceDate={group.candidate_dates?.find(cd => cd.order_num === 1)?.date}
                characters={(group as any).scenario_characters || []}
              />
            )
          }

          if (method === 'self') {
            return null
          }

          return null
        })()}

        {/* 送信ボタン（新規参加時のみ表示） */}
        {!existingMemberId && (
          <>
            {isGroupFull && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm text-center mb-2">
                参加人数が上限（{inviteMemberCap}名）に達しています
              </div>
            )}
            <Button
              onClick={() => handleSubmit()}
              disabled={actionLoading || isGroupFull}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  送信中...
                </>
              ) : isGroupFull ? (
                '参加人数上限に達しています'
              ) : (
                '参加する'
              )}
            </Button>
          </>
        )}

        {/* 退出ボタン（参加済みメンバー用、主催者以外） */}
        {(existingMemberId || (user && group?.members?.some(m => m.user_id === user.id && !m.is_organizer))) && (
          <Button
            variant="outline"
            onClick={async () => {
              // eslint-disable-next-line no-alert, no-restricted-globals
              if (!confirm('本当にこのグループから退出しますか？')) return
              try {
                if (existingMemberId) {
                  // RPC経由で削除（RLSを回避）
                  const { error: deleteError } = await supabase.rpc('delete_guest_member', {
                    p_member_id: existingMemberId,
                    p_invite_code: code ?? null,
                  })
                  if (deleteError) throw deleteError
                  toast.success('グループから退出しました')
                  setExistingMemberId(null)
                  clearGuestSession()
                  refetch()
                } else if (user && group) {
                  await leaveGroup(group.id)
                  toast.success('グループから退出しました')
                  navigate('/mypage')
                }
              } catch (err) {
                logger.error('Failed to leave group', err)
                toast.error('退出に失敗しました')
              }
            }}
            disabled={actionLoading}
            className="w-full mt-2 text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
          >
            <LogOut className="w-4 h-4 mr-2" />
            このグループから退出する
          </Button>
        )}

      </div>
    </div>
  )
}

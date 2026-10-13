import { ConfirmedGroupSchedule } from './ConfirmedGroupSchedule'
import { privateGroupMemberAction } from '@/lib/privateGroupGuestSession'
// 貸切グループ 招待リンクを開いただけの人の表示（参加フロー・参加費・PIN認証・ゲスト情報 等）
// 参加中の人はグループページ刷新 段階 1 の GroupMemberScreen（groupPage/）で表示する
import React, { useState } from 'react'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Users, AlertCircle, Loader2, Ticket, CreditCard, LogOut, ArrowLeft } from 'lucide-react'
import { GuestJoinPanel, type GuestJoinMode } from './GuestJoinPanel'
import { InvitePreviewStatus } from './InvitePreviewStatus'
import { buildInvitePreview } from '../invitePreviewModel'
import { privateGroupProgress } from '@/components/patterns/privateGroup/privateGroupScheduleRules'
import { ConfirmDialog } from '@/components/patterns/modal'
import { formatJstDateJa } from '@/utils/jstDate'
import type { NavigateFunction } from 'react-router-dom'
import type { usePrivateGroupByInviteCode } from '@/hooks/usePrivateGroupByInviteCode'
import type { usePrivateGroup } from '@/hooks/usePrivateGroup'
import type { useAuth } from '@/contexts/AuthContext'
import { leaveStoreNotice, privateBookingPhase } from '@/pages/MyPage/components/PrivateBookingCards/privateBookingMenu'
import { ScenarioAboutSection } from '../groupPage/overview/ScenarioAboutSection'
import { useGroupScenarioInfo } from '../groupPage/useGroupScenarioInfo'
import { scenarioPageUrl } from '../groupPage/overviewModel'
import { loginUrlWithIntent } from '@/lib/authReturn'

type GroupType = NonNullable<ReturnType<typeof usePrivateGroupByInviteCode>['group']>
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
  organizerName: string
  memberCount: number
  inviteMemberCap: number | null
  isGroupFull: boolean
  user: ReturnType<typeof useAuth>['user']
  code: string | null
  existingMemberId: string | null
  isScheduleConfirmedUi: boolean
  actionLoading: boolean
  error: string | null
  /** ゲスト（未ログイン・未参加）の参加欄: はじめて／再訪／PIN */
  guestMode: GuestJoinMode
  isCustomHoliday?: (date: string) => boolean
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
  setExistingMemberId: React.Dispatch<React.SetStateAction<string | null>>
  setGuestName: React.Dispatch<React.SetStateAction<string>>
  setGuestEmail: React.Dispatch<React.SetStateAction<string>>
  setPinEmail: React.Dispatch<React.SetStateAction<string>>
  setPinCode: React.Dispatch<React.SetStateAction<string>>
  setSelectedCouponId: React.Dispatch<React.SetStateAction<string | null>>
  navigate: NavigateFunction
  refetch: ReturnType<typeof usePrivateGroupByInviteCode>['refetch']
  leaveGroup: ReturnType<typeof usePrivateGroup>['leaveGroup']
  openSheet: (name: string) => void
  closeSheet: () => void
  clearGuestSession: () => void
  handlePinAuth: () => Promise<void>
  handleSubmit: (options?: { skipSuccessPage?: boolean }) => Promise<void>
}

export function GroupInviteView({
  group, scenario, organizerName, memberCount, inviteMemberCap, isGroupFull,
  user, code, existingMemberId, isScheduleConfirmedUi, actionLoading, error, guestMode, isCustomHoliday,
  guestName, guestEmail, pinEmail, pinCode, pinError, couponLoading, coupons, selectedCoupon, selectedCouponId,
  perPersonPrice, discountAmount, finalAmount,
  setExistingMemberId, setGuestName, setGuestEmail, setPinEmail, setPinCode, setSelectedCouponId,
  navigate, refetch, leaveGroup, openSheet, closeSheet, clearGuestSession,
  handlePinAuth, handleSubmit,
}: GroupInviteViewProps) {
  // ログイン・新規登録画面に「何に参加しようとしているか」を出す（点検 25）
  const inviteIntentLabel = `「${scenario?.title || '貸切'}」の貸切グループへの参加`
  // 確認ダイアログ（グループから退出）
  const [showLeaveGroupConfirm, setShowLeaveGroupConfirm] = useState(false)
  // 作品の公開情報（作品ページと同じ読み取り。招待リンクだけの人・未ログインも読める）
  const { data: scenarioData } = useGroupScenarioInfo(group.scenario_master_id, group.organization_id)
  // 参加前に見せる「このグループのいま」（状態・候補日・1 人あたりの料金。点検 51）
  const preview = buildInvitePreview({
    progress: privateGroupProgress(group, null),
    candidates: group.candidate_dates ?? [],
    savedPerPerson: group.per_person_price,
    fee: scenarioData?.scenario?.participationFee,
    costs: scenarioData?.scenario?.participationCosts,
    isCustomHoliday,
  })
  const goLogin = () => navigate(loginUrlWithIntent('login', location.pathname, inviteIntentLabel))
  const goSignup = () => navigate(loginUrlWithIntent('signup', location.pathname, inviteIntentLabel))
  const isGuestJoin = !user && !existingMemberId

  const handleConfirmLeaveGroup = async () => {
    try {
      if (existingMemberId) {
        // RPC経由で削除（RLSを回避）
        const { error: deleteError } = await privateGroupMemberAction(group.id, existingMemberId, 'leave')
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
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <NavigationBar currentPage="/" />

      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* 参加前（preview）は下の「このグループのいま」に状態・候補日を出すので、ここでは出さない（点検 51） */}
        {group.confirmed_performance_access !== 'preview' && <ConfirmedGroupSchedule group={group} />}
        {/* 戻るボタン（未ログインのゲストにはマイページが無いので出さない） */}
        {user && (
          <button
            onClick={() => navigate('/mypage')}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            マイページに戻る
          </button>
        )}

        <Card className="border-purple-200 bg-purple-50/50 mb-6">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-purple-800">
              <span className="font-medium">{organizerName}</span>さんからの貸切お誘い
            </p>
            {isGuestJoin && guestMode === 'new' && (
              <p className="mt-1 text-xs text-purple-700" data-testid="invite-guest-lead">アカウント登録なしで、お名前だけで参加できます</p>
            )}
          </CardContent>
        </Card>

        {/* 作品について（短い版。参加前に何に参加するのかが分かるように。点検 51 番の一部） */}
        <div className="mb-6">
          <ScenarioAboutSection
            compact
            title={scenario?.title || 'シナリオ'}
            imageUrl={scenario?.key_visual_url ?? null}
            playerRange={{
              min: scenario?.effective_player_count_min ?? scenario?.player_count_min ?? null,
              max: scenario?.effective_player_count_max ?? scenario?.player_count_max ?? null,
            }}
            info={scenarioData?.scenario ?? null}
            scenarioUrl={scenarioPageUrl(scenarioData?.orgSlug, scenarioData?.scenario?.slug ?? scenario?.slug, group.scenario_master_id ?? scenario?.id)}
            extra={(
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {group.name && <span>{group.name}</span>}
                <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden="true" />参加 {memberCount}/{inviteMemberCap ?? '?'}名</span>
                <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">貸切リクエスト</Badge>
              </div>
            )}
          />
        </div>

        <div className="mb-6">
          <InvitePreviewStatus preview={preview} />
        </div>

        {error && (
          <Card className="mb-4 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        {/* ゲストの参加欄（名前だけで参加・PIN で入る。点検 52〜54・56） */}
        {isGuestJoin && (
          <GuestJoinPanel
            mode={guestMode}
            code={code}
            guestName={guestName}
            guestEmail={guestEmail}
            setGuestName={setGuestName}
            setGuestEmail={setGuestEmail}
            pinEmail={pinEmail}
            pinCode={pinCode}
            pinError={pinError}
            setPinEmail={setPinEmail}
            setPinCode={setPinCode}
            actionLoading={actionLoading}
            isGroupFull={isGroupFull}
            inviteMemberCap={inviteMemberCap}
            onSubmit={() => void handleSubmit()}
            onPinAuth={() => void handlePinAuth()}
            onOpenPin={() => openSheet('pin')}
            onClosePin={closeSheet}
            onLogin={goLogin}
            onSignup={goSignup}
          />
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
                
                {selectedCouponId && discountAmount === 0 && <p className="text-sm text-muted-foreground">選択中のクーポンは、日程確定後に利用条件を確認して割引を適用します。</p>}
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
                お支払いは当日、店舗でお願いします。現金またはクレジットカードがご利用いただけます。
              </p>
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

        {/* 送信ボタン（ログイン中の新規参加のみ。ゲストは参加欄の中に置く） */}
        {user && !existingMemberId && (
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
            onClick={() => setShowLeaveGroupConfirm(true)}
            disabled={actionLoading}
            className="w-full mt-2 text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
          >
            <LogOut className="w-4 h-4 mr-2" />
            このグループから退出する
          </Button>
        )}

      </div>

      <ConfirmDialog
        open={showLeaveGroupConfirm}
        onOpenChange={setShowLeaveGroupConfirm}
        title="このグループから退出しますか？"
        message={`本当にこのグループから退出しますか？${leaveStoreNotice(privateBookingPhase(group.status, isScheduleConfirmedUi ? 'confirmed' : null))}`}
        confirmLabel="退出する"
        variant="destructive"
        onConfirm={handleConfirmLeaveGroup}
      />
    </div>
  )
}

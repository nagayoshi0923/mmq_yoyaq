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
import type { DateResponse } from '@/types/privateGroup'
import { formatJstMonthDay } from '@/utils/jstDate'
import { candidateTimeSlotFromDb } from '@/lib/timeSlot'
import { PRIVATE_PURPLE } from '@/components/renewal/fonts'
import { durationLabel, playersLabel } from '@/components/renewal/labels'
import { cn } from '@/lib/utils'
import { formatDateJST } from '@/utils/dateUtils'

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
  isCustomHoliday?: ((date: string) => boolean) | null  // null = 独自休日を読み込み中・読み込めなかった（平日の候補の料金は出さない）
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
  /** 候補日ごとの回答（参加と同時に送る） */
  responses: Record<string, DateResponse | null>
  setResponses: React.Dispatch<React.SetStateAction<Record<string, DateResponse | null>>>
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
  perPersonPrice, discountAmount, finalAmount, responses, setResponses,
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

  // 見本の並び: お誘い → 作品 → ①〜④ → 1. 行ける日に○ → 2. お名前 → 参加費と支払い方法 → 「この内容で答える」
  const progress = privateGroupProgress(group, null)
  const stepIndex = progress === 'confirmed' ? 2 : progress === 'requested' ? 1 : 0
  const answerableDates = [...(group.candidate_dates ?? [])]
    .filter(c => c.status !== 'rejected' && c.date.slice(0, 10) >= formatDateJST(new Date())) // 過ぎた候補日は答えさせない
    .sort((a, b) => (a.date === b.date ? (a.start_time ?? '').localeCompare(b.start_time ?? '') : a.date.localeCompare(b.date)))
  const isJoining = !existingMemberId && (isGuestJoin ? guestMode !== 'pin' : !!user)
  const canAnswerDates = progress === 'gathering' && answerableDates.length > 0 && isJoining
  const playerMin = scenario?.effective_player_count_min ?? scenario?.player_count_min ?? null
  const playerMax = scenario?.effective_player_count_max ?? scenario?.player_count_max ?? null
  const scenarioUrl = scenarioPageUrl(scenarioData?.orgSlug, scenarioData?.scenario?.slug ?? scenario?.slug, group.scenario_master_id ?? scenario?.id)

  const feeSection = (perPersonPrice > 0 || preview.perPerson) ? (
    <section className="border border-gray-200 bg-white p-4" data-testid="invite-fee">
      <h2 className="text-lg font-bold">参加費と支払い方法</h2>
      <dl className="mt-2 text-sm">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 py-3">
          <dt className="text-muted-foreground">参加費</dt>
          <dd className="font-bold tabular-nums">{perPersonPrice > 0 ? `ひとり${perPersonPrice.toLocaleString()}円` : `ひとり${(preview.perPerson ?? '').replace(/¥/g, '')}円`}</dd>
        </div>
        {selectedCoupon && (
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 py-3 text-green-700">
            <dt className="flex items-center gap-1"><Ticket className="w-4 h-4" aria-hidden="true" />クーポン割引</dt>
            <dd className="tabular-nums">-{discountAmount.toLocaleString()}円</dd>
          </div>
        )}
        {selectedCoupon && (
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 py-3">
            <dt className="font-bold">お支払い金額</dt>
            <dd className="text-lg font-bold tabular-nums">{finalAmount.toLocaleString()}円</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 py-3">
          <dt className="text-muted-foreground">支払い方法</dt>
          <dd className="text-right"><span className="font-bold">当日、店舗で</span><span className="block text-xs text-muted-foreground">現金・クレジットカード</span></dd>
        </div>
      </dl>
      {selectedCouponId && discountAmount === 0 && <p className="mt-2 text-xs text-muted-foreground">選択中のクーポンは、日程確定後に利用条件を確認して割引を適用します。</p>}
      {preview.priceNote && perPersonPrice <= 0 && <p className="mt-2 text-xs text-muted-foreground">{preview.priceNote}税込。</p>}
      {user && perPersonPrice > 0 && (
        <div className="mt-3">
          <Label className="mb-2 flex items-center gap-1 text-sm font-bold"><Ticket className="w-4 h-4 text-amber-500" aria-hidden="true" />クーポンを使う</Label>
          {couponLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : coupons.length > 0 ? (
            <Select value={selectedCouponId || 'none'} onValueChange={(value) => setSelectedCouponId(value === 'none' ? null : value)}>
              <SelectTrigger><SelectValue placeholder="クーポンを選択" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">クーポンを使用しない</SelectItem>
                {coupons.map((coupon) => (
                  <SelectItem key={coupon.id} value={coupon.id}>
                    {coupon.name} - {coupon.discount_amount.toLocaleString()}円引き
                    {coupon.expires_at && <span className="ml-1 text-xs text-muted-foreground">({formatJstDateJa(coupon.expires_at)}まで)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">利用可能なクーポンがありません</p>
          )}
        </div>
      )}
      {!user && perPersonPrice > 0 && <p className="mt-2 text-xs text-muted-foreground">ログインするとクーポンを使えます。</p>}
    </section>
  ) : null

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <NavigationBar currentPage="/" />

      <div className="mx-auto w-full max-w-lg space-y-3 bg-gray-50 px-3 py-4" data-testid="group-invite">
        {/* 参加前（preview）は下の「このグループのいま」に状態・候補日を出すので、ここでは出さない（点検 51） */}
        {group.confirmed_performance_access !== 'preview' && <ConfirmedGroupSchedule group={group} />}
        {/* 戻るボタン（未ログインのゲストにはマイページが無いので出さない） */}
        {user && (
          <button type="button" onClick={() => navigate('/mypage')} className="flex items-center gap-1 text-sm text-gray-600">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />マイページに戻る
          </button>
        )}

        {/* 見本: 「はなこさんから貸切のお誘いです。行ける日に○をつけて送ってください。」 */}
        <div className="border border-violet-200 bg-violet-50 px-4 py-4 text-sm leading-relaxed" data-testid="invite-lead">
          <span className="font-bold">{organizerName}</span>さんから貸切のお誘いです。
          {canAnswerDates ? '行ける日に○をつけて送ってください。' : preview.statusText}
        </div>

        {/* 作品（黒地の帯） */}
        <a
          href={scenarioUrl ?? undefined}
          className="flex gap-4 bg-[#221a33] p-4 text-white"
          data-testid="invite-scenario"
        >
          <div className="h-24 w-[72px] shrink-0 overflow-hidden bg-white/10">
            {scenario?.key_visual_url && <img src={scenario.key_visual_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
          </div>
          <div className="min-w-0 py-1">
            <p className="truncate text-xs text-white/70">{organizerName}さんの貸切{group.name ? `「${group.name}」` : ''}</p>
            <p className="mt-1 text-lg font-bold leading-snug">{scenario?.title || 'シナリオ'}</p>
            <p className="mt-1 text-xs text-white/70">
              {[playerMin != null && playerMax != null ? playersLabel(playerMin, playerMax) : null, durationLabel(scenarioData?.scenario?.duration ?? null), preview.perPerson ? `ひとり${preview.perPerson.replace(/¥/g, '')}円` : null].filter(Boolean).join('・')}
            </p>
            <p className="mt-1 text-2xs text-white/60">参加 {memberCount}/{inviteMemberCap ?? '?'}名</p>
          </div>
        </a>

        <InviteSteps current={stepIndex} />

        {error && (
          <div role="alert" className="flex items-center gap-2 border-2 border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {canAnswerDates
          ? <InviteDateAnswers title="1. 行ける日に○をつける" candidates={answerableDates} responses={responses} setResponses={setResponses} />
          : <InvitePreviewStatus preview={preview} />}

        {/* ゲストの参加欄（お名前とメールアドレスで参加・PIN で入る。点検 52〜54・56） */}
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
            heading={canAnswerDates ? '2. お名前とメールアドレス' : 'お名前とメールアドレス'}
            submitLabel={canAnswerDates ? 'この内容で答える' : '参加する'}
            beforeSubmit={feeSection}
            onSubmit={() => void handleSubmit()}
            onPinAuth={() => void handlePinAuth()}
            onOpenPin={() => openSheet('pin')}
            onClosePin={closeSheet}
            onLogin={goLogin}
            onSignup={goSignup}
          />
        )}

        {/* ログイン中の新規参加（ゲストは参加欄の中に置く） */}
        {user && !existingMemberId && (
          <>
            {feeSection}
            <p className="border border-gray-200 bg-white px-4 py-3 text-sm"><span className="font-bold">{user.email}</span> としてログイン中</p>
            {isGroupFull && (
              <div className="border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-800">
                参加人数が上限（{inviteMemberCap}名）に達しています
              </div>
            )}
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={actionLoading || isGroupFull}
              className="flex h-12 w-full items-center justify-center text-base font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: PRIVATE_PURPLE }}
            >
              {actionLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />送信中...</> : isGroupFull ? '参加人数上限に達しています' : canAnswerDates ? 'この内容で答える' : '参加する'}
            </button>
          </>
        )}

        {/* 作品について（あらすじ・キャラクターなど。お誘いの下に置く） */}
        <ScenarioAboutSection
          compact
          title={scenario?.title || 'シナリオ'}
          imageUrl={scenario?.key_visual_url ?? null}
          playerRange={{ min: playerMin, max: playerMax }}
          info={scenarioData?.scenario ?? null}
          scenarioUrl={scenarioUrl}
          extra={(
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden="true" />参加 {memberCount}/{inviteMemberCap ?? '?'}名</span>
              <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">貸切リクエスト</Badge>
            </div>
          )}
        />

        {/* 退出ボタン（参加済みメンバー用、主催者以外） */}
        {(existingMemberId || (user && group?.members?.some(m => m.user_id === user.id && !m.is_organizer))) && (
          <Button
            variant="outline"
            onClick={() => setShowLeaveGroupConfirm(true)}
            disabled={actionLoading}
            className="w-full rounded-none bg-white text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
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

const STEPS = ['日程に答える', '日程が決まる', '参加費を払う', '当日あそぶ'] as const

/** 見本の ①日程に答える ②日程が決まる ③参加費を払う ④当日あそぶ */
function InviteSteps({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-4 border border-gray-200 bg-white px-2 py-3" aria-label="貸切の流れ" data-testid="invite-steps">
      {STEPS.map((label, i) => {
        const on = i === current
        return (
          <li key={label} className="flex flex-col items-center gap-1 text-center" aria-current={on ? 'step' : undefined}>
            <span
              className={cn('flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold', on ? 'text-white' : 'border-gray-300 text-gray-400')}
              style={on ? { backgroundColor: PRIVATE_PURPLE, borderColor: PRIVATE_PURPLE } : undefined}
            >{i + 1}</span>
            <span className={cn('text-2xs', on ? 'font-bold text-gray-900' : 'text-muted-foreground')}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

const ANSWERS: Array<{ value: DateResponse; mark: string; label: string }> = [
  { value: 'ok', mark: '○', label: '行ける' },
  { value: 'maybe', mark: '△', label: 'たぶん' },
  { value: 'ng', mark: '×', label: '行けない' },
]

/** 1. 行ける日に○をつける（参加と同時に送る。あとからグループページでも直せる） */
function InviteDateAnswers({ title, candidates, responses, setResponses }: {
  title: string
  candidates: ReadonlyArray<{ id: string; date: string; time_slot: string; start_time: string }>
  responses: Record<string, DateResponse | null>
  setResponses: React.Dispatch<React.SetStateAction<Record<string, DateResponse | null>>>
}) {
  return (
    <section className="border border-gray-200 bg-white p-4" data-testid="invite-date-answers">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">○行ける △たぶん ×行けない（あとから直せます）</p>
      <ul className="mt-2">
        {candidates.map((c) => {
          const label = `${formatJstMonthDay(c.date, true)} ${candidateTimeSlotFromDb(c.time_slot)} ${(c.start_time ?? '').slice(0, 5)}〜`
          return (
            <li key={c.id} className="flex items-center justify-between gap-2 border-b border-gray-200 py-3">
              <span className="min-w-0 text-sm font-bold tabular-nums">{label}</span>
              <span className="flex shrink-0" role="group" aria-label={`${label}の都合`}>
                {ANSWERS.map((a) => {
                  const on = responses[c.id] === a.value
                  return (
                    <button
                      key={a.value}
                      type="button"
                      aria-pressed={on}
                      aria-label={a.label}
                      onClick={() => setResponses((prev) => ({ ...prev, [c.id]: on ? null : a.value }))}
                      className={cn('-ml-px h-10 w-11 border text-lg first:ml-0', on ? 'relative z-10 text-white' : 'border-gray-300 bg-white text-gray-500')}
                      style={on ? { backgroundColor: PRIVATE_PURPLE, borderColor: PRIVATE_PURPLE } : undefined}
                    >{a.mark}</button>
                  )
                })}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import { reconcilePrivateBookingCandidates } from '@/lib/reconcilePrivateBookingCandidates'
import { candidateFeesIfKnown } from '../ScenarioDetailPage/utils/pricingUtils'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, ArrowLeft, AlertCircle, Plus, X, Loader2, Pencil } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCustomerData } from '../BookingConfirmation/hooks/useCustomerData'
import { usePrivateBookingForm } from './hooks/usePrivateBookingForm'
import { usePrivateBookingSubmit } from './hooks/usePrivateBookingSubmit'
import { usePrivateGroup } from '@/hooks/usePrivateGroup'
import { logger } from '@/utils/logger'
import { formatDate } from './utils/privateBookingFormatters'
import { BookingNotice } from '../ScenarioDetailPage/components/BookingNotice'
import { PrivateBookingRequestSuccess } from './components/PrivateBookingRequestSuccess'
import { ChangeStoresSheet, type UnavailableCandidate } from './components/ChangeStoresSheet'
import { privateCancelNoticeText } from '@/lib/privateCancelNotice'
import { knownCustomHoliday, useCustomHolidays } from '@/hooks/useCustomHolidays'
import { usePrivateBookingDeadlineDays } from '@/hooks/usePrivateBookingDeadlineDays'
import { isStorePlayableForScenario } from '@/lib/scenarioStoreHint'
import { privateBookingSlotReadApi } from '@/lib/api/scheduleHookReadApi'
import { useCandidateSlotAvailability } from '@/hooks/useCandidateSlotAvailability'
import {
  availableSlotsForDate,
  buildCandidateSlotAvailability,
  fetchCandidateSlotAvailability,
  type CandidateSlotAvailabilityTarget,
} from '@/lib/candidateSlotAvailability'
import { toast } from 'sonner'
import type { PrivateBookingRequestProps, TimeSlot } from './types'
import {
  getPrivateBookingCandidateBlockedState,
  type PrivateBookingBlockedSlotRow,
} from '@/lib/privateBookingBlockedSlotAvailability'
import { resolveOrgIdFromPageContext } from '@/lib/organization'
import type { RpcGetPublicPrivateBookingAvailabilityParams } from '@/lib/rpcTypes'
import { toJstYmd } from '@/utils/jstDate'
import { privateBookingErrorText } from '@/lib/privateBookingErrors'
import { buildAuthUrl, currentPathWithSearch } from '@/lib/authReturn'
import { PRIVATE_BOOKING_HORIZON_CHECKING_TEXT, privateBookingHorizonMaxYmd, privateBookingTooFarText, usePrivateBookingHorizonDays } from '@/lib/privateBookingHorizon'
import { PrivateBookingHorizonNotice } from '@/components/private-booking/PrivateBookingHorizonNotice'

const MAX_TIME_SLOTS = 6

/** YYYY-MM-DD の暦日加算（UTC 部品で計算するためローカルTZに依存しない） */
function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

export function PrivateBookingRequest({
  scenarioTitle,
  scenarioId,
  participationFee,
  participationCosts,
  maxParticipants,
  selectedTimeSlots: initialTimeSlots,
  selectedStoreIds: initialStoreIds,
  stores,
  scenarioAvailableStores,
  organizationSlug,
  groupId,
  onBack,
  onComplete,
  onStoreIdsChange,
}: PrivateBookingRequestProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { createGroup, loading: groupLoading } = usePrivateGroup()
  
  const holidays = useCustomHolidays({ organizationSlug })
  // 料金用。独自休日を読み込み中・読み込めなかったときは null（平日の候補の料金を出さない）
  const priceHoliday = knownCustomHoliday(holidays)

  // 候補の開始・終了時刻は DB の空き判定（private_booking_candidate_slot_availability）が返した値をそのまま使う。
  // 画面側で作品の公演時間から終了を計算し直すと、店舗の特別営業日などが反映されず保存時に拒否される（監査 R1）。
  
  // グループID（既存または送信時に作成）
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(groupId || null)
  // 作成されたグループの招待コード
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null)
  
  // 編集可能な候補日時
  const [editableTimeSlots, setEditableTimeSlots] = useState(initialTimeSlots)
  const knownFees = useMemo(() => candidateFeesIfKnown(
    participationFee, participationCosts, editableTimeSlots, priceHoliday,
  ), [participationFee, participationCosts, editableTimeSlots, priceHoliday])
  const feeUnknownText = knownFees ? null : holidays.error ? '確認できません' : '確認中'
  const candidateFees = useMemo(() => knownFees ?? [], [knownFees])
  const minFee = candidateFees.length ? Math.min(...candidateFees) : participationFee
  const maxFee = candidateFees.length ? Math.max(...candidateFees) : participationFee


  // 親コンポーネントが非同期で selectedTimeSlots を更新した場合に同期
  // （PrivateBookingRequestPage 経由のフローで初回マウント時に空→非同期で充填されるケース）
  useEffect(() => {
    if (initialTimeSlots.length === 0) return
    setEditableTimeSlots((prev) => (prev.length > 0 ? prev : initialTimeSlots))
  }, [initialTimeSlots])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newSlotLabel, setNewSlotLabel] = useState('')

  // 表示する全有効店舗（オフィス除外）
  const displayStores = useMemo(() => {
    return stores.filter((s) => 
      s.ownership_type !== 'office' && s.status === 'active'
    )
  }, [stores])

  // この作品の貸切を受け付ける店舗（DB の判定と同じ。上演店舗の指定が無ければ臨時会場を除く）
  const playableStores = useMemo(
    () => displayStores.filter((s) => isStorePlayableForScenario(s, scenarioAvailableStores)),
    [displayStores, scenarioAvailableStores]
  )

  // 希望店舗（前ページで選んだ店舗。確認画面の「変更」で選び直せる。QW-20261022-013）。
  // 表示・空き判定・送信はすべてこの 1 つから作る（表示と送信内容をずらさない）
  const [changedStoreIds, setChangedStoreIds] = useState<string[] | null>(null)
  const [storeSheetOpen, setStoreSheetOpen] = useState(false)
  const selectedStoreIds = useMemo(() => {
    const filtered = (changedStoreIds ?? initialStoreIds).filter(id => playableStores.some((s) => s.id === id))
    return filtered.length > 0 ? filtered : []
  }, [changedStoreIds, initialStoreIds, playableStores])

  // 貸切予約の受付締切（公演日の何日前まで申込可能か）。設定 > 予約設定の値
  const deadlineDays = usePrivateBookingDeadlineDays({ organizationSlug, scenarioId })

  const { data: slotOrganizationId = null } = useQuery({
    queryKey: ['private-booking-request', 'organization-id', organizationSlug],
    queryFn: async () => (await resolveOrgIdFromPageContext()) ?? null,
  })
  // 申し込める範囲（今日から N 日先まで。MMQ 既定 180 → 組織 → 作品の設定。I21）
  // 読めるまで（読めなかったときも）は days が null。候補の追加と送信を止める（既定の 180 日で進めない。Codex 点検 不具合 5）
  const horizon = usePrivateBookingHorizonDays({ organizationId: slotOrganizationId, scenarioId })
  const horizonDays = horizon.days

  // 追加可能な日付の範囲（受付締切日数後から、申し込める範囲の最後の日まで）
  const dateRange = useMemo(() => {
    const todayYmd = toJstYmd(new Date())
    const minDate = addCalendarDaysYmd(todayYmd, deadlineDays)
    const horizonMax = privateBookingHorizonMaxYmd(horizonDays)
    const maxDate = horizonMax >= minDate ? horizonMax : minDate
    return { minDate, maxDate }
  }, [deadlineDays, horizonDays])

  /** 候補追加・プルダウン用（HP貸切カレンダー・グループ候補追加と同じ営業時間マージ） */
  const storeIdsForSlotResolution = useMemo(() => {
    if (selectedStoreIds.length > 0) return selectedStoreIds
    return playableStores.map((s: { id: string }) => s.id)
  }, [playableStores, selectedStoreIds])

  const storeIdsKey = storeIdsForSlotResolution.join(',')

  // 候補日時の空き判定は DB（private_booking_candidate_slot_availability）だけで行う。
  // 作品ページの申込フォーム・グループの候補日追加と同じ判定（仕様の正本: docs/product-spec/貸切受付ルール.md）。
  const availabilityTarget = useMemo<CandidateSlotAvailabilityTarget | null>(
    () => slotOrganizationId && scenarioId && storeIdsKey
      ? { kind: 'scenario', organizationId: slotOrganizationId, scenarioId, storeIds: storeIdsKey.split(',') }
      : null,
    [slotOrganizationId, scenarioId, storeIdsKey]
  )

  const {
    data: blockedSlotRows = [],
    refetch: refetchBlockedSlotRows,
  } = useQuery({
    queryKey: ['private-booking-request', 'blocked-slots', storeIdsKey, organizationSlug, scenarioId, dateRange.minDate, dateRange.maxDate],
    enabled: storeIdsForSlotResolution.length > 0,
    queryFn: async () => {
      const organizationId = await resolveOrgIdFromPageContext()
      if (!organizationId) return [] as PrivateBookingBlockedSlotRow[]
      const params: RpcGetPublicPrivateBookingAvailabilityParams = {
        p_organization_id: organizationId,
        p_store_ids: storeIdsForSlotResolution,
        p_start_date: dateRange.minDate,
        p_end_date: dateRange.maxDate,
      }
      const { data, error } = await privateBookingSlotReadApi.getPublicAvailability(params)
      if (error) {
        logger.error('貸切確認: 募集停止枠取得エラー', error)
        throw error
      }
      return (data || []) as PrivateBookingBlockedSlotRow[]
    },
  })

  const getBlockedState = useCallback(
    (date: string, timeSlot: string, rows = blockedSlotRows) =>
      getPrivateBookingCandidateBlockedState(
        { date, timeSlot },
        storeIdsForSlotResolution,
        rows
      ),
    [blockedSlotRows, storeIdsForSlotResolution]
  )

  const pickerDate = newDate || dateRange.minDate
  const pickerDates = useMemo(() => (pickerDate ? [pickerDate] : []), [pickerDate])
  const { availability: pickerAvailability } = useCandidateSlotAvailability(availabilityTarget, pickerDates)
  const candidateSlotsForPicker = useMemo(
    () => availableSlotsForDate(pickerAvailability, pickerDate),
    [pickerAvailability, pickerDate]
  )

  /** 送信前の再検証用: 候補の日付ごとに DB の最新の空き状況を読む（1 回の問い合わせは 62 日までなので日付ごと） */
  const loadLatestAvailableSlots = useCallback(async (dates: string[]) => {
    if (!availabilityTarget) throw new Error('空き状況を確認できません。時間をおいて開き直してください。')
    const unique = [...new Set(dates)]
    const rows = (await Promise.all(unique.map((d) => fetchCandidateSlotAvailability(availabilityTarget, d, d)))).flat()
    return buildCandidateSlotAvailability(rows)
  }, [availabilityTarget])

  // 確認画面に並べる候補の時刻と「選べるか」は、DB の最新の応答から作る（監査 R1）。
  // 前ページや URL から来た時刻（DB で決まらなかったときの仮の時刻を含む）をそのまま出さず、
  // 選べる候補は DB の開始・終了に合わせ、選べない候補は理由を出して送信させない。
  const candidateDatesKey = useMemo(
    () => [...new Set(editableTimeSlots.map((candidate) => candidate.date))].sort().join(','),
    [editableTimeSlots]
  )
  const { data: candidateAvailability, refetch: refetchCandidateAvailability } = useQuery({
    queryKey: ['private-booking-request', 'candidate-availability', slotOrganizationId, scenarioId, storeIdsKey, candidateDatesKey],
    enabled: !!availabilityTarget && candidateDatesKey.length > 0,
    queryFn: () => loadLatestAvailableSlots(candidateDatesKey.split(',')),
  })
  const [candidateTimesUpdated, setCandidateTimesUpdated] = useState(false)
  useEffect(() => {
    if (!candidateAvailability) return
    const reconciled = reconcilePrivateBookingCandidates(editableTimeSlots, (candidate) =>
      availableSlotsForDate(candidateAvailability, candidate.date)
    )
    if (!reconciled.changed) return
    // 前ページで時刻が決まっていた（終了がある）候補の時刻が変わったときだけ知らせる。DB で決まらなかった仮の時刻を埋めるときは知らせない
    const moved = editableTimeSlots.some((candidate, index) => candidate.slot.endTime !== ''
      && (reconciled.updated[index].slot.startTime !== candidate.slot.startTime || reconciled.updated[index].slot.endTime !== candidate.slot.endTime))
    if (moved) setCandidateTimesUpdated(true)
    setEditableTimeSlots(reconciled.updated)
  }, [candidateAvailability, editableTimeSlots])
  /** 店舗を選び直したとき、いまの候補のうち選べなくなるもの（確認画面と同じ DB の空き判定。規則は変えない） */
  const checkCandidatesForStores = useCallback(async (storeIds: string[]): Promise<UnavailableCandidate[]> => {
    if (!slotOrganizationId || !scenarioId) throw new Error('空き状況を確認できません')
    const target: CandidateSlotAvailabilityTarget = { kind: 'scenario', organizationId: slotOrganizationId, scenarioId, storeIds }
    const dates = [...new Set(editableTimeSlots.map((c) => c.date))]
    const rows = (await Promise.all(dates.map((d) => fetchCandidateSlotAvailability(target, d, d)))).flat()
    const availability = buildCandidateSlotAvailability(rows)
    return editableTimeSlots
      .filter((c) => !availableSlotsForDate(availability, c.date).some((slot) => slot.label === c.slot.label))
      .map((c) => ({ date: c.date, label: c.slot.label, reason: availability.unavailableReasons[`${c.date}-${c.slot.label}`] || '選択できません' }))
  }, [slotOrganizationId, scenarioId, editableTimeSlots])

  const handleConfirmStores = (storeIds: string[]) => {
    setChangedStoreIds(storeIds)
    setError(null)
    onStoreIdsChange?.(storeIds)
  }

  /** DB の最新の応答で選べない候補の理由（読み込み前・選べる候補は null） */
  const candidateUnavailableReason = useCallback((candidate: { date: string; slot: TimeSlot }): string | null => {
    if (!candidateAvailability || !candidateDatesKey.split(',').includes(candidate.date)) return null
    if (availableSlotsForDate(candidateAvailability, candidate.date).some((slot) => slot.label === candidate.slot.label)) return null
    return candidateAvailability.unavailableReasons[`${candidate.date}-${candidate.slot.label}`] || '選択できません'
  }, [candidateAvailability, candidateDatesKey])

  const handleAddTimeSlot = () => {
    if (!newDate || !newSlotLabel) return
    if (newDate < dateRange.minDate) {
      toast.error(`候補日は本日より${deadlineDays}日後以降のみ選べます`)
      return
    }
    if (horizonDays === null) {
      toast.error(PRIVATE_BOOKING_HORIZON_CHECKING_TEXT)
      return
    }
    if (newDate > dateRange.maxDate) {
      toast.error(privateBookingTooFarText(horizonDays))
      return
    }
    const picked = newDate === pickerDate
      ? candidateSlotsForPicker.find((s) => s.label === newSlotLabel)
      : undefined
    if (!picked) {
      toast.error('この日・店舗の組み合わせでは、その時間帯を追加できません')
      return
    }
    if (getBlockedState(newDate, picked.label).allStoresBlocked) {
      toast.error(`${newDate} ${picked.label} は現在受付停止中です`)
      return
    }
    const slot: TimeSlot = {
      label: picked.label,
      startTime: picked.startTime,
      endTime: picked.endTime,
    }

    // 重複チェック
    const isDuplicate = editableTimeSlots.some(
      ts => ts.date === newDate && ts.slot.label === newSlotLabel
    )
    if (isDuplicate) return

    setEditableTimeSlots(prev => [...prev, { date: newDate, slot }])
    setNewDate('')
    setNewSlotLabel('')
    setShowAddForm(false)
  }

  const handleRemoveTimeSlot = (index: number) => {
    setEditableTimeSlots(prev => prev.filter((_, i) => i !== index))
  }
  
  // 予約サイトのベースパス
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : ''

  // フック
  const {
    customerName,
    setCustomerName,
    customerNickname,
    setCustomerNickname,
    customerEmail,
    setCustomerEmail,
    customerPhone,
    setCustomerPhone
  } = useCustomerData({ userId: user?.id, userEmail: user?.email })

  const {
    notes,
    setNotes,
    error,
    setError,
    validateForm
  } = usePrivateBookingForm()

  const { isSubmitting, success, confirmationEmailAccepted, handleSubmit } = usePrivateBookingSubmit({
    scenarioTitle,
    scenarioId,
    participationFee: candidateFees[0] ?? participationFee,
    maxParticipants,
    selectedTimeSlots: editableTimeSlots,
    selectedStoreIds,
    stores,
    userId: user?.id,
    groupId: createdGroupId || undefined
  })

  // 送信の受付中（空き状況の再確認からグループ作成・申込まで）。二度押しで 2 つ目のグループ・申込を作らないよう、
  // 描画を待たずに ref で止め、ボタンも最初から押せなくする（2026-10-26 点検 F09: 二度押しで申込 2 件・グループ 2 件）
  const submitInFlight = useRef(false)
  const [preparingSubmit, setPreparingSubmit] = useState(false)

  // 予約送信ハンドラ（グループも自動作成）
  const onSubmit = async () => {
    if (submitInFlight.current) return
    submitInFlight.current = true
    setPreparingSubmit(true)
    try {
      await submitOnce()
    } finally {
      submitInFlight.current = false
      setPreparingSubmit(false)
    }
  }

  const submitOnce = async () => {
    setError(null)
    
    if (editableTimeSlots.length === 0) {
      setError('候補日時を1件以上選択してください')
      return
    }

    if (horizonDays === null) {
      setError(PRIVATE_BOOKING_HORIZON_CHECKING_TEXT)
      return
    }

    if (editableTimeSlots.some((candidate) => candidate.date < dateRange.minDate)) {
      setError(`候補日は本日より${deadlineDays}日後以降のみ選べます`)
      return
    }

    if (selectedStoreIds.length === 0) {
      setError('希望店舗を1店舗以上選択してください')
      return
    }
    
    if (!validateForm(customerName, customerEmail, customerPhone)) {
      return
    }

    if (!user) {
      setError('ログインが必要です')
      return
    }

    try {
      // グループや顧客データを変更する前に、DB の最新の空き状況で全候補を再検証する（表示・保存と同じ判定）。
      // 画面の表示と同じ問い合わせを取り直す（表示と送信候補を同じ応答から作る。監査 R1）
      const [latestResult] = await Promise.all([
        refetchCandidateAvailability({ throwOnError: true }),
        refetchBlockedSlotRows(),
      ])
      const latestAvailability = latestResult.data
      if (!latestAvailability) throw new Error('空き状況を確認できません。時間をおいて開き直してください。')
      const reconciled = reconcilePrivateBookingCandidates(editableTimeSlots, (candidate) =>
        availableSlotsForDate(latestAvailability, candidate.date)
      )
      if (reconciled.invalid.length > 0) {
        const details = reconciled.invalid
          .map((candidate) => `${candidate.date} ${candidate.slot.label}`)
          .join('、')
        setError(`${details} は現在受付停止中または既存公演と競合しています。候補日時を再選択してください。`)
        return
      }

      if (reconciled.changed) {
        setEditableTimeSlots(reconciled.updated)
        setError('最新の空き状況に合わせて候補時刻を更新しました。内容を確認して、再度送信してください。')
        return
      }

      // グループがまだ作成されていない場合は作成
      let groupIdToUse = createdGroupId
      logger.log('[貸切リクエスト] 送信開始', { createdGroupId, scenarioId, editableTimeSlots: editableTimeSlots.length })
      
      if (!groupIdToUse && scenarioId) {
        logger.log('[貸切リクエスト] グループ作成開始')
        const group = await createGroup({
          scenarioId,
          name: undefined,
          preferredStoreIds: selectedStoreIds,
          candidateDates: editableTimeSlots.map((ts, idx) => ({
            date: ts.date,
            time_slot: ts.slot.label as '午前' | '午後' | '夜',
            start_time: ts.slot.startTime,
            end_time: ts.slot.endTime,
            order_num: idx + 1
          })),
          notes: notes || undefined,
        })
        logger.log('[貸切リクエスト] グループ作成成功', { groupId: group.id, inviteCode: group.invite_code })
        groupIdToUse = group.id
        setCreatedGroupId(group.id)
        setCreatedInviteCode(group.invite_code)
      } else {
        logger.log('[貸切リクエスト] グループ作成スキップ', { reason: groupIdToUse ? '既存グループあり' : 'scenarioIdなし' })
      }

      logger.log('[貸切リクエスト] handleSubmit呼び出し', { groupIdToUse })
      await handleSubmit(customerName, customerEmail, customerPhone, notes, customerNickname, groupIdToUse || undefined)
      
      // 成功後はボタンで遷移させるため自動リダイレクトは行わない
    } catch (error) {
      setError(privateBookingErrorText(error, '処理中にエラーが発生しました。もう一度お試しください。'))
    }
  }

  // 成功画面（店舗の返事の目安・メンバー招待・取消の案内。点検 43・35）
  if (success) {
    return (
      <PrivateBookingRequestSuccess
        bookingBasePath={bookingBasePath}
        scenarioTitle={scenarioTitle}
        customerEmail={customerEmail}
        confirmationEmailAccepted={confirmationEmailAccepted}
        inviteCode={createdInviteCode}
      />
    )
  }

  const totalPrice = minFee * maxParticipants
  const maxTotalPrice = maxFee * maxParticipants
  const hasFullyBlockedCandidate = editableTimeSlots.some((candidate) =>
    getBlockedState(candidate.date, candidate.slot.label).allStoresBlocked
  )
  const hasUnavailableCandidate = editableTimeSlots.some((candidate) => candidateUnavailableReason(candidate) !== null)

  return (
    <div className="booking-shell min-h-screen bg-background overflow-x-clip">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />

      {/* 戻るボタン */}
      <div className="bg-background border-b">
        <div className="container mx-auto max-w-5xl px-2 md:px-4 py-2">
          <Button variant="ghost" onClick={onBack} className="flex items-center gap-1.5 hover:bg-accent h-8 px-2 text-sm">
            <ArrowLeft className="w-4 h-4" />
            シナリオ詳細に戻る
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-2 md:px-4 py-6">
        <h1 className="text-xl font-bold mb-6">貸切リクエスト確認</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 左側：リクエスト内容 */}
          <div className="md:col-span-2 space-y-6">
            {/* シナリオ情報 */}
            <div>
              <h2 className="text-base font-semibold mb-3">シナリオ情報</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h3 className="text-base font-medium mb-2">{scenarioTitle}</h3>
                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                      貸切予約
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>最大 {maxParticipants} 名まで</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 候補日時 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">候補日時（{editableTimeSlots.length}/{MAX_TIME_SLOTS}件）</h2>
                {!showAddForm && editableTimeSlots.length < MAX_TIME_SLOTS && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddForm(true)}
                    className="text-purple-600 hover:text-purple-800 hover:bg-purple-50 h-8 px-2"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    追加
                  </Button>
                )}
              </div>
              
              {/* 追加フォーム */}
              {showAddForm && (
                <Card className="mb-3 border-purple-200 bg-purple-50">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-sm font-medium text-purple-800">候補日時を追加</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs mb-1 block">日付</Label>
                        <Input
                          type="date"
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          min={dateRange.minDate}
                          max={dateRange.maxDate}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">時間帯</Label>
                        <Select value={newSlotLabel} onValueChange={setNewSlotLabel}>
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="選択..." />
                          </SelectTrigger>
                          <SelectContent>
                            {candidateSlotsForPicker.length === 0 ? (
                              <div className="px-2 py-3 text-xs text-muted-foreground">
                                日付を選ぶか、希望店舗の営業時間を読み込み中です
                              </div>
                            ) : (
                              candidateSlotsForPicker.map((slot) => {
                                const blockedState = getBlockedState(pickerDate, slot.label)
                                return (
                                  <SelectItem
                                    key={slot.label}
                                    value={slot.label}
                                    disabled={blockedState.allStoresBlocked}
                                  >
                                    {slot.label}（{slot.startTime}〜{slot.endTime}）
                                    {blockedState.allStoresBlocked
                                      ? ' — 現在受付停止中'
                                      : blockedState.partiallyBlocked
                                        ? ' — 一部店舗のみ受付中'
                                        : ''}
                                  </SelectItem>
                                )
                              })
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddForm(false)
                          setNewDate('')
                          setNewSlotLabel('')
                        }}
                      >
                        キャンセル
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAddTimeSlot}
                        disabled={!newDate || !newSlotLabel || horizonDays === null}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        追加する
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <div className="space-y-2">
                {editableTimeSlots.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="p-4 text-center text-muted-foreground text-sm">
                      候補日時を追加してください
                    </CardContent>
                  </Card>
                ) : (
                  editableTimeSlots.map((slot, index) => {
                    const blockedState = getBlockedState(slot.date, slot.slot.label)
                    return (
                    <Card key={`${slot.date}-${slot.slot.label}`}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                              候補 {index + 1}
                            </Badge>
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span>{formatDate(slot.date)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            <span>{slot.slot.label} {slot.slot.startTime}{slot.slot.endTime ? ` - ${slot.slot.endTime}` : ''}</span>
                          </div>
                          {candidateUnavailableReason(slot) && (
                            <p className="text-xs font-medium text-red-700" data-testid="candidate-unavailable">
                              この日時は選べません（{candidateUnavailableReason(slot)}）— 候補日時を再選択してください
                            </p>
                          )}
                          {blockedState.allStoresBlocked && (
                            <p className="text-xs font-medium text-red-700">
                              現在受付停止中 — 候補日時を再選択してください
                            </p>
                          )}
                          {blockedState.partiallyBlocked && (
                            <p className="text-xs text-amber-700">
                              一部の希望店舗は現在受付停止中です
                            </p>
                          )}
                        </div>
                        {editableTimeSlots.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveTimeSlot(index)}
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 h-auto"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                    )
                  })
                )}
                {candidateTimesUpdated && (
                  <p className="text-xs text-amber-700" data-testid="candidate-times-updated">
                    最新の空き状況に合わせて候補の時刻を更新しました。内容をご確認ください。
                  </p>
                )}
              </div>
            </div>

            {/* 希望店舗（前ページで選んだ店舗。「変更」でこの画面のまま選び直せる） */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">希望店舗</h2>
                {playableStores.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStoreSheetOpen(true)}
                    className="text-purple-600 hover:text-purple-800 hover:bg-purple-50 h-8 px-2"
                    data-testid="change-stores"
                    aria-label="希望店舗を変更"
                  >
                    <Pencil className="w-4 h-4 mr-1" />
                    変更
                  </Button>
                )}
              </div>
              <ChangeStoresSheet
                open={storeSheetOpen}
                onOpenChange={setStoreSheetOpen}
                stores={playableStores}
                currentStoreIds={selectedStoreIds}
                checkCandidates={checkCandidatesForStores}
                onConfirm={handleConfirmStores}
              />
              <Card>
                <CardContent className="p-4 space-y-3">
                  {selectedStoreIds.length === 0 && (
                    <p className="text-sm text-muted-foreground">希望店舗が選ばれていません。「変更」から選んでください</p>
                  )}
                  <div className="space-y-2" data-testid="selected-stores">
                    {displayStores
                      .filter((store) => selectedStoreIds.includes(store.id))
                      .map((store) => (
                        <div
                          key={store.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-purple-300 bg-purple-50"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                              <span className="text-sm font-medium">{store.name}</span>
                            </div>
                            {store.address && (
                              <p className="text-xs mt-0.5 ml-5.5 text-muted-foreground">{store.address}</p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                  {selectedStoreIds.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      ※ 最終的な開催店舗は、候補日時と合わせて店舗側が決定します
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* お客様情報 */}
            <div>
              <h2 className="text-base font-semibold mb-3">お客様情報</h2>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">お名前 *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田 太郎"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">ニックネーム</Label>
                    <Input
                      value={customerNickname}
                      onChange={(e) => setCustomerNickname(e.target.value)}
                      placeholder="タロウ"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">店舗で呼ばれる際のお名前（任意）</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">メールアドレス *</Label>
                    <Input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="example@example.com"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">電話番号 *</Label>
                    <Input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="090-1234-5678"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">備考</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="伝達事項があればご記入ください。"
                      rows={4}
                      className="text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 右側：料金サマリー */}
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold mb-3">料金</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">参加費（1名）</span>
                    <span>{feeUnknownText ?? `¥${minFee.toLocaleString()}${maxFee !== minFee ? `〜¥${maxFee.toLocaleString()}` : ''}`}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">人数</span>
                    <span>{maxParticipants}名</span>
                  </div>

                  {editableTimeSlots.map((candidate, index) => (
                    <div key={`${candidate.date}-${candidate.slot.startTime}`} className="flex justify-between gap-3 text-xs">
                      <span>{formatDate(candidate.date)} {candidate.slot.label}</span>
                      <span>{feeUnknownText ?? `¥${((candidateFees[index] ?? participationFee) * maxParticipants).toLocaleString()}`}</span>
                    </div>
                  ))}

                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-bold">合計</span>
                      <span className="text-lg text-purple-600 font-bold">{feeUnknownText ?? `¥${totalPrice.toLocaleString()}${maxTotalPrice !== totalPrice ? `〜¥${maxTotalPrice.toLocaleString()}` : ''}`}</span>
                    </div>
                    {holidays.error && (
                      <p className="text-xs text-destructive mt-2" data-testid="private-request-fee-error">休日の設定を読み込めず、料金を確認できません。画面を再読み込みしてください。</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      確定した候補日の料金が適用されます。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed" data-testid="private-request-cancel-notice">
              <span className="font-bold">取消について: </span>{privateCancelNoticeText()}
            </p>

            {/* 注意事項（DBから取得） */}
            <BookingNotice
              mode="private"
              scenarioMasterId={scenarioId}
              organizationSlug={organizationSlug}
              storeId={selectedStoreIds.length === 1 ? selectedStoreIds[0] : null}
            />

            {!user ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">
                  貸切リクエストの送信にはログインが必要です。ログイン後、この画面に戻ります。
                </p>
                <Button
                  onClick={() => {
                    // 未ログイン時は戻り先付きでログインへ（入力途中で「ログインが必要です」にならないようにする）
                    navigate(buildAuthUrl('login', currentPathWithSearch()))
                  }}
                  className="w-full h-10 text-base bg-purple-600 hover:bg-purple-700"
                >
                  ログインして貸切リクエスト
                </Button>
              </div>
            ) : (
            <div className="space-y-2">
            <PrivateBookingHorizonNotice horizon={horizon} />
            {/* 送信の失敗・入力の不足は、押したボタンのすぐ上に出す（2026-10-20 staging 点検: 画面の一番上では見えなかった） */}
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="private-request-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button
              onClick={onSubmit}
              disabled={preparingSubmit || isSubmitting || groupLoading || hasFullyBlockedCandidate || hasUnavailableCandidate || horizonDays === null}
              className="w-full h-10 text-base bg-purple-600 hover:bg-purple-700"
            >
              {(preparingSubmit || isSubmitting || groupLoading) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {groupLoading ? 'グループ作成中...' : 'リクエスト送信中...'}
                </>
              ) : hasFullyBlockedCandidate ? '受付停止中の候補を再選択してください'
                : hasUnavailableCandidate ? '選べない候補日時を再選択してください' : '貸切リクエストを送信'}
            </Button>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

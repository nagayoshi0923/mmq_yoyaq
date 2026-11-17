import { reconcilePrivateBookingCandidates } from '@/lib/reconcilePrivateBookingCandidates'
import { candidateFeesIfKnown } from '../ScenarioDetailPage/utils/pricingUtils'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { AlertCircle, Loader2 } from 'lucide-react'
import { StepBar } from '@/components/renewal/StepBar'
import { PRIVATE_PURPLE, SERIF_HEADING } from '@/components/renewal/fonts'
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
import { savePrivateRequestLoginDraft, takePrivateRequestLoginDraft } from './utils/loginDraft'
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
  onSubmitted,
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
  // ログイン前に預けた候補を戻したら、利用者が全部消した（0 件）状態でも URL の候補で埋め直さない（#985）
  const slotsFromLoginDraft = useRef(false)
  useEffect(() => {
    if (initialTimeSlots.length === 0 || slotsFromLoginDraft.current) return
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

  // ログインから戻ったら、ログイン前に預けた入力途中の内容（備考・候補・店舗）を 1 回だけ戻す（#985）
  const restoredLoginDraft = useRef(false)
  useEffect(() => {
    if (restoredLoginDraft.current) return
    restoredLoginDraft.current = true
    const draft = takePrivateRequestLoginDraft(scenarioId, currentPathWithSearch())
    if (!draft) return
    if (draft.notes) setNotes(draft.notes)
    // 0 件も利用者の編集結果として戻す（全部消した候補を URL から復活させて送らない）
    slotsFromLoginDraft.current = true
    setEditableTimeSlots(draft.timeSlots)
    if (draft.storeIds && draft.storeIds.length > 0) {
      setChangedStoreIds(draft.storeIds)
      onStoreIdsChange?.(draft.storeIds)
    }
  }, [scenarioId, setNotes, onStoreIdsChange])

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

  // 申込を送れたら呼び出し側に知らせる（作品ページの貸切タブの預かりを消す。送った候補を戻さない。B29）
  useEffect(() => { if (success) onSubmitted?.() }, [success, onSubmitted])

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

  const yen = (n: number) => `${n.toLocaleString()}円`
  const box = 'border border-gray-200 bg-white p-4'
  const row = 'flex items-center justify-between gap-3 border-b border-gray-200 py-3 text-sm'
  const inputCls = 'mt-1 h-11 w-full border border-gray-300 bg-white px-3 text-sm'

  return (
    <div className="booking-shell min-h-screen overflow-x-clip bg-white">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />
      <div className="mx-auto flex max-w-4xl items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{scenarioTitle}の貸切</p>
          <h1 className="mt-1 text-lg font-bold">申込内容の確認</h1>
        </div>
        <button type="button" onClick={onBack} className="shrink-0 pt-1 text-sm">‹ 選び直す</button>
      </div>
      <StepBar steps={['候補日を選ぶ', '内容の確認', '完了']} current={1} color={PRIVATE_PURPLE} />

      <div className="mx-auto max-w-4xl space-y-3 bg-gray-50 px-3 py-4">
        <section className="px-1">
          <p className={`text-xl font-bold ${SERIF_HEADING}`}>{scenarioTitle}</p>
          <p className="text-xs text-muted-foreground">{maxParticipants}人で貸切</p>
        </section>

            {/* 候補日時 */}
            <section className={box}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">候補日時（{editableTimeSlots.length}/{MAX_TIME_SLOTS}件）</h2>
                {!showAddForm && editableTimeSlots.length < MAX_TIME_SLOTS && (
                  <button type="button" onClick={() => setShowAddForm(true)} className="text-sm underline" style={{ color: PRIVATE_PURPLE }}>
                    ＋ 追加
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">前の画面で選んだ候補です。候補は最大{MAX_TIME_SLOTS}つまで入れられ、多いほど決まりやすくなります。</p>

              {/* 追加フォーム */}
              {showAddForm && (
                <div className="mt-3 space-y-3 border border-violet-200 bg-violet-50 p-3">
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
                </div>
              )}
              
              <div className="mt-2">
                {editableTimeSlots.length === 0 ? (
                  <p className="border border-dashed border-gray-300 p-4 text-center text-sm text-muted-foreground">候補日時を追加してください</p>
                ) : (
                  editableTimeSlots.map((slot, index) => {
                    const blockedState = getBlockedState(slot.date, slot.slot.label)
                    return (
                    <div key={`${slot.date}-${slot.slot.label}`} className="flex items-center justify-between gap-3 border-b border-gray-200 py-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-baseline gap-3 text-sm">
                            <span className="w-14 shrink-0 text-xs text-muted-foreground">第{index + 1}希望</span>
                            <span className="font-bold">{formatDate(slot.date)}</span>
                          </div>
                          <div className="pl-[4.25rem] text-xs text-muted-foreground">
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
                          <button type="button" onClick={() => handleRemoveTimeSlot(index)} aria-label="この候補を外す" className="shrink-0 px-2 py-1 text-lg text-gray-400 hover:text-red-500">×</button>
                        )}
                    </div>
                    )
                  })
                )}
                {candidateTimesUpdated && (
                  <p className="text-xs text-amber-700" data-testid="candidate-times-updated">
                    最新の空き状況に合わせて候補の時刻を更新しました。内容をご確認ください。
                  </p>
                )}
              </div>
            </section>

            {/* 希望店舗（前ページで選んだ店舗。「変更」でこの画面のまま選び直せる） */}
            <section className={box}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">希望店舗</h2>
                {playableStores.length > 1 && (
                  <button type="button" onClick={() => setStoreSheetOpen(true)} className="text-sm underline" style={{ color: PRIVATE_PURPLE }} data-testid="change-stores" aria-label="希望店舗を変更">
                    変える
                  </button>
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
              <div className="mt-2 space-y-2">
                  {selectedStoreIds.length === 0 && (
                    <p className="text-sm text-muted-foreground">希望店舗が選ばれていません。「変更」から選んでください</p>
                  )}
                  <div className="space-y-2" data-testid="selected-stores">
                    {displayStores
                      .filter((store) => selectedStoreIds.includes(store.id))
                      .map((store) => (
                        <div
                          key={store.id}
                          className="flex items-start gap-3 border-b border-gray-200 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium">{store.name}</span>
                            {store.address && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{store.address}</p>
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
              </div>
            </section>

            {/* 人数と料金 */}
            <section className={box}>
              <h2 className="text-lg font-bold">人数と料金</h2>
              <div className={row}><span className="text-muted-foreground">人数</span><span>{maxParticipants}人（この作品の定員）</span></div>
              <div className={row}>
                <span className="text-muted-foreground">料金</span>
                <span>1人 {feeUnknownText ?? `${yen(minFee)}${maxFee !== minFee ? `〜${yen(maxFee)}` : ''}`}</span>
              </div>
              {editableTimeSlots.length > 1 && editableTimeSlots.map((candidate, index) => (
                <div key={`${candidate.date}-${candidate.slot.startTime}`} className="flex justify-between gap-3 py-1 text-xs text-muted-foreground">
                  <span>{formatDate(candidate.date)} {candidate.slot.label}</span>
                  <span>{feeUnknownText ?? yen((candidateFees[index] ?? participationFee) * maxParticipants)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-muted-foreground">合計</span>
                <span className="text-xl font-bold">{feeUnknownText ?? `${yen(totalPrice)}${maxTotalPrice !== totalPrice ? `〜${yen(maxTotalPrice)}` : ''}`}</span>
              </div>
              {holidays.error && (
                <p className="text-xs text-destructive" data-testid="private-request-fee-error">休日の設定を読み込めず、料金を確認できません。画面を再読み込みしてください。</p>
              )}
              <p className="text-xs text-muted-foreground">決まった候補日の料金になります。</p>
            </section>

            {/* 申し込む人 */}
            <section className={box}>
              <h2 className="text-lg font-bold">申し込む人</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">登録済みの情報を使います。違うときは書き換えてください</p>
              <div className="mt-3 space-y-3">
                <label className="block text-sm">お名前<span className="text-red-600">*</span>
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="山田 太郎" required className={inputCls} />
                </label>
                <label className="block text-sm">ニックネーム（任意）
                  <input value={customerNickname} onChange={(e) => setCustomerNickname(e.target.value)} placeholder="タロウ" className={inputCls} />
                  <span className="mt-0.5 block text-2xs text-muted-foreground">店舗で呼ばれるときのお名前</span>
                </label>
                <label className="block text-sm">メールアドレス<span className="text-red-600">*</span>
                  <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="example@example.com" required className={inputCls} />
                </label>
                <label className="block text-sm">電話番号<span className="text-red-600">*</span>
                  <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="090-1234-5678" required className={inputCls} />
                </label>
                <label className="block text-sm">店舗への連絡（任意）
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="伝えておきたいことがあれば書いてください" rows={3} className="mt-1 w-full border border-gray-300 bg-white px-3 py-2 text-sm" />
                </label>
              </div>
            </section>

            <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900" data-testid="private-request-cancel-notice">
              <span className="font-bold">取消について: </span>{privateCancelNoticeText()}
            </p>

            <section className={box}>
              <h2 className="mb-3 text-lg font-bold">貸切の前に</h2>
              <BookingNotice
                mode="private"
                scenarioMasterId={scenarioId}
                organizationSlug={organizationSlug}
                storeId={selectedStoreIds.length === 1 ? selectedStoreIds[0] : null}
              />
            </section>

            <section className="space-y-2 border border-violet-200 bg-violet-50 p-4">
              <p className="text-sm leading-relaxed">この時点ではまだ予約は確定しません。店舗が候補から日時と会場を決めると、お知らせが届きます。</p>
              {!user ? (
                <>
                  <p className="text-center text-xs text-muted-foreground">申し込むにはログインが必要です。ログインのあと、この画面に戻ります。</p>
                  <button
                    type="button"
                    onClick={() => {
                      // 画面はログインへ移ると消えるので、URL に無い入力途中の内容をタブ内に預ける（#985）
                      const returnTo = currentPathWithSearch()
                      savePrivateRequestLoginDraft(scenarioId, returnTo, { notes, timeSlots: editableTimeSlots, storeIds: changedStoreIds })
                      navigate(buildAuthUrl('login', returnTo))
                    }}
                    className="h-12 w-full text-base font-bold text-white"
                    style={{ backgroundColor: PRIVATE_PURPLE }}
                  >ログインして申し込む</button>
                </>
              ) : (
                <>
                  <PrivateBookingHorizonNotice horizon={horizon} />
                  {/* 送信の失敗・入力の不足は、押したボタンのすぐ上に出す（2026-10-20 staging 点検） */}
                  {error && (
                    <div role="alert" className="flex items-start gap-2 border-2 border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="private-request-error">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={preparingSubmit || isSubmitting || groupLoading || hasFullyBlockedCandidate || hasUnavailableCandidate || horizonDays === null}
                    className="flex h-12 w-full items-center justify-center text-base font-bold text-white disabled:opacity-40"
                    style={{ backgroundColor: PRIVATE_PURPLE }}
                  >
                    {(preparingSubmit || isSubmitting || groupLoading) ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {groupLoading ? 'グループ作成中…' : '申し込んでいます…'}
                      </>
                    ) : hasFullyBlockedCandidate ? '受付停止中の候補を再選択してください'
                      : hasUnavailableCandidate ? '選べない候補日時を再選択してください' : 'この内容で申し込む'}
                  </button>
                  <p className="text-center text-xs text-muted-foreground">申し込んだあとも、候補日の追加や取り下げができます。</p>
                </>
              )}
            </section>
      </div>
    </div>
  )
}

import { saveGmResponse, type ManualGmResponseBaseline } from '@/lib/gmResponseApi'
import { candidateResponseIndex } from '@/lib/gmCandidateSelection'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { Calendar, Search, Mail } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState, ListSkeleton } from '@/components/patterns/list'

import { useAuth } from '@/contexts/AuthContext'
import { privateBookingMgmtReadApi } from '@/lib/api/privateBookingMgmtReadApi'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { resendPrivateBookingDiscordNotification, resendPrivateBookingDiscordNotificationForGm } from '@/lib/api/privateBookingNotificationApi'

// 分離されたコンポーネント
import { useApprovalDeliveryStatus } from './hooks/useApprovalDeliveryStatus'
import { useApplicantChanges } from './hooks/useApplicantChanges'
import { useRejectionDeliveryStatus } from './hooks/useRejectionDeliveryStatus'
import { isPrivateRequestWithdrawnByCustomer } from '@/lib/constants/reservationStatus'
import { BookingRequestCard } from './components/BookingRequestCard'
import { RequestFilterToolbar } from './components/RequestFilterToolbar'
import { RejectRequestDialog } from './components/RejectRequestDialog'
import { RequestConfirmDialogs } from './components/RequestConfirmDialogs'
import { buildGmSelectOptions } from './utils/gmSelectOptions'
import { ActionButtons } from './components/ActionButtons'
import { SurveyResponsesView } from './components/SurveyResponsesView'
import { TemplateEditDialog } from '@/components/settings/TemplateEditDialog'


// 分離されたフック
import type { PrivateBookingRequest } from './hooks/usePrivateBookingData'
import {
  applyDisplayLimit, buildScenarioOptions, buildStoreOptions, groupStoresByRegion, hasActiveRequestFilters,
  matchesRequestFilters, mergeGmOptions, splitRequestsIntoTabs, type TabValue,
} from './utils/requestList'
import { useBookingRequests } from './hooks/useBookingRequests'
import { useBookingApproval } from './hooks/useBookingApproval'
import { usePrivateBookingConflicts } from './hooks/usePrivateBookingConflicts'
import { useStoreAndGMManagement } from './hooks/useStoreAndGMManagement'
import { getCurrentOrganizationId } from '@/lib/organization'
import {
  classifyPrivateBookingBlockedTiming,
  getPrivateBookingCandidateBlockedState,
  privateRecruitmentPauseRows,
  toCanonicalPrivateBookingTimeSlot,
  type PrivateBookingBlockedSlotRow,
} from '@/lib/privateBookingBlockedSlotAvailability'
import { useStoreRecruitmentPausePeriods } from '@/hooks/useStoreRecruitmentPauses'
import { getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { startTimeToEn } from '@/lib/timeSlot'

const APPROVAL_START_TIME_OPTIONS: string[] = (() => {
  const options: string[] = []
  for (let hour = 9; hour <= 22; hour++) {
    options.push(`${String(hour).padStart(2, '0')}:00`)
    options.push(`${String(hour).padStart(2, '0')}:30`)
  }
  return options
})()

const VALID_TABS: TabValue[] = ['gm_pending', 'store_pending', 'rejected', 'approved', 'all']
// 旧URL（?tab=cancelled）からの互換: 確定後キャンセルタブは承認済みタブに統合された
const LEGACY_TAB_MAP: Record<string, TabValue> = { cancelled: 'approved' }

export function PrivateBookingManagement() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawTab = searchParams.get('tab')
  const activeTab: TabValue = VALID_TABS.includes(rawTab as TabValue)
    ? (rawTab as TabValue)
    : (rawTab && LEGACY_TAB_MAP[rawTab]) || 'store_pending'
  const setActiveTab = useCallback((tab: TabValue) => {
    setSearchParams({ tab }, { replace: true })
  }, [setSearchParams])
  
  // 選択状態
  const [selectedRequest, setSelectedRequest] = useState<PrivateBookingRequest | null>(null)
  const [selectedGMId, setSelectedGMId] = useState<string>('')
  const [selectedSubGmId, setSelectedSubGmId] = useState<string>('')
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [confirmTemplateDialogOpen, setConfirmTemplateDialogOpen] = useState(false)  // 確定メールのテンプレ編集
  const [rejectTemplateOpen, setRejectTemplateOpen] = useState(false)  // 却下メールのテンプレ編集（次回も使う定型文）
  const [rejectTemplateStoreId, setRejectTemplateStoreId] = useState<string | null>(null)
  const [rejectTemplateOrgId, setRejectTemplateOrgId] = useState<string | null>(null)  // store_id 無し時の組織フォールバック
  const [resolvingRejectStore, setResolvingRejectStore] = useState(false)
  const [selectedCandidateOrder, setSelectedCandidateOrder] = useState<number | null>(null)
  const [selectedStartTime, setSelectedStartTime] = useState('')
  const [displayLimit, setDisplayLimit] = useState<string>('50')  // 表示件数
  const [searchText, setSearchText] = useState('')  // フリーワード検索
  const [scenarioFilter, setScenarioFilter] = useState<string>('all')  // シナリオ絞り込み
  const [storeFilter, setStoreFilter] = useState<string>('all')  // 店舗絞り込み（確定店舗または希望店舗）
  const [dateRangeStart, setDateRangeStart] = useState<string | undefined>(undefined)  // 期間フィルター開始日
  const [dateRangeEnd, setDateRangeEnd] = useState<string | undefined>(undefined)  // 期間フィルター終了日
  const [scenarioAvailableStores, setScenarioAvailableStores] = useState<string[]>([])  // シナリオ対応店舗ID
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>('all')  // 地域フィルター
  const [assignedGMIds, setAssignedGMIds] = useState<string[]>([])  // シナリオ担当GM
  const [resendDiscordTarget, setResendDiscordTarget] = useState<{ id: string; scenario_title: string } | null>(null)  // Discord通知再送信確認
  const [reapproveTarget, setReapproveTarget] = useState<{ req: PrivateBookingRequest } | null>(null)  // 承認済み予約の再変更確認

  useEffect(() => {
    getCurrentOrganizationId().then(setOrganizationId).catch(() => setOrganizationId(null))
  }, [])

  // リクエストデータ管理
  const { requests, loading, isError: requestsError, retryRequests, loadRequests } = useBookingRequests({
    userId: user?.id,
    userRole: user?.role,
  })

  // 承認・却下・削除処理
  const {
    submitting,
    showRejectDialog,
    rejectionReason,
    setRejectionReason,
    rejectBodyLoading,
    handleApprove,
    handleRejectClick,
    handleRejectConfirm,
    handleRejectCancel,
    handleDelete,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    runDelete,
  } = useBookingApproval({
    onSuccess: () => {
      setSelectedRequest(null)
      setSelectedStartTime('')

      setSelectedGMId('')
      setSelectedSubGmId('')
      setSelectedStoreId('')
      setSelectedCandidateOrder(null)
      setSelectedStartTime('')
      // force=true 必須: 引数なしだと loadRequests は何もしない（キャッシュ再取得しない）
      return loadRequests(true)
    }
  })

  // 店舗・GM管理
  const {
    stores,
    availableGMs,
    allGMs,
    loadStores,
    loadAllGMs,
    loadAvailableGMs
  } = useStoreAndGMManagement()
  const { isCustomHoliday } = useCustomHolidays()

  const conflicts = usePrivateBookingConflicts(organizationId, requests)

  const [blockedSlotRows, setBlockedSlotRows] = useState<PrivateBookingBlockedSlotRow[]>([])

  // GM出欠手動記録ハンドラー
  const handleGMResponseSave = async (requestId: string, staffId: string, availableCandidates: number[], baseline: ManualGmResponseBaseline) => {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) { showToast.error('組織情報を取得できません'); return }
    const req = requests.find(r => r.id === requestId)
    const displayedCandidates = baseline.candidates
    const storedIndexes = availableCandidates.map(index => {
      const candidate = displayedCandidates[index]
      return candidate ? candidateResponseIndex(candidate, displayedCandidates) : null
    })
    if (!req || storedIndexes.some(index => index === null)) {
      showToast.error('過去の候補との対応を確認できません。現在の候補日時を確認してください。')
      throw new Error('候補との対応を確認できません')
    }
    const gm = allGMs.find(g => g.id === staffId)
    const responseStatus = availableCandidates.length === 0 ? 'all_unavailable' : 'available'
    const previous = baseline.responses.find(r => r.staff_id === staffId)
    try {
      await saveGmResponse({reservationId:requestId,staffId,
        candidates:baseline.storedCandidates,
        expectedResponse:previous ? {id:previous.id,updated_at:previous.updated_at ?? null} : null,
        availableCandidates:storedIndexes as number[],responseStatus,notes:'管理画面から手動入力'})
    } catch(error) {
      showToast.error(error instanceof Error ? error.message : '保存に失敗しました')
      throw error
    }
    showToast.success(`${gm?.name || 'GM'}の出欠を記録しました`)
    loadRequests(true)
  }

  // Discord通知再送信ハンドラー
  const handleResendDiscordNotification = async (cardRequest: { id: string; scenario_title: string }) => {
    setResendDiscordTarget(cardRequest)
  }

  const runResendDiscordNotification = async () => {
    const cardRequest = resendDiscordTarget
    if (!cardRequest) return
    const request = requests.find(r => r.id === cardRequest.id)
    if (!request) return

    const result = await resendPrivateBookingDiscordNotification({
      id: request.id,
      scenario_master_id: request.scenario_master_id,
      scenario_title: request.scenario_title,
      customer_name: request.customer_name,
      customer_email: request.customer_email,
      customer_phone: request.customer_phone,
      participant_count: request.participant_count,
      candidate_datetimes: request.candidate_datetimes,
      notes: request.notes,
      created_at: request.created_at,
    })
    
    if (result.success) {
      showToast.success('Discord通知を再送信しました')
    } else {
      showToast.error(result.error || 'Discord通知の再送信に失敗しました')
    }
  }

  // 承認済み予約の再変更確認後の実行
  const runReapprove = async () => {
    const req = reapproveTarget?.req
    if (!req) return
    const needTwo = (req.required_gm_count ?? 1) >= 2
    const result = await handleApprove(req.id, req, selectedGMId, needTwo ? selectedSubGmId : null, selectedStoreId, selectedCandidateOrder, stores, selectedStartTime)
    if (result?.success) {
      showToast.success('貸切予約を確定しました。確定メールとGM通知を送信します。')
    } else if (result?.error) {
      // handleApprove の error はユーザー向けに整形済みのため、getSafeErrorMessage を通すと
      // フォールバック文言に置き換わってしまう（#354）。そのまま表示する。
      showToast.error(result.error || '処理に失敗しました')
    }
  }

  // GM個別の通知/再通知ハンドラー（未送信→送信、未回答→再送）
  const handleResendDiscordGm = async (
    cardRequest: { id: string; scenario_title: string },
    staffId: string,
    gmName: string,
  ) => {
    const request = requests.find(r => r.id === cardRequest.id)
    if (!request) return
    const result = await resendPrivateBookingDiscordNotificationForGm(
      {
        id: request.id,
        scenario_master_id: request.scenario_master_id,
        scenario_title: request.scenario_title,
        customer_name: request.customer_name,
        customer_email: request.customer_email,
        customer_phone: request.customer_phone,
        participant_count: request.participant_count,
        candidate_datetimes: request.candidate_datetimes,
        notes: request.notes,
        created_at: request.created_at,
      },
      staffId,
    )
    if (result.success) {
      showToast.success(`${gmName || 'GM'} にDiscord通知を送信しました`)
    } else {
      showToast.error(result.error || 'Discord通知の送信に失敗しました')
    }
  }

  // スクロール位置の保存と復元
  useReportRouteScrollRestoration('private-booking-management', { isLoading: loading })

  // スタッフマスタ＋GM回答のみにいるIDを統合（一覧の取りこぼし防止）
  const mergedGmOptions = useMemo(() => mergeGmOptions(allGMs, availableGMs), [allGMs, availableGMs])

  // Radix Select はダイアログ内＋長い候補でビューポートが不安定になりがちなため、ネイティブ select で全件・確実にスクロール表示する
  const gmSelectOptions = buildGmSelectOptions({
    mergedGmOptions, availableGMs, assignedGMIds, selectedRequest, selectedCandidateOrder,
    candidateTime: approvalCandidateTime, gmConflictOf: conflicts.gmConflict, conflictsReady: conflicts.ready,
  })

  useEffect(() => {
    const candidate = selectedRequest?.candidate_datetimes?.candidates?.find(
      (c) => c.order === selectedCandidateOrder
    )
    setSelectedStartTime((candidate?.startTime || '').slice(0, 5))
    // 同じ申請の再フェッチで入力中の時刻を消さないよう、id と候補番号だけ見る
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedRequest 全体を入れると一覧更新で上書きされる
  }, [selectedRequest?.id, selectedCandidateOrder])

  const selectedApprovalCandidate = selectedRequest?.candidate_datetimes?.candidates?.find(
    (c) => c.order === selectedCandidateOrder
  )
  const approvalEndTime = selectedApprovalCandidate && selectedStartTime
    ? (selectedRequest?.scenario_timing
        ? getPrivateBookingDisplayEndTime(
            selectedStartTime,
            selectedApprovalCandidate.date,
            selectedRequest.scenario_timing,
            isCustomHoliday
          )
        : selectedApprovalCandidate.endTime)
    : ''
  const approvalEndTooLate = !!approvalEndTime && (
    approvalEndTime <= selectedStartTime || approvalEndTime > '23:00'
  )
  const requestedStartTime = (selectedApprovalCandidate?.startTime || '').slice(0, 5)
  const approvalStartChanged = !!selectedStartTime && !!requestedStartTime && selectedStartTime !== requestedStartTime
  const approvalStartTimeOptions = selectedStartTime && !APPROVAL_START_TIME_OPTIONS.includes(selectedStartTime)
    ? [...APPROVAL_START_TIME_OPTIONS, selectedStartTime].sort()
    : APPROVAL_START_TIME_OPTIONS

  function approvalCandidateTime(request: PrivateBookingRequest, candidate: { order: number; date: string; startTime: string; endTime: string }) {
    const startTime = selectedRequest?.id === request.id && selectedCandidateOrder === candidate.order && selectedStartTime
      ? selectedStartTime : candidate.startTime
    return { date: candidate.date, startTime, endTime: request.scenario_timing
      ? getPrivateBookingDisplayEndTime(startTime, candidate.date, request.scenario_timing, isCustomHoliday)
      : candidate.endTime }
  }

  // 初期データロード（loadRequests は useQuery が自動取得するため実質 no-op の互換呼び出し）
  useEffect(() => {
    loadRequests()
    loadStores()
    loadAllGMs()
  }, [loadRequests, loadStores, loadAllGMs])

  useEffect(() => {
    if (!organizationId || !requests.length) {
      setBlockedSlotRows((rows) => (rows.length ? [] : rows))
      return
    }
    const allDates = [...new Set(
      requests.flatMap((request) =>
        (request.candidate_datetimes?.candidates || []).map((candidate) => candidate.date)
      )
    )].filter(Boolean)
    if (!allDates.length) {
      setBlockedSlotRows([])
      return
    }

    let cancelled = false
    void privateBookingMgmtReadApi.listBlockedSlotsOnDates(organizationId, allDates)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          logger.error('貸切管理: 募集停止枠取得エラー', error)
          setBlockedSlotRows([])
          return
        }
        setBlockedSlotRows((data || []) as PrivateBookingBlockedSlotRow[])
      })
    return () => { cancelled = true }
  }, [organizationId, requests])

  // スケジュールで止めた枠に、店舗の「貸切募集停止」期間を加える（承認処理も同じ期間で止めるため、画面で先に知らせる）
  const pauses = useStoreRecruitmentPausePeriods(Boolean(organizationId))
  const pausePeriods = pauses.periods
  const effectiveBlockedRows = useMemo(() => {
    const dates = requests.flatMap(request => (request.candidate_datetimes?.candidates || []).map(candidate => candidate.date)).filter(Boolean)
    return [...blockedSlotRows, ...privateRecruitmentPauseRows(pausePeriods, dates)]
  }, [blockedSlotRows, pausePeriods, requests])

  const isCandidateStoreBlocked = useCallback((
    candidate: { date: string; timeSlot: string } | undefined,
    storeId: string
  ): boolean => {
    if (!candidate || !storeId) return false
    const canonicalTimeSlot = toCanonicalPrivateBookingTimeSlot(candidate.timeSlot)
    if (!canonicalTimeSlot) return false
    return effectiveBlockedRows.some((row) =>
      row.date === candidate.date &&
      row.store_id === storeId &&
      row.time_slot === canonicalTimeSlot
    )
  }, [effectiveBlockedRows])

  // 選択されたリクエストの初期化
  useEffect(() => {
    if (!selectedRequest) return
    loadAllGMs()
    loadAvailableGMs(selectedRequest.id)
    // 確定店舗があればそれを選択
    if (selectedRequest.candidate_datetimes?.confirmedStore) {
      setSelectedStoreId(selectedRequest.candidate_datetimes.confirmedStore.storeId)
    }
    // 候補の自動選択はしない（ユーザーが候補行を直接クリックして選択する）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRequest])

  // シナリオの対応店舗と担当GMを取得
  useEffect(() => {
    const loadScenarioData = async () => {
      const scenarioId = selectedRequest?.scenario_master_id
      if (scenarioId) {
        try {
          // 対応店舗とscenario_master_idを取得（organization_scenarios_with_masterで組織固有のavailable_stores）
          const orgId = await getCurrentOrganizationId()
          const { data: scenarioData, error } = await privateBookingMgmtReadApi.findScenarioStoresView(scenarioId, orgId)
          
          if (error) {
            logger.error('シナリオ対応店舗取得エラー:', error)
            setScenarioAvailableStores([])
          } else {
            setScenarioAvailableStores(scenarioData?.available_stores || [])
          }
          
          const masterId = scenarioData?.scenario_master_id ?? scenarioId
          if (masterId) {
            const { data: assignmentData, error: assignmentError } = await privateBookingMgmtReadApi.listGmAssignmentsByScenario(masterId)
            
            if (assignmentError) {
              logger.error('担当GM取得エラー:', assignmentError)
              setAssignedGMIds([])
            } else {
              setAssignedGMIds((assignmentData || []).map(a => a.staff_id))
            }
          } else {
            setAssignedGMIds([])
          }
        } catch (error) {
          logger.error('シナリオデータ取得エラー:', error)
          setScenarioAvailableStores([])
          setAssignedGMIds([])
        }
      } else {
        setScenarioAvailableStores([])
        setAssignedGMIds([])
      }
    }
    
    loadScenarioData()
  }, [selectedRequest?.scenario_master_id])

  // シナリオ対応店舗でフィルタリングした店舗リスト
  const filteredStores = useMemo(() => {
    const hasScenarioStoreLimit = scenarioAvailableStores.length > 0

    // シナリオのavailable_storesに含まれる店舗はis_temporaryでも表示する
    return stores.filter(s => 
      s.ownership_type !== 'office' && 
      s.status === 'active' &&
      (hasScenarioStoreLimit
        ? scenarioAvailableStores.includes(s.id)
        : !s.is_temporary)
    )
  }, [stores, scenarioAvailableStores])

  // 店舗を地域ごとにグループ化
  const storesByRegion = useMemo(() => groupStoresByRegion(filteredStores), [filteredStores])

  // 地域フィルターで絞り込んだ店舗リスト
  const regionFilteredStores = useMemo(() => {
    if (selectedRegionFilter === 'all') {
      return filteredStores
    }
    return filteredStores.filter(store => (store.region || '未分類') === selectedRegionFilter)
  }, [filteredStores, selectedRegionFilter])


  // 選択可能な最初の候補日時を自動選択
  const selectFirstAvailableCandidate = () => {
    if (!selectedRequest?.candidate_datetimes?.candidates) return
    
    for (const candidate of selectedRequest.candidate_datetimes.candidates) {
      const actual = approvalCandidateTime(selectedRequest, candidate)
      const hasStoreConflict = selectedStoreId && conflicts.storeConflict(selectedRequest, actual, selectedStoreId) !== false
      const gm = allGMs.find(g => g.id === selectedGMId)
      const hasGMConflict = gm && conflicts.gmConflict(selectedRequest, actual, gm.id, gm.name) !== false
      
      if (!hasStoreConflict && !hasGMConflict) {
        setSelectedCandidateOrder(candidate.order)
        return
      }
    }
    
    // 全て競合している場合は、最初の候補を選択
    if (selectedRequest.candidate_datetimes.candidates.length > 0) {
      setSelectedCandidateOrder(selectedRequest.candidate_datetimes.candidates[0].order)
    }
  }

  // ── 検索・絞り込み ─────────────────────────────────────
  // タブ分けの前に適用する＝各タブの件数バッジも絞り込み後の数になり、
  // 「探しているものがどのタブにいるか」が検索だけで分かる
  const listFilters = { searchText, scenarioFilter, storeFilter, dateRangeStart, dateRangeEnd }
  const visibleRequests = requests.filter(req => matchesRequestFilters(req, listFilters))
  const hasActiveFilters = hasActiveRequestFilters(listFilters)

  // 絞り込みプルダウンの選択肢（全データから生成、絞り込み状態に左右されない）
  const scenarioOptions = useMemo(() => buildScenarioOptions(requests), [requests])
  const storeOptions = useMemo(() => buildStoreOptions(requests), [requests])

  // タブ分け（作業キュー系は申込順、承認済み/却下済みは動きがあった順）
  const { gmPending: gmPendingRequests, storePending: storePendingRequests, rejected: rejectedRequests, approved: approvedRequests } = splitRequestsIntoTabs(visibleRequests)
  const applyLimit = (reqs: PrivateBookingRequest[]) => applyDisplayLimit(reqs, displayLimit)

  // 期間フィルターのハンドラー
  const handleDateRangeChange = (start?: string, end?: string) => {
    setDateRangeStart(start)
    setDateRangeEnd(end)
  }
  
  const baseRequests = activeTab === 'gm_pending'
    ? gmPendingRequests
    : activeTab === 'store_pending'
      ? storePendingRequests
      : activeTab === 'rejected'
        ? rejectedRequests
        : activeTab === 'approved'
          ? approvedRequests
          : visibleRequests
  const filteredRequests = applyLimit(baseRequests)
  // 申込者の変更履歴（主催者の引き継ぎ、段階 3）
  const applicantChanges = useApplicantChanges(organizationId, filteredRequests.map(r => r.id))
  const approvalDeliveries = useApprovalDeliveryStatus(organizationId, filteredRequests.filter(r => ['confirmed','gm_confirmed','checked_in','completed'].includes(r.status)).map(r => r.id))
  const rejectionDeliveries = useRejectionDeliveryStatus(organizationId, filteredRequests.filter(r => r.status === 'cancelled' && !isPrivateRequestWithdrawnByCustomer(r)).map(r => r.id))

  if (loading || requestsError) {
    return (
      <AppLayout
        currentPage="private-booking"
        maxWidth="max-w-[1440px]"
        containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
        stickyLayout={true}
      >
        <div className="space-y-6">
          <PageHeader
            title={<><Calendar className="h-5 w-5 text-primary" />貸切予約管理</>}
            description="貸切予約リクエストの承認・却下・店舗調整を行います"
          />
          {requestsError ? <div role="alert">
            <p>貸切予約・GM回答を取得できませんでした。</p>
            <Button variant="outline" onClick={() => retryRequests()}>再試行</Button>
          </div> : <ListSkeleton rows={4} variant="card" />}
        </div>
      </AppLayout>
    )
  }

  // 却下ダイアログから「次回も使う却下メールのテンプレ」を編集する。
  // 貸切リクエストは store_id が無いことが多いので、その場合は送信側と同じく
  // organization_id の email_settings 行（＝組織のメール設定）を対象にする。
  const openRejectTemplateEditor = async () => {
    const reqId = selectedRequest?.id
    if (!reqId) return
    setResolvingRejectStore(true)
    try {
      const { data } = await privateBookingMgmtReadApi.findReservationStoreAndOrganization(reqId)
      if (data?.store_id) {
        setRejectTemplateStoreId(data.store_id)
        setRejectTemplateOrgId(null)
      } else if (data?.organization_id) {
        setRejectTemplateStoreId(null)
        setRejectTemplateOrgId(data.organization_id)
      } else {
        showToast.error('店舗・組織が特定できず、テンプレートを開けません')
        return
      }
      setRejectTemplateOpen(true)
    } catch (e) {
      logger.error('却下テンプレ対象の取得エラー:', e)
      showToast.error('テンプレートを開けませんでした')
    } finally {
      setResolvingRejectStore(false)
    }
  }

  return (
    <AppLayout
      currentPage="private-booking"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <div className="space-y-6">
        <PageHeader
          title={<><Calendar className="h-5 w-5 text-primary" />貸切予約管理</>}
          description="貸切予約リクエストの承認・却下・店舗調整を行います"
        />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
          <div className="flex flex-col gap-3 mb-4">
            <TabsList className="w-full sm:w-auto flex-wrap self-start">
              <TabsTrigger value="gm_pending" className="flex-1 sm:flex-initial text-xs sm:text-sm">GM確認中 ({gmPendingRequests.length})</TabsTrigger>
              <TabsTrigger value="store_pending" className="flex-1 sm:flex-initial text-xs sm:text-sm">店舗承認待ち ({storePendingRequests.length})</TabsTrigger>
              <TabsTrigger value="rejected" className="flex-1 sm:flex-initial text-xs sm:text-sm">却下済み ({rejectedRequests.length})</TabsTrigger>
              <TabsTrigger value="approved" className="flex-1 sm:flex-initial text-xs sm:text-sm">承認済み ({approvedRequests.length})</TabsTrigger>
              <TabsTrigger value="all" className="flex-1 sm:flex-initial text-xs sm:text-sm">全て ({visibleRequests.length})</TabsTrigger>
            </TabsList>

            {/* 検索・絞り込みツールバー（全タブ横断で効く。件数バッジにも反映） */}
            <RequestFilterToolbar
              hasActiveFilters={hasActiveFilters}
              setSearchText={setSearchText}
              setScenarioFilter={setScenarioFilter}
              setStoreFilter={setStoreFilter}
              setDateRangeStart={setDateRangeStart}
              setDateRangeEnd={setDateRangeEnd}
              organizationId={organizationId}
              searchText={searchText}
              scenarioFilter={scenarioFilter}
              storeFilter={storeFilter}
              scenarioOptions={scenarioOptions}
              storeOptions={storeOptions}
              dateRangeStart={dateRangeStart}
              dateRangeEnd={dateRangeEnd}
              handleDateRangeChange={handleDateRangeChange}
              displayLimit={displayLimit}
              setDisplayLimit={setDisplayLimit}
            />
          </div>

          {!pauses.ready && requests.length > 0 && (
            <Alert><AlertDescription>
              {pauses.error ? '店舗の募集停止を確認できませんでした。再読み込みしてください。' : '店舗の募集停止を確認中です。'}
              {pauses.error && <Button variant="link" onClick={() => void pauses.retry()}>再読み込み</Button>}
            </AlertDescription></Alert>
          )}

          {!conflicts.ready && requests.length > 0 && (
            <Alert><AlertDescription>
              {conflicts.error ? '空き状況を取得できませんでした。再読み込みしてください。' : '準備時間と公演の空き状況を確認中です。'}
              {conflicts.error && <Button variant="link" onClick={() => void conflicts.retry()}>再読み込み</Button>}
            </AlertDescription></Alert>
          )}

          {/* 予約リクエストタブ */}
          <div className="mt-0">

            {filteredRequests.length === 0 ? (
              <Card className="border">
                <CardContent className="p-0">
                  <EmptyState
                    icon={Search}
                    title="該当するリクエストがありません"
                    description={hasActiveFilters ? '検索条件やタブを変えてお試しください' : undefined}
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredRequests.map(req => (
                  <BookingRequestCard
                    key={req.id}
                    request={req}
                    approvalDeliveries={approvalDeliveries.data?.find(row => row.reservation_id === req.id)?.deliveries}
                    applicantChanges={applicantChanges.data?.[req.id]}
                    approvalDeliveryError={['confirmed','gm_confirmed','checked_in','completed'].includes(req.status) && approvalDeliveries.isError}
                    rejectionDelivery={rejectionDeliveries.data?.find(row => row.reservation_id === req.id)}
                    rejectionDeliveryError={rejectionDeliveries.isError}
                    onRetryRejectionDelivery={() => rejectionDeliveries.retry(req.id)}
                    retryingRejectionDelivery={rejectionDeliveries.retrying}
                    onResendDiscordNotification={handleResendDiscordNotification}
                    onResendDiscordGm={handleResendDiscordGm}
                    gmList={allGMs}
                    onGMResponseSave={handleGMResponseSave}
                    selectedCandidateOrder={selectedRequest?.id === req.id ? selectedCandidateOrder : null}
                    unknownAvailabilityCandidates={(() => {
                      if (!conflicts.ready) return []
                      const ids = req.candidate_datetimes?.requestedStores?.map((s) => s.storeId) || []
                      const baseStores = ids.length ? stores.filter(s => ids.includes(s.id)) : stores.filter(s => s.ownership_type !== 'office' && !s.is_temporary)
                      return (req.candidate_datetimes?.candidates || []).filter(candidate =>
                        baseStores.some(store => conflicts.storeConflict(req, approvalCandidateTime(req, candidate), store.id) === undefined)
                      ).map(candidate => candidate.order)
                    })()}
                    storesPerCandidate={(() => {
                      if (!conflicts.ready) return undefined
                      const ids = req.candidate_datetimes?.requestedStores?.map((s) => s.storeId) || []
                      const baseStores = ids.length > 0
                        ? stores.filter(s => ids.includes(s.id))
                        : stores.filter(s => s.ownership_type !== 'office' && !s.is_temporary)
                      return (req.candidate_datetimes?.candidates || []).reduce((acc, cand) => {
                        acc[cand.order] = baseStores.filter(s =>
                          conflicts.storeConflict(req, approvalCandidateTime(req, cand), s.id) === false &&
                          !isCandidateStoreBlocked(cand, s.id)
                        )
                        return acc
                      }, {} as Record<number, typeof baseStores>)
                    })()}
                    blockedStatusPerCandidate={(() => {
                      const ids = req.candidate_datetimes?.requestedStores?.map((store) => store.storeId) || []
                      const baseStores = ids.length > 0
                        ? stores.filter((store) => ids.includes(store.id))
                        : stores.filter((store) => store.ownership_type !== 'office' && !store.is_temporary)
                      return (req.candidate_datetimes?.candidates || []).reduce((acc, candidate) => {
                        const state = getPrivateBookingCandidateBlockedState(
                          { date: candidate.date, timeSlot: candidate.timeSlot },
                          baseStores.map((store) => store.id),
                          effectiveBlockedRows
                        )
                        if (state.blockedStoreIds.length === 0) return acc
                        const timing = state.allStoresBlocked
                          ? classifyPrivateBookingBlockedTiming(
                              { date: candidate.date, timeSlot: candidate.timeSlot },
                              baseStores.map((store) => store.id),
                              effectiveBlockedRows,
                              req.created_at
                            )
                          : 'none'
                        acc[candidate.order] = {
                          allStoresBlocked: state.allStoresBlocked,
                          timing,
                          storeNames: baseStores
                            .filter((store) => state.blockedStoreIds.includes(store.id))
                            .map((store) => store.short_name || store.name),
                        }
                        return acc
                      }, {} as Record<number, {
                        allStoresBlocked: boolean
                        timing: 'none' | 'blocked_after_request' | 'blocked_at_request'
                        storeNames: string[]
                      }>)
                    })()}
                    onSelectCandidate={(clickedReq, order) => {
                      // 同じ候補を再クリック → 選択解除
                      if (selectedRequest?.id === clickedReq.id && selectedCandidateOrder === order) {
                        setSelectedRequest(null)
                        setSelectedGMId('')
                        setSelectedSubGmId('')
                        setSelectedStoreId('')
                        setSelectedCandidateOrder(null)
                        return
                      }
                      // 別のリクエストを選択
                      if (selectedRequest?.id !== clickedReq.id) {
                        setSelectedGMId('')
                        setSelectedSubGmId('')
                        setSelectedStoreId('')
                        setSelectedRequest(clickedReq as any)
                      }
                      setSelectedCandidateOrder(order)
                    }}
                    inlineApprovalContent={selectedRequest?.id === req.id && selectedCandidateOrder ? (
                      <div className="space-y-3">
                        {/* アンケート */}
                        <SurveyResponsesView
                          reservationId={req.id}
                          scenarioId={req.scenario_master_id || ''}
                        />

                        {/* 店舗・GMプルダウン（候補行クリックで開く） */}
                        {(() => {
                          const selectedCand = req.candidate_datetimes?.candidates?.find(c => c.order === selectedCandidateOrder)
                          const candidateStores = (() => {
                            const ids = req.candidate_datetimes?.requestedStores?.map((s) => s.storeId) || []
                            return ids.length > 0 ? stores.filter(s => ids.includes(s.id)) : stores.filter(s => s.ownership_type !== 'office' && !s.is_temporary)
                          })()
                          return (
                            <div className="space-y-2">
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-purple-700 font-medium w-16 shrink-0 pt-2">店舗</span>
                                <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                                  <SelectTrigger className="flex-1 text-sm h-8">
                                    <SelectValue placeholder="選択してください" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {candidateStores.map(s => {
                                      const hasConflict = !!selectedCand && conflicts.storeConflict(req, approvalCandidateTime(req, selectedCand), s.id) === true
                                      const isBlocked = isCandidateStoreBlocked(selectedCand, s.id)
                                      const isRequested = req.candidate_datetimes?.requestedStores?.some((rs) => rs.storeId === s.id)
                                      return (
                                        <SelectItem
                                          key={s.id}
                                          value={s.id}
                                          className="whitespace-normal"
                                          disabled={isBlocked}
                                        >
                                          <span className="block">
                                            {s.name}
                                            {isRequested && <span className="ml-1 text-purple-600 text-xs">（お客様希望）</span>}
                                            {s.region && <span className="ml-1 text-xs text-muted-foreground">({s.region})</span>}
                                            {isBlocked && <span className="ml-1 text-red-700 text-xs">（現在受付停止中）</span>}
                                            {hasConflict && <span className="ml-1 text-orange-600 text-xs">（予約済み）</span>}
                                          </span>

                                        </SelectItem>
                                      )
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                              {(() => {
                                // その日に同じ作品を公演する店舗に対してキットが足りない場合の警告（#376）。承認は止めない。
                                const shortage = selectedCand && selectedStoreId
                                  ? conflicts.kitShortage(req, approvalCandidateTime(req, selectedCand), selectedStoreId, stores)
                                  : null
                                return shortage ? (
                                  <p className="ml-[4.5rem] text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                                    {shortage.usable === 0
                                      ? 'キット不足: 使用可能なキットがありません。キット配置管理で配置と状態を確認してください。'
                                      : `キット不足: この日は ${shortage.demand} 店舗で公演があり、使用可能なキットは ${shortage.usable} 個です。キット配置管理で配置と移動を確認してください。`}
                                  </p>
                                ) : null
                              })()}
                              {selectedStoreId && selectedCand && (
                                <div className="flex items-start gap-2">
                                  <span className="text-xs text-purple-700 font-medium w-16 shrink-0 pt-2">開始時刻</span>
                                  <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <Select value={selectedStartTime} onValueChange={setSelectedStartTime}>
                                        <SelectTrigger className="flex-1 text-sm h-8">
                                          <SelectValue placeholder="開始時刻" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {approvalStartTimeOptions.map((time) => (
                                            <SelectItem key={time} value={time}>
                                              {time}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <span className="text-xs text-muted-foreground shrink-0">〜 {approvalEndTime || selectedCand.endTime}</span>
                                    </div>
                                    {approvalStartChanged && !approvalEndTooLate && (
                                      <p className="text-xs text-purple-700">希望 {requestedStartTime} から変更。確定メールにはこの時刻が入ります。</p>
                                    )}
                                    {approvalEndTooLate && (
                                      <p className="text-xs text-red-700">終了が23:00を超えるため、もっと早い開始時刻を選んでください。</p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {selectedStoreId && (
                                <div className="flex justify-end -mt-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-purple-700 hover:text-purple-900"
                                    onClick={() => setConfirmTemplateDialogOpen(true)}
                                  >
                                    <Mail className="h-3 w-3 mr-1" />
                                    確定メールのテンプレを編集
                                  </Button>
                                </div>
                              )}
                              {/* メインGM */}
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-purple-700 font-medium w-16 shrink-0 pt-2">
                                  {(req.required_gm_count ?? 1) >= 2 ? 'メインGM' : 'GM'}
                                </span>
                                <Select value={selectedGMId} onValueChange={v => { setSelectedGMId(v); setSelectedSubGmId(p => p === v ? '' : p) }}>
                                  <SelectTrigger className="flex-1 text-sm h-8">
                                    <SelectValue placeholder="選択してください" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {gmSelectOptions.map(({ gm, isGMDisabled, label }) => (
                                      <SelectItem key={gm.id} value={gm.id}
                                        disabled={isGMDisabled || ((req.required_gm_count ?? 1) >= 2 && gm.id === selectedSubGmId)}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {/* サブGM */}
                              {(req.required_gm_count ?? 1) >= 2 && (
                                <div className="flex items-start gap-2">
                                  <span className="text-xs text-purple-700 font-medium w-16 shrink-0 pt-2">サブGM</span>
                                  <Select value={selectedSubGmId} onValueChange={setSelectedSubGmId}>
                                    <SelectTrigger className="flex-1 text-sm h-8">
                                      <SelectValue placeholder="選択してください" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {gmSelectOptions.map(({ gm, isGMDisabled, label }) => (
                                        <SelectItem key={gm.id} value={gm.id}
                                          disabled={isGMDisabled || gm.id === selectedGMId}>
                                          {label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          )
                        })()}

                      </div>
                    ) : undefined}
                    cardActionsContent={selectedRequest?.id === req.id && selectedCandidateOrder ? (
                      <ActionButtons
                        onApprove={async () => {
                          if (req.status === 'confirmed') {
                            setReapproveTarget({ req })
                            return
                          }
                          const needTwo = (req.required_gm_count ?? 1) >= 2
                          const result = await handleApprove(req.id, req, selectedGMId, needTwo ? selectedSubGmId : null, selectedStoreId, selectedCandidateOrder, stores, selectedStartTime)
                          if (result?.success) {
                            showToast.success('貸切予約を確定しました。確定メールとGM通知を送信します。')
                          } else if (result?.error) {
                            showToast.error(result.error || '処理に失敗しました')
                          }
                        }}
                        onReject={() => handleRejectClick(req.id, req)}
                        disabled={
                          submitting || !conflicts.ready || !pauses.ready ||
                          (() => {
                            const candidate = req.candidate_datetimes?.candidates?.find(c => c.order === selectedCandidateOrder)
                            if (!candidate) return true
                            const actual = approvalCandidateTime(req, candidate)
                            if (selectedStoreId && conflicts.storeConflict(req, actual, selectedStoreId) !== false) return true
                            return [selectedGMId, selectedSubGmId].filter(Boolean).some(id => {
                              const gm = allGMs.find(g => g.id === id)
                              return !gm || conflicts.gmConflict(req, actual, id, gm.name) !== false
                            })
                          })() ||
                          !selectedGMId ||
                          !selectedStoreId ||
                          !selectedCandidateOrder ||
                          ((req.required_gm_count ?? 1) >= 2 && !selectedSubGmId) ||
                          approvalEndTooLate ||
                          !selectedStartTime ||
                          isCandidateStoreBlocked(
                            (() => {
                              const candidate = req.candidate_datetimes?.candidates?.find(
                                (c) => c.order === selectedCandidateOrder
                              )
                              if (!candidate) return undefined
                              return {
                                date: candidate.date,
                                timeSlot: selectedStartTime
                                  ? startTimeToEn(selectedStartTime)
                                  : candidate.timeSlot,
                              }
                            })(),
                            selectedStoreId
                          )
                        }
                        submitting={submitting}
                      />
                    ) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </Tabs>

        <RequestConfirmDialogs
          resendDiscordTarget={resendDiscordTarget}
          setResendDiscordTarget={setResendDiscordTarget}
          runResendDiscordNotification={runResendDiscordNotification}
          reapproveTarget={reapproveTarget}
          setReapproveTarget={setReapproveTarget}
          runReapprove={runReapprove}
          deleteConfirmOpen={deleteConfirmOpen}
          setDeleteConfirmOpen={setDeleteConfirmOpen}
          runDelete={runDelete}
        />

        {/* 確定メール（private_confirm_template）のテンプレ編集ダイアログ。承認時に選んだ店舗の設定を編集 */}
        <TemplateEditDialog
          templateKey="private_confirm_template"
          storeId={selectedStoreId}
          open={confirmTemplateDialogOpen}
          onOpenChange={setConfirmTemplateDialogOpen}
        />

        <RejectRequestDialog
          showRejectDialog={showRejectDialog}
          handleRejectCancel={handleRejectCancel}
          openRejectTemplateEditor={openRejectTemplateEditor}
          resolvingRejectStore={resolvingRejectStore}
          rejectBodyLoading={rejectBodyLoading}
          rejectionReason={rejectionReason}
          setRejectionReason={setRejectionReason}
          submitting={submitting}
          handleRejectConfirm={handleRejectConfirm}
          selectedRequest={selectedRequest}
          rejectTemplateStoreId={rejectTemplateStoreId}
          rejectTemplateOrgId={rejectTemplateOrgId}
          rejectTemplateOpen={rejectTemplateOpen}
          setRejectTemplateOpen={setRejectTemplateOpen}
        />
      </div>
    </AppLayout>
  )
}

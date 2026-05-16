import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { AlertCircle, Calendar, CheckCircle, Clock, Settings, MapPin, Users } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'
import { resendPrivateBookingDiscordNotification } from '@/lib/api/privateBookingNotificationApi'

// 分離されたコンポーネント
import { BookingRequestCard } from './components/BookingRequestCard'
import { CustomerInfo } from './components/CustomerInfo'
import { CandidateDateSelector } from './components/CandidateDateSelector'
import { ActionButtons } from './components/ActionButtons'
import { SurveyResponsesView } from './components/SurveyResponsesView'


// 分離されたフック
import type { PrivateBookingRequest } from './hooks/usePrivateBookingData'
import { useBookingRequests } from './hooks/useBookingRequests'
import { useBookingApproval } from './hooks/useBookingApproval'
import { useStoreAndGMManagement } from './hooks/useStoreAndGMManagement'
import { isGmMarkedAvailable } from './utils/gmAvailabilityStatus'
import { getCurrentOrganizationId } from '@/lib/organization'
import { DateRangePopover } from '@/components/ui/date-range-popover'

// 時間帯を正規化する関数（競合キーの一貫性を保つため）
const normalizeTimeSlot = (timeSlot: string): string => {
  if (timeSlot === '午前' || timeSlot === '午後' || timeSlot === '夜') {
    return timeSlot
  }
  if (timeSlot.includes('朝') || timeSlot.includes('午前')) return '午前'
  if (timeSlot.includes('昼') || timeSlot.includes('午後')) return '午後'
  if (timeSlot.includes('夜')) return '夜'
  return timeSlot
}

type TabValue = 'gm_pending' | 'store_pending' | 'rejected' | 'all'
const VALID_TABS: TabValue[] = ['gm_pending', 'store_pending', 'rejected', 'all']

export function PrivateBookingManagement() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawTab = searchParams.get('tab')
  const activeTab: TabValue = (VALID_TABS.includes(rawTab as TabValue) ? rawTab : 'store_pending') as TabValue
  const setActiveTab = useCallback((tab: TabValue) => {
    setSearchParams({ tab }, { replace: true })
  }, [setSearchParams])
  
  // 選択状態
  const [selectedRequest, setSelectedRequest] = useState<PrivateBookingRequest | null>(null)
  const [selectedGMId, setSelectedGMId] = useState<string>('')
  const [selectedSubGmId, setSelectedSubGmId] = useState<string>('')
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [selectedCandidateOrder, setSelectedCandidateOrder] = useState<number | null>(null)
  const [displayLimit, setDisplayLimit] = useState<string>('50')  // 表示件数
  const [dateRangeStart, setDateRangeStart] = useState<string | undefined>(undefined)  // 期間フィルター開始日
  const [dateRangeEnd, setDateRangeEnd] = useState<string | undefined>(undefined)  // 期間フィルター終了日
  const [scenarioAvailableStores, setScenarioAvailableStores] = useState<string[]>([])  // シナリオ対応店舗ID
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>('all')  // 地域フィルター
  const [assignedGMIds, setAssignedGMIds] = useState<string[]>([])  // シナリオ担当GM

  // リクエストデータ管理
  const { requests, loading, loadRequests } = useBookingRequests({
    userId: user?.id,
    userRole: user?.role,
  })

  // 承認・却下・削除処理
  const {
    submitting,
    showRejectDialog,
    rejectionReason,
    setRejectionReason,
    handleApprove,
    handleRejectClick,
    handleRejectConfirm,
    handleRejectCancel,
    handleDelete
  } = useBookingApproval({
    onSuccess: () => {
      setSelectedRequest(null)
      setSelectedGMId('')
      setSelectedSubGmId('')
      setSelectedStoreId('')
      setSelectedCandidateOrder(null)
      loadRequests()
    }
  })

  // 店舗・GM管理
  const {
    stores,
    availableGMs,
    allGMs,
    conflictInfo,
    loadStores,
    loadConflictInfo,
    loadAllGMs,
    loadAvailableGMs
  } = useStoreAndGMManagement()

  // Discord通知再送信ハンドラー
  const handleResendDiscordNotification = async (cardRequest: { id: string; scenario_title: string }) => {
    const request = requests.find(r => r.id === cardRequest.id)
    if (!request) return
    
    const confirmed = window.confirm(
      `「${request.scenario_title}」のDiscord通知を再送信しますか？\n\n担当GMに新しいボタン付きメッセージが送信されます。`
    )
    if (!confirmed) return
    
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

  // スクロール位置の保存と復元
  useReportRouteScrollRestoration('private-booking-management', { isLoading: loading })

  // スタッフマスタ＋GM回答のみにいるIDを統合（一覧の取りこぼし防止）
  const mergedGmOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; avatar_color?: string | null }>()
    for (const gm of allGMs) {
      if (gm?.id) byId.set(String(gm.id), gm)
    }
    for (const ag of availableGMs) {
      const sid = ag.gm_id != null ? String(ag.gm_id) : ''
      if (!sid || byId.has(sid)) continue
      byId.set(sid, {
        id: sid,
        name: ag.gm_name || '（スタッフ名不明）',
        avatar_color: ag.avatar_color ?? null,
      })
    }
    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'ja', { sensitivity: 'base' })
    )
  }, [allGMs, availableGMs])

  // Radix Select はダイアログ内＋長い候補でビューポートが不安定になりがちなため、ネイティブ select で全件・確実にスクロール表示する
  const gmSelectOptions = useMemo(() => {
    const candidates = selectedRequest?.candidate_datetimes?.candidates
    const selectedCandidate =
      selectedCandidateOrder != null && candidates
        ? candidates.find((c: { order: number }) => c.order === selectedCandidateOrder)
        : undefined

    return mergedGmOptions
      .map((gm) => {
        const availableGM = availableGMs.find((ag) => String(ag.gm_id) === String(gm.id))
        const isAvailable = availableGM ? isGmMarkedAvailable(availableGM) : false
        const isAssigned = assignedGMIds.some((id) => String(id) === String(gm.id))
        let isGMDisabled = false
        if (selectedCandidate?.date && selectedCandidate?.timeSlot) {
          const conflictKey = `${gm.id}-${selectedCandidate.date}-${selectedCandidate.timeSlot}`
          isGMDisabled = conflictInfo.gmDateConflicts.has(conflictKey)
        }
        const gmNotes = (availableGM?.notes || '').trim()
        const tagParts: string[] = []
        if (isAssigned) tagParts.push('担当')
        if (isAvailable) tagParts.push('対応可能')
        if (isGMDisabled) tagParts.push('予約済み')
        let label = gm.name
        if (tagParts.length) label += ` [${tagParts.join('・')}]`
        if (gmNotes) label += ` — ${gmNotes}`
        const score = (isAssigned ? 2 : 0) + (isAvailable ? 1 : 0)
        return { gm, isGMDisabled, label, score }
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.gm.name.localeCompare(b.gm.name, 'ja', { sensitivity: 'base' })
      )
  }, [
    mergedGmOptions,
    availableGMs,
    assignedGMIds,
    selectedCandidateOrder,
    selectedRequest?.candidate_datetimes?.candidates,
    conflictInfo,
  ])

  // 初期データロード
  useEffect(() => {
    loadRequests()
    loadStores()
    loadAllGMs()
  }, [loadRequests, loadStores, loadAllGMs])

  // 選択されたリクエストの初期化
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined
    const initializeRequest = async () => {
      if (selectedRequest) {
        loadAllGMs()
        loadAvailableGMs(selectedRequest.id)
        await loadConflictInfo(selectedRequest.id)
        
        // 確定店舗があればそれを選択、なければ最初の希望店舗を選択
        if (selectedRequest.candidate_datetimes?.confirmedStore) {
          setSelectedStoreId(selectedRequest.candidate_datetimes.confirmedStore.storeId)
        } else if (selectedRequest.candidate_datetimes?.requestedStores && selectedRequest.candidate_datetimes.requestedStores.length > 0) {
          setSelectedStoreId(selectedRequest.candidate_datetimes.requestedStores[0].storeId)
        }
        
        // 選択可能な最初の候補を自動選択
        timer = setTimeout(() => {
          selectFirstAvailableCandidate()
        }, 150)
      }
    }
    
    initializeRequest()
    return () => { if (timer) clearTimeout(timer) }
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
          const { data: scenarioData, error } = await supabase
            .from('organization_scenarios_with_master')
            .select('available_stores, scenario_master_id')
            .eq('scenario_master_id', scenarioId)
            .eq('organization_id', orgId)
            .limit(1)
            .maybeSingle()
          
          if (error) {
            logger.error('シナリオ対応店舗取得エラー:', error)
            setScenarioAvailableStores([])
          } else {
            setScenarioAvailableStores(scenarioData?.available_stores || [])
          }
          
          const masterId = scenarioData?.scenario_master_id ?? scenarioId
          if (masterId) {
            const { data: assignmentData, error: assignmentError } = await supabase
              .from('staff_scenario_assignments')
              .select('staff_id')
              .eq('scenario_master_id', masterId)
              .or('can_main_gm.eq.true,can_sub_gm.eq.true')
            
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
  const storesByRegion = useMemo(() => {
    const grouped: Record<string, typeof filteredStores> = {}
    
    filteredStores.forEach(store => {
      const region = store.region || '未分類'
      if (!grouped[region]) {
        grouped[region] = []
      }
      grouped[region].push(store)
    })
    
    // 地域の表示順序（東京を先に、その他の地域、未分類は最後）
    const regionOrder = ['東京', '埼玉', '神奈川', '千葉', 'その他', '未分類']
    const sortedRegions = Object.keys(grouped).sort((a, b) => {
      const indexA = regionOrder.indexOf(a)
      const indexB = regionOrder.indexOf(b)
      if (indexA === -1 && indexB === -1) return a.localeCompare(b)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
    
    return { grouped, sortedRegions }
  }, [filteredStores])

  // 地域フィルターで絞り込んだ店舗リスト
  const regionFilteredStores = useMemo(() => {
    if (selectedRegionFilter === 'all') {
      return filteredStores
    }
    return filteredStores.filter(store => (store.region || '未分類') === selectedRegionFilter)
  }, [filteredStores, selectedRegionFilter])

  // 店舗またはGMが変更されたときの競合情報更新
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined
    const updateConflicts = async () => {
      if (selectedRequest) {
        await loadConflictInfo(selectedRequest.id)
        
        // 選択中の候補が競合している場合は再選択
        if (selectedCandidateOrder && selectedRequest.candidate_datetimes?.candidates) {
          const selectedCandidate = selectedRequest.candidate_datetimes.candidates.find(
            c => c.order === selectedCandidateOrder
          )
          if (selectedCandidate) {
            const normalizedSlot = normalizeTimeSlot(selectedCandidate.timeSlot)
            const storeConflictKey = selectedStoreId ? `${selectedStoreId}-${selectedCandidate.date}-${normalizedSlot}` : null
            const gmConflictKey = selectedGMId ? `${selectedGMId}-${selectedCandidate.date}-${normalizedSlot}` : null
            
            timer = setTimeout(() => {
              const hasStoreConflict = storeConflictKey && conflictInfo.storeDateConflicts.has(storeConflictKey)
              const hasGMConflict = gmConflictKey && conflictInfo.gmDateConflicts.has(gmConflictKey)
              
              if (hasStoreConflict || hasGMConflict) {
                selectFirstAvailableCandidate()
              }
            }, 100)
          }
        }
      }
    }
    
    updateConflicts()
    return () => { if (timer) clearTimeout(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId, selectedGMId])

  // 選択可能な最初の候補日時を自動選択
  const selectFirstAvailableCandidate = () => {
    if (!selectedRequest?.candidate_datetimes?.candidates) return
    
    for (const candidate of selectedRequest.candidate_datetimes.candidates) {
      const normalizedSlot = normalizeTimeSlot(candidate.timeSlot)
      const storeConflictKey = selectedStoreId ? `${selectedStoreId}-${candidate.date}-${normalizedSlot}` : null
      const gmConflictKey = selectedGMId ? `${selectedGMId}-${candidate.date}-${normalizedSlot}` : null
      
      const hasStoreConflict = storeConflictKey && conflictInfo.storeDateConflicts.has(storeConflictKey)
      const hasGMConflict = gmConflictKey && conflictInfo.gmDateConflicts.has(gmConflictKey)
      
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

  // GMが回答済みかどうかを判定（1人以上が出勤可能な候補を選択している）
  const isGMConfirmed = (r: PrivateBookingRequest): boolean => {
    if (!r.gm_responses || r.gm_responses.length === 0) return false
    // 1人以上のGMが出勤可能な候補を選択している場合はGM確認済み
    return r.gm_responses.some((response) => isGmMarkedAvailable(response))
  }
  
  // フィルタリング
  // GM確認中: pending/pending_gm かつ GM回答がまだない
  const gmPendingRequests = requests.filter(r => 
    (r.status === 'pending' || r.status === 'pending_gm') && !isGMConfirmed(r)
  )
  // 店舗承認待ち: gm_confirmed/pending_store、または pending/pending_gm でGM回答済み
  const storePendingRequests = requests.filter(r => 
    r.status === 'gm_confirmed' || r.status === 'pending_store' ||
    ((r.status === 'pending' || r.status === 'pending_gm') && isGMConfirmed(r))
  )
  // 却下済み: cancelled
  const rejectedRequests = requests.filter(r => r.status === 'cancelled')
  
  // 期間でフィルタリング（候補日の最初の日付でフィルター）
  const filterByDateRange = (reqs: PrivateBookingRequest[]) => {
    if (!dateRangeStart && !dateRangeEnd) return reqs
    return reqs.filter(req => {
      const candidates = req.candidate_datetimes?.candidates
      if (!candidates || candidates.length === 0) return false
      const firstDate = candidates[0].date
      if (!firstDate) return false
      
      // 開始日チェック
      if (dateRangeStart && firstDate < dateRangeStart) return false
      // 終了日チェック
      if (dateRangeEnd && firstDate > dateRangeEnd) return false
      
      return true
    })
  }
  
  // 表示件数でフィルタリング（created_at降順で既にソート済み）
  const applyLimit = (reqs: PrivateBookingRequest[]) => {
    if (displayLimit === 'all') return reqs
    const limit = parseInt(displayLimit, 10)
    return reqs.slice(0, limit)
  }
  
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
        : requests
  const dateFilteredRequests = filterByDateRange(baseRequests)
  const filteredRequests = applyLimit(dateFilteredRequests)

  if (loading) {
    return (
      <AppLayout
        currentPage="private-booking"
        maxWidth="max-w-[1440px]"
        containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
        stickyLayout={true}
      >
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">読み込み中...</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      currentPage="private-booking"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <div className="space-y-4">
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">貸切予約管理</span>
            </div>
          }
          description="貸切予約リクエストの承認・却下・店舗調整を行います"
        />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
            <TabsList className="w-full sm:w-auto flex-wrap">
              <TabsTrigger value="gm_pending" className="flex-1 sm:flex-initial text-xs sm:text-sm">GM確認中 ({gmPendingRequests.length})</TabsTrigger>
              <TabsTrigger value="store_pending" className="flex-1 sm:flex-initial text-xs sm:text-sm">店舗承認待ち ({storePendingRequests.length})</TabsTrigger>
              <TabsTrigger value="rejected" className="flex-1 sm:flex-initial text-xs sm:text-sm">却下済み ({rejectedRequests.length})</TabsTrigger>
              <TabsTrigger value="all" className="flex-1 sm:flex-initial text-xs sm:text-sm">全て ({requests.length})</TabsTrigger>
            </TabsList>

            <div className="w-full sm:w-auto flex justify-center sm:justify-end gap-2">
                <DateRangePopover
                  startDate={dateRangeStart}
                  endDate={dateRangeEnd}
                  onDateChange={handleDateRangeChange}
                  label={dateRangeStart || dateRangeEnd 
                    ? `${dateRangeStart || ''}〜${dateRangeEnd || ''}` 
                    : '期間指定'}
                  buttonClassName="w-[160px]"
                />
                <Select value={displayLimit} onValueChange={setDisplayLimit}>
                  <SelectTrigger className="w-[120px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">最新20件</SelectItem>
                    <SelectItem value="50">最新50件</SelectItem>
                    <SelectItem value="100">最新100件</SelectItem>
                    <SelectItem value="all">全件表示</SelectItem>
                  </SelectContent>
                </Select>
              </div>
          </div>

          {/* 予約リクエストタブ */}
          <div className="mt-0">

            {filteredRequests.length === 0 ? (
              <Card className="shadow-none border">
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  該当するリクエストがありません
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredRequests.map(req => (
                  <BookingRequestCard
                    key={req.id}
                    request={req}
                    onResendDiscordNotification={handleResendDiscordNotification}
                    selectedCandidateOrder={selectedRequest?.id === req.id ? selectedCandidateOrder : null}
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
                            const ids = req.candidate_datetimes?.requestedStores?.map((s: any) => s.storeId) || []
                            const base = ids.length > 0 ? stores.filter(s => ids.includes(s.id)) : stores.filter(s => s.ownership_type !== 'office' && !s.is_temporary)
                            if (!selectedCand) return base
                            return base.filter(s => !conflictInfo.storeDateConflicts.has(`${s.id}-${selectedCand.date}-${selectedCand.timeSlot}`))
                          })()
                          return (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-purple-700 font-medium w-16 shrink-0">店舗</span>
                                <select className="flex-1 h-8 rounded border border-input bg-background px-2 text-sm"
                                  value={selectedStoreId} onChange={e => setSelectedStoreId(e.target.value)}>
                                  <option value="">選択してください</option>
                                  {candidateStores.map(s => {
                                    const ev = selectedCand
                                      ? (conflictInfo.existingEvents || []).find(e =>
                                          e.storeId === s.id && e.date === selectedCand.date &&
                                          (selectedCand.startTime || '') < e.endTime &&
                                          (selectedCand.endTime || '') > e.startTime
                                        )
                                      : undefined
                                    const region = (s as any).region ? ` (${(s as any).region})` : ''
                                    const isRequested = req.candidate_datetimes?.requestedStores?.some((rs: any) => rs.storeId === s.id)
                                    return (
                                      <option key={s.id} value={s.id}>
                                        {s.name}{isRequested ? ' ★' : ''}{region}{ev ? ` ⚠️ ${ev.scenario} (${ev.startTime}〜${ev.endTime})` : ''}
                                      </option>
                                    )
                                  })}
                                </select>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-purple-700 font-medium w-16 shrink-0">{(req.required_gm_count ?? 1) >= 2 ? 'メインGM' : 'GM'}</span>
                                <select className="flex-1 h-8 rounded border border-input bg-background px-2 text-sm"
                                  value={selectedGMId}
                                  onChange={e => { setSelectedGMId(e.target.value); setSelectedSubGmId(p => p === e.target.value ? '' : p) }}>
                                  <option value="">選択してください</option>
                                  {gmSelectOptions.map(({ gm, isGMDisabled, label }) => (
                                    <option key={gm.id} value={gm.id} disabled={isGMDisabled || ((req.required_gm_count ?? 1) >= 2 && gm.id === selectedSubGmId)}>{label}</option>
                                  ))}
                                </select>
                              </div>
                              {(req.required_gm_count ?? 1) >= 2 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-purple-700 font-medium w-16 shrink-0">サブGM</span>
                                  <select className="flex-1 h-8 rounded border border-input bg-background px-2 text-sm"
                                    value={selectedSubGmId} onChange={e => setSelectedSubGmId(e.target.value)}>
                                    <option value="">選択してください</option>
                                    {gmSelectOptions.map(({ gm, isGMDisabled, label }) => (
                                      <option key={gm.id} value={gm.id} disabled={isGMDisabled || gm.id === selectedGMId}>{label}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        {/* アクションボタン */}
                        <ActionButtons
                          onApprove={async () => {
                            if (req.status === 'confirmed') {
                              const ok = window.confirm('この予約は既に承認済みです。内容を変更しますか？\n\n変更すると、お客様に再度確定メールが送信されます。')
                              if (!ok) return
                            }
                            const needTwo = (req.required_gm_count ?? 1) >= 2
                            const result = await handleApprove(req.id, req, selectedGMId, needTwo ? selectedSubGmId : null, selectedStoreId, selectedCandidateOrder, stores)
                            if (result && !result.success && result.error) showToast.error(getSafeErrorMessage(result.error, '処理に失敗しました'))
                          }}
                          onReject={() => handleRejectClick(req.id)}
                          onCancel={() => { setSelectedRequest(null); setSelectedGMId(''); setSelectedSubGmId(''); setSelectedStoreId(''); setSelectedCandidateOrder(null) }}
                          disabled={submitting || !selectedGMId || !selectedStoreId || !selectedCandidateOrder || ((req.required_gm_count ?? 1) >= 2 && !selectedSubGmId)}
                          submitting={submitting}
                        />
                      </div>
                    ) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </Tabs>

        {/* 削除：承認ダイアログはカードのインライン展開に移行 */}

        {/* 却下ダイアログ */}
        <Dialog open={showRejectDialog} onOpenChange={(open) => !open && handleRejectCancel()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>貸切リクエストの却下</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="block text-sm mb-2">却下理由</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={6}
                  placeholder="却下理由を入力してください"
                  className="text-sm"
                />
              </div>
              
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleRejectCancel}
                disabled={submitting}
              >
                キャンセル
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleRejectConfirm(selectedRequest)}
                disabled={submitting || !rejectionReason.trim()}
              >
                {submitting ? '処理中...' : '却下する'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  )
}

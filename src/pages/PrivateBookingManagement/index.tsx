import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { Calendar, CheckCircle, Clock, Settings, MapPin, Users } from 'lucide-react'

// サイドバーのメニュー項目定義
const PRIVATE_BOOKING_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'booking-list', label: '貸切確認一覧', icon: Calendar },
  { id: 'groups', label: 'グループ一覧', icon: Users },
  { id: 'pending', label: '承認待ち', icon: Clock },
  { id: 'approved', label: '承認済み', icon: CheckCircle },
  { id: 'settings', label: '設定', icon: Settings }
]
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useSessionState } from '@/hooks/useSessionState'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'

// 分離されたコンポーネント
import { BookingRequestCard } from './components/BookingRequestCard'
import { CustomerInfo } from './components/CustomerInfo'
import { CandidateDateSelector } from './components/CandidateDateSelector'
import { ActionButtons } from './components/ActionButtons'
import { SurveyResponsesView } from './components/SurveyResponsesView'
import { PrivateGroupList } from './components/PrivateGroupList'

// 分離されたフック
import type { PrivateBookingRequest } from './hooks/usePrivateBookingData'
import { useBookingRequests } from './hooks/useBookingRequests'
import { useBookingApproval } from './hooks/useBookingApproval'
import { useStoreAndGMManagement } from './hooks/useStoreAndGMManagement'
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

export function PrivateBookingManagement() {
  const { user } = useAuth()
  const [sidebarActiveTab, setSidebarActiveTab] = useState('booking-list')
  
  // タブ状態（sessionStorageと同期）
  const [activeTab, setActiveTab] = useSessionState<'gm_pending' | 'store_pending' | 'all' | 'groups'>('privateBookingActiveTab', 'store_pending')
  
  // タブとサイドバーを同期
  useEffect(() => {
    if (activeTab === 'groups') {
      setSidebarActiveTab('groups')
    } else {
      setSidebarActiveTab('booking-list')
    }
  }, [activeTab])
  
  // 選択状態
  const [selectedRequest, setSelectedRequest] = useState<PrivateBookingRequest | null>(null)
  const [selectedGMId, setSelectedGMId] = useState<string>('')
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

  // スクロール位置の保存と復元
  useReportRouteScrollRestoration('private-booking-management', { isLoading: loading })

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
      const scenarioId = (selectedRequest as any)?.scenario_master_id ?? selectedRequest?.scenario_id
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
          
          // 担当GMを取得（staff_scenario_assignmentsテーブルを使用）
          // scenario_idはscenario_master_idを参照している
          const masterId = scenarioData?.scenario_master_id ?? scenarioId
          if (masterId) {
            const { data: assignmentData, error: assignmentError } = await supabase
              .from('staff_scenario_assignments')
              .select('staff_id')
              .eq('scenario_id', masterId)
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
  }, [(selectedRequest as any)?.scenario_master_id ?? selectedRequest?.scenario_id])

  // シナリオ対応店舗でフィルタリングした店舗リスト
  const filteredStores = useMemo(() => {
    // オフィスを除外
    const validStores = stores.filter(s => s.ownership_type !== 'office')
    
    // シナリオに対応店舗が設定されている場合のみフィルタリング
    if (scenarioAvailableStores.length > 0) {
      return validStores.filter(s => scenarioAvailableStores.includes(s.id))
    }
    
    // 設定されていない場合は全店舗（オフィス除く）
    return validStores
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

  // フィルタリング
  // GM確認中: pending, pending_gm
  const gmPendingRequests = requests.filter(r => 
    r.status === 'pending' || r.status === 'pending_gm'
  )
  // 店舗承認待ち: gm_confirmed, pending_store
  const storePendingRequests = requests.filter(r => 
    r.status === 'gm_confirmed' || r.status === 'pending_store'
  )
  
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
      : requests
  const dateFilteredRequests = filterByDateRange(baseRequests)
  const filteredRequests = applyLimit(dateFilteredRequests)

  if (loading) {
    return (
      <AppLayout
        currentPage="private-booking"
        sidebar={
          <UnifiedSidebar
            title="貸切確認"
            mode="list"
            menuItems={PRIVATE_BOOKING_MENU_ITEMS}
            activeTab={sidebarActiveTab}
            onTabChange={setSidebarActiveTab}
          />
        }
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
      sidebar={
        <UnifiedSidebar
          title="貸切確認"
          mode="list"
          menuItems={PRIVATE_BOOKING_MENU_ITEMS}
          activeTab={sidebarActiveTab}
          onTabChange={(tab) => {
            setSidebarActiveTab(tab)
            if (tab === 'groups') {
              setActiveTab('groups')
            } else if (tab === 'booking-list') {
              setActiveTab('all')
            }
          }}
        />
      }
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

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'gm_pending' | 'store_pending' | 'all' | 'groups')}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
            <TabsList className="w-full sm:w-auto flex-wrap">
              <TabsTrigger value="gm_pending" className="flex-1 sm:flex-initial text-xs sm:text-sm">GM確認中 ({gmPendingRequests.length})</TabsTrigger>
              <TabsTrigger value="store_pending" className="flex-1 sm:flex-initial text-xs sm:text-sm">店舗承認待ち ({storePendingRequests.length})</TabsTrigger>
              <TabsTrigger value="all" className="flex-1 sm:flex-initial text-xs sm:text-sm">全て ({requests.length})</TabsTrigger>
              <TabsTrigger value="groups" className="flex-1 sm:flex-initial text-xs sm:text-sm">グループ一覧</TabsTrigger>
            </TabsList>
            
            {activeTab !== 'groups' && (
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
            )}
          </div>

          {/* グループ一覧タブ */}
          <TabsContent value="groups" className="mt-0">
            <PrivateGroupList />
          </TabsContent>

          {/* 予約リクエストタブ */}
          <TabsContent value={activeTab === 'groups' ? '' : activeTab} className="mt-0">

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
                    onSelectRequest={() => setSelectedRequest(req)}
                    showActionButton={true}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* 選択されたリクエストの詳細モーダル */}
        <Dialog 
          open={!!selectedRequest} 
          onOpenChange={(open) => {
            if (!open) {
              setSelectedRequest(null)
              setSelectedGMId('')
              setSelectedStoreId('')
              setSelectedCandidateOrder(null)
            }
          }}
        >
          <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg pr-6">リクエスト詳細 - {selectedRequest?.scenario_title}</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-3">
              <CustomerInfo request={selectedRequest} />
              
              {/* アンケート回答閲覧 */}
              <SurveyResponsesView
                reservationId={selectedRequest.id}
                scenarioId={(selectedRequest as any).scenario_master_id || selectedRequest.scenario_id || ''}
              />
              
              <CandidateDateSelector
                candidates={selectedRequest.candidate_datetimes?.candidates || []}
                selectedCandidateOrder={selectedCandidateOrder}
                onSelectCandidate={setSelectedCandidateOrder}
                selectedStoreId={selectedStoreId}
                selectedGMId={selectedGMId}
                conflictInfo={conflictInfo}
                gmSelectedCandidates={
                  // 選択されたGMが回答した候補を参考表示（紫色で表示）
                  (() => {
                    if (!selectedRequest.gm_responses || selectedRequest.gm_responses.length === 0) {
                      return undefined
                    }
                    // 選択されたGMの回答を取得
                    const selectedGMResponse = selectedGMId 
                      ? selectedRequest.gm_responses.find(r => r.staff_id === selectedGMId)
                      : selectedRequest.gm_responses[0]
                    return selectedGMResponse?.available_candidates 
                      ? selectedGMResponse.available_candidates.map(idx => idx + 1) // 0始まり→1始まりに変換
                      : undefined
                  })()
                }
                gmResponses={availableGMs} // 全GMの回答情報を渡す
                isReadOnly={false} // 確定済みでも編集可能に
                isConfirmed={selectedRequest.status === 'confirmed'}
                stores={stores.filter(s => s.ownership_type !== 'office')} // 全店舗の空き状況表示用（オフィス除く）
              />

              {/* 開催店舗の選択 */}
              <div className="pt-3 border-t">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-purple-800">
                  <MapPin className="w-4 h-4" />
                  開催店舗の選択
                </h3>
                
                {/* 地域フィルター */}
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRegionFilter('all')}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      selectedRegionFilter === 'all'
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-background border-gray-300 hover:border-purple-400'
                    }`}
                  >
                    全て
                  </button>
                  {storesByRegion.sortedRegions.map((region) => (
                    <button
                      key={region}
                      type="button"
                      onClick={() => setSelectedRegionFilter(region)}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        selectedRegionFilter === region
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-background border-gray-300 hover:border-purple-400'
                      }`}
                    >
                      {region} ({storesByRegion.grouped[region]?.length || 0})
                    </button>
                  ))}
                </div>
                
                <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="店舗を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {regionFilteredStores.map((store) => {
                      const requestedStores = selectedRequest.candidate_datetimes?.requestedStores || []
                      const isAllStoresRequested = requestedStores.length === 0
                      const isRequested = isAllStoresRequested || requestedStores.some(rs => rs.storeId === store.id)
                      
                      // 選択した候補日時でこの店舗の既存イベントを取得
                      let existingEventLabel = ''
                      let isStoreDisabled = false
                      if (selectedCandidateOrder && selectedRequest.candidate_datetimes?.candidates) {
                        const selectedCandidate = selectedRequest.candidate_datetimes.candidates.find(
                          (c: any) => c.order === selectedCandidateOrder
                        )
                        if (selectedCandidate) {
                          const conflictKey = `${store.id}-${selectedCandidate.date}-${selectedCandidate.timeSlot}`
                          isStoreDisabled = conflictInfo.storeDateConflicts.has(conflictKey)
                          
                          // 既存イベントの詳細を取得（時間帯の重複チェック）
                          const eventsForStore = (conflictInfo.existingEvents || []).filter(e => 
                            e.storeId === store.id && e.date === selectedCandidate.date
                          )
                          
                          // 時間帯の重複をチェック
                          const existingEvent = eventsForStore.find(e => {
                            const candidateStart = selectedCandidate.startTime || ''
                            const candidateEnd = selectedCandidate.endTime || ''
                            const overlaps = candidateStart < e.endTime && candidateEnd > e.startTime
                            return overlaps
                          })
                          
                          if (existingEvent) {
                            existingEventLabel = ` ⚠️ ${existingEvent.scenario} (${existingEvent.startTime}〜${existingEvent.endTime})`
                          }
                        }
                      }
                      
                      return (
                        <SelectItem 
                          key={store.id} 
                          value={store.id}
                          disabled={isStoreDisabled}
                          className="whitespace-normal"
                        >
                          <span className="block">
                            {store.name}
                            {isRequested && ' (お客様希望)'}
                            {selectedRegionFilter === 'all' && store.region && (
                              <span className="text-xs text-muted-foreground ml-1">({store.region})</span>
                            )}
                          </span>
                          {existingEventLabel && (
                            <span className="block text-xs text-orange-600 font-medium">
                              {existingEventLabel}
                            </span>
                          )}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <div className="mt-2 text-xs text-muted-foreground">
                  {selectedRequest.candidate_datetimes?.requestedStores?.length === 0 ? (
                    <span>ℹ️ お客様は全ての店舗を希望しています</span>
                  ) : (selectedRequest.candidate_datetimes?.requestedStores?.length ?? 0) > 0 ? (
                    <span>ℹ️ (お客様希望) の店舗がお客様の希望店舗です / ⚠️ は既存公演</span>
                  ) : null}
                </div>
              </div>

              {/* 顧客メモ */}
              {selectedRequest.notes && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-purple-800">お客様からのメモ</h3>
                  <div className="p-3 bg-background rounded-lg border">
                    <p className="text-sm whitespace-pre-wrap">{selectedRequest.notes}</p>
                  </div>
                </div>
              )}

              {/* 担当GMの選択 */}
              <div className="pt-3 border-t">
                <h3 className="mb-2 text-sm font-medium text-purple-800">担当GMを選択してください</h3>
                <Select value={selectedGMId} onValueChange={setSelectedGMId}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="GMを選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...allGMs]
                      .map((gm) => {
                        const availableGM = availableGMs.find(ag => ag.gm_id === gm.id)
                        const isAvailable = availableGM?.response_status === 'available'
                        const isAssigned = assignedGMIds.includes(gm.id)
                        return { gm, availableGM, isAvailable, isAssigned }
                      })
                      .sort((a, b) => {
                        // 担当かつ対応可能 > 対応可能 > 担当 > その他
                        const scoreA = (a.isAssigned ? 2 : 0) + (a.isAvailable ? 1 : 0)
                        const scoreB = (b.isAssigned ? 2 : 0) + (b.isAvailable ? 1 : 0)
                        return scoreB - scoreA
                      })
                      .map(({ gm, availableGM, isAvailable, isAssigned }) => {
                        const gmNotes = availableGM?.notes || ''
                        
                        let isGMDisabled = false
                        if (selectedCandidateOrder && selectedRequest.candidate_datetimes?.candidates) {
                          const selectedCandidate = selectedRequest.candidate_datetimes.candidates.find(
                            c => c.order === selectedCandidateOrder
                          )
                          if (selectedCandidate) {
                            const conflictKey = `${gm.id}-${selectedCandidate.date}-${selectedCandidate.timeSlot}`
                            isGMDisabled = conflictInfo.gmDateConflicts.has(conflictKey)
                          }
                        }
                        
                        return (
                          <SelectItem 
                            key={gm.id} 
                            value={gm.id}
                            disabled={isGMDisabled}
                          >
                            <span className="flex items-center gap-2">
                              {gm.name}
                              {isAssigned && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                                  担当
                                </span>
                              )}
                              {isAvailable && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                                  対応可能
                                </span>
                              )}
                              {gmNotes && <span className="text-muted-foreground">- {gmNotes}</span>}
                              {isGMDisabled && <span className="text-destructive">- 予約済み</span>}
                            </span>
                          </SelectItem>
                        )
                      })}
                  </SelectContent>
                </Select>
                {(assignedGMIds.length > 0 || availableGMs.length > 0) && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    ℹ️ <span className="inline-flex items-center px-1 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">担当</span> このシナリオの担当GM / <span className="inline-flex items-center px-1 py-0.5 text-xs bg-green-100 text-green-700 rounded">対応可能</span> 今回対応可能と回答したGM
                  </div>
                )}
              </div>

              <div className="pt-3 border-t">
                <ActionButtons
                  onApprove={async () => {
                    // 既に承認済みの場合は確認ダイアログを表示
                    if (selectedRequest.status === 'gm_confirmed' || selectedRequest.status === 'confirmed') {
                      const confirmed = window.confirm('この予約は既に承認済みです。内容を変更しますか？\n\n変更すると、お客様に再度確定メールが送信されます。')
                      if (!confirmed) return
                    }
                    const result = await handleApprove(
                      selectedRequest.id,
                      selectedRequest,
                      selectedGMId,
                      selectedStoreId,
                      selectedCandidateOrder,
                      stores
                    )
                    if (result && !result.success && result.error) {
                      showToast.error(getSafeErrorMessage(result.error, '処理に失敗しました'))
                    }
                  }}
                  onReject={() => handleRejectClick(selectedRequest.id)}
                  onCancel={() => {
                    setSelectedRequest(null)
                    setSelectedGMId('')
                    setSelectedStoreId('')
                    setSelectedCandidateOrder(null)
                  }}
                  onDelete={() => handleDelete(selectedRequest.id)}
                  disabled={submitting || !selectedGMId || !selectedStoreId || !selectedCandidateOrder}
                  submitting={submitting}
                />
              </div>
            </div>
            )}
          </DialogContent>
        </Dialog>

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

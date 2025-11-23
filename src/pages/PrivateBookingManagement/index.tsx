import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { Calendar, CheckCircle, Clock, Settings, MapPin } from 'lucide-react'

// サイドバーのメニュー項目定義
const PRIVATE_BOOKING_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'booking-list', label: '貸切確認一覧', icon: Calendar, description: 'すべての貸切予約を表示' },
  { id: 'pending', label: '承認待ち', icon: Clock, description: '承認待ち予約' },
  { id: 'approved', label: '承認済み', icon: CheckCircle, description: '承認済み予約' },
  { id: 'settings', label: '設定', icon: Settings, description: '表示設定' }
]
import { MonthSwitcher } from '@/components/patterns/calendar'
import { useAuth } from '@/contexts/AuthContext'
import { useSessionState } from '@/hooks/useSessionState'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { logger } from '@/utils/logger'

// 分離されたコンポーネント
import { BookingRequestCard } from './components/BookingRequestCard'
import { CustomerInfo } from './components/CustomerInfo'
import { CandidateDateSelector } from './components/CandidateDateSelector'
import { ActionButtons } from './components/ActionButtons'

// 分離されたフック
import type { PrivateBookingRequest } from './hooks/usePrivateBookingData'
import { useBookingRequests } from './hooks/useBookingRequests'
import { useBookingApproval } from './hooks/useBookingApproval'
import { useStoreAndGMManagement } from './hooks/useStoreAndGMManagement'

// ユーティリティ
// formatMonthYearは未使用のため削除

export function PrivateBookingManagement() {
  const { user } = useAuth()
  const [sidebarActiveTab, setSidebarActiveTab] = useState('booking-management')
  
  // タブ状態（sessionStorageと同期）
  const [activeTab, setActiveTab] = useSessionState<'pending' | 'all'>('privateBookingActiveTab', 'pending')
  
  // 選択状態
  const [selectedRequest, setSelectedRequest] = useState<PrivateBookingRequest | null>(null)
  const [selectedGMId, setSelectedGMId] = useState<string>('')
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [selectedCandidateOrder, setSelectedCandidateOrder] = useState<number | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())

  // リクエストデータ管理
  const { requests, loading, loadRequests, filterByMonth } = useBookingRequests({
    userId: user?.id,
    userRole: user?.role,
    activeTab
  })

  // 承認・却下処理
  const {
    submitting,
    showRejectDialog,
    rejectionReason,
    setRejectionReason,
    handleApprove,
    handleRejectClick,
    handleRejectConfirm,
    handleRejectCancel
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
  useScrollRestoration({ pageKey: 'privateBooking', isLoading: loading })

  // 初期データロード
  useEffect(() => {
    loadRequests()
    loadStores()
    loadAllGMs()
  }, [activeTab, loadRequests, loadStores, loadAllGMs])

  // 選択されたリクエストの初期化
  useEffect(() => {
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
        setTimeout(() => {
          selectFirstAvailableCandidate()
        }, 150)
      }
    }
    
    initializeRequest()
  }, [selectedRequest])

  // 店舗またはGMが変更されたときの競合情報更新
  useEffect(() => {
    const updateConflicts = async () => {
      if (selectedRequest) {
        await loadConflictInfo(selectedRequest.id)
        
        // 選択中の候補が競合している場合は再選択
        if (selectedCandidateOrder && selectedRequest.candidate_datetimes?.candidates) {
          const selectedCandidate = selectedRequest.candidate_datetimes.candidates.find(
            c => c.order === selectedCandidateOrder
          )
          if (selectedCandidate) {
            const storeConflictKey = selectedStoreId ? `${selectedStoreId}-${selectedCandidate.date}-${selectedCandidate.timeSlot}` : null
            const gmConflictKey = selectedGMId ? `${selectedGMId}-${selectedCandidate.date}-${selectedCandidate.timeSlot}` : null
            
            setTimeout(() => {
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
  }, [selectedStoreId, selectedGMId])

  // 選択可能な最初の候補日時を自動選択
  const selectFirstAvailableCandidate = () => {
    if (!selectedRequest?.candidate_datetimes?.candidates) return
    
    for (const candidate of selectedRequest.candidate_datetimes.candidates) {
      const storeConflictKey = selectedStoreId ? `${selectedStoreId}-${candidate.date}-${candidate.timeSlot}` : null
      const gmConflictKey = selectedGMId ? `${selectedGMId}-${candidate.date}-${candidate.timeSlot}` : null
      
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

  // 月切り替え（MonthSwitcher に移行）

  // フィルタリング
  const pendingRequests = requests.filter(r => 
    r.status === 'pending' || r.status === 'pending_gm' || r.status === 'gm_confirmed' || r.status === 'pending_store'
  )
  const allRequests = filterByMonth(requests, currentDate)
  const filteredRequests = activeTab === 'pending' ? filterByMonth(pendingRequests, currentDate) : allRequests

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
          onTabChange={setSidebarActiveTab}
        />
      }
      maxWidth="max-w-[1600px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <div className="space-y-3 sm:space-y-4 md:space-y-6">
        <PageHeader
          title="貸切予約管理"
          description="貸切予約リクエストの承認・却下・店舗調整を行います"
        />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'pending' | 'all')}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="pending" className="text-xs sm:text-sm">店舗確認待ち ({pendingRequests.length})</TabsTrigger>
              <TabsTrigger value="all" className="text-xs sm:text-sm">全て ({requests.length})</TabsTrigger>
            </TabsList>
            
            {activeTab === 'pending' && (
              <div className="flex-shrink-0">
                <MonthSwitcher
                  value={currentDate}
                  onChange={setCurrentDate}
                  showToday
                  quickJump
                  enableKeyboard
                />
              </div>
            )}
          </div>

          <TabsContent value={activeTab} className="mt-0">

            {filteredRequests.length === 0 ? (
              <Card>
                <CardContent className="py-8 sm:py-12 text-center text-muted-foreground text-xs sm:text-sm p-3 sm:p-4 md:p-6">
                  該当するリクエストがありません
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:gap-4">
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
        {selectedRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto" data-detail-section>
              <CardHeader className="sticky top-0 bg-background z-10 border-b p-3 sm:p-4 md:p-6">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base md:text-lg break-words">リクエスト詳細 - {selectedRequest.scenario_title}</CardTitle>
                  <button
                    onClick={() => {
                      setSelectedRequest(null)
                      setSelectedGMId('')
                      setSelectedStoreId('')
                      setSelectedCandidateOrder(null)
                    }}
                    className="p-1 sm:p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                    aria-label="閉じる"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6">
              <CustomerInfo request={selectedRequest} />
              
              <CandidateDateSelector
                candidates={selectedRequest.candidate_datetimes?.candidates || []}
                selectedCandidateOrder={selectedCandidateOrder}
                onSelectCandidate={setSelectedCandidateOrder}
                selectedStoreId={selectedStoreId}
                selectedGMId={selectedGMId}
                conflictInfo={conflictInfo}
              />

              {/* 開催店舗の選択 */}
              <div className="pt-6 border-t">
                <h3 className="mb-3 flex items-center gap-2 text-purple-800">
                  <MapPin className="w-4 h-4" />
                  開催店舗の選択
                </h3>
                <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="店舗を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => {
                      const requestedStores = selectedRequest.candidate_datetimes?.requestedStores || []
                      const isAllStoresRequested = requestedStores.length === 0
                      const isRequested = isAllStoresRequested || requestedStores.some(rs => rs.storeId === store.id)
                      
                      let isStoreDisabled = false
                      if (selectedCandidateOrder && selectedRequest.candidate_datetimes?.candidates) {
                        const selectedCandidate = selectedRequest.candidate_datetimes.candidates.find(
                          c => c.order === selectedCandidateOrder
                        )
                        if (selectedCandidate) {
                          const conflictKey = `${store.id}-${selectedCandidate.date}-${selectedCandidate.timeSlot}`
                          isStoreDisabled = conflictInfo.storeDateConflicts.has(conflictKey)
                          
                          if (isStoreDisabled) {
                            logger.log(`🚫 店舗競合: ${store.name} (${conflictKey})`)
                          }
                        }
                      }
                      
                      return (
                        <SelectItem 
                          key={store.id} 
                          value={store.id}
                          disabled={isStoreDisabled}
                        >
                          {store.name}
                          {isRequested && ' (お客様希望)'}
                          {isStoreDisabled && ' - 予約済み'}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <div className="mt-2 text-xs text-muted-foreground">
                  {selectedRequest.candidate_datetimes?.requestedStores?.length === 0 ? (
                    <span>ℹ️ お客様は全ての店舗を希望しています</span>
                  ) : (selectedRequest.candidate_datetimes?.requestedStores?.length ?? 0) > 0 ? (
                    <span>ℹ️ (お客様希望) の店舗がお客様の希望店舗です</span>
                  ) : null}
                </div>
              </div>

              {/* 顧客メモ */}
              {selectedRequest.notes && (
                <div>
                  <h3 className="mb-3 text-purple-800">お客様からのメモ</h3>
                  <div className="p-4 bg-background rounded-lg border">
                    <p className="text-sm whitespace-pre-wrap">{selectedRequest.notes}</p>
                  </div>
                </div>
              )}

              {/* 担当GMの選択 */}
              <div className="pt-6 border-t">
                <h3 className="mb-3 text-purple-800">担当GMを選択してください</h3>
                <Select value={selectedGMId} onValueChange={setSelectedGMId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="GMを選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {allGMs.map((gm) => {
                      const availableGM = availableGMs.find(ag => ag.gm_id === gm.id)
                      const isAvailable = availableGM?.response_type === 'available'
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
                          {gm.name}
                          {isAvailable && ' (対応可能)'}
                          {gmNotes && ` - ${gmNotes}`}
                          {isGMDisabled && ' - 予約済み'}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {availableGMs.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    ℹ️ (対応可能) がこのシナリオに対応可能なGMです
                  </div>
                )}
              </div>

              <ActionButtons
                onApprove={() => handleApprove(
                  selectedRequest.id,
                  selectedRequest,
                  selectedGMId,
                  selectedStoreId,
                  selectedCandidateOrder,
                  stores
                )}
                onReject={() => handleRejectClick(selectedRequest.id)}
                onCancel={() => {
                  setSelectedRequest(null)
                  setSelectedGMId('')
                  setSelectedStoreId('')
                  setSelectedCandidateOrder(null)
                }}
                disabled={submitting || !selectedGMId || !selectedStoreId || !selectedCandidateOrder}
              />
            </CardContent>
          </Card>
          </div>
        )}

        {/* 却下ダイアログ */}
        {showRejectDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2 sm:p-4">
            <Card className="w-full max-w-lg">
              <CardHeader className="p-3 sm:p-4 md:p-6">
                <CardTitle className="text-base md:text-lg">貸切リクエストの却下</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-4 md:p-6">
                <div>
                  <Label className="block text-xs sm:text-sm mb-1 sm:mb-2">却下理由</Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={6}
                    placeholder="却下理由を入力してください"
                    className="text-xs sm:text-sm"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2 justify-end">
                  <button
                    onClick={handleRejectCancel}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 border rounded hover:bg-gray-100 text-xs sm:text-sm"
                    disabled={submitting}
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={() => handleRejectConfirm(selectedRequest)}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-red-600 text-white rounded hover:bg-red-700 text-xs sm:text-sm"
                    disabled={submitting || !rejectionReason.trim()}
                  >
                    {submitting ? '処理中...' : '却下する'}
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

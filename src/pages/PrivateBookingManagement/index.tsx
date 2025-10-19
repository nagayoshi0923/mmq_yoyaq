import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSessionState } from '@/hooks/useSessionState'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'

// 分離されたコンポーネント
import { BookingRequestCard } from './components/BookingRequestCard'
import { CustomerInfo } from './components/CustomerInfo'
import { CandidateDateSelector } from './components/CandidateDateSelector'
import { StoreSelector } from './components/StoreSelector'
import { GMSelector } from './components/GMSelector'
import { ActionButtons } from './components/ActionButtons'

// 分離されたフック
import type { PrivateBookingRequest } from './hooks/usePrivateBookingData'
import { useBookingRequests } from './hooks/useBookingRequests'
import { useBookingApproval } from './hooks/useBookingApproval'
import { useStoreAndGMManagement } from './hooks/useStoreAndGMManagement'

// ユーティリティ
import { formatMonthYear } from './utils/bookingFormatters'

export function PrivateBookingManagement() {
  const { user } = useAuth()
  
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

  // 月切り替え
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  // フィルタリング
  const pendingRequests = requests.filter(r => 
    r.status === 'pending' || r.status === 'pending_gm' || r.status === 'gm_confirmed' || r.status === 'pending_store'
  )
  const allRequests = filterByMonth(requests, currentDate)
  const filteredRequests = activeTab === 'pending' ? filterByMonth(pendingRequests, currentDate) : allRequests

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="private-booking" />
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="private-booking" />

      <div className="container mx-auto max-w-7xl px-6 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">貸切リクエスト管理</h1>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'pending' | 'all')}>
          <TabsList>
            <TabsTrigger value="pending">店舗確認待ち ({pendingRequests.length})</TabsTrigger>
            <TabsTrigger value="all">全て ({requests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {activeTab === 'pending' && (
              <div className="flex justify-between items-center mb-4">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">{formatMonthYear(currentDate)}</h2>
                <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {filteredRequests.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  該当するリクエストがありません
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredRequests.map(req => (
                  <BookingRequestCard
                    key={req.id}
                    request={req}
                    isSelected={selectedRequest?.id === req.id}
                    onSelect={() => setSelectedRequest(req)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* 選択されたリクエストの詳細 */}
        {selectedRequest && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>リクエスト詳細</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <CustomerInfo request={selectedRequest} />
              
              <CandidateDateSelector
                request={selectedRequest}
                selectedOrder={selectedCandidateOrder}
                onSelect={setSelectedCandidateOrder}
                selectedStoreId={selectedStoreId}
                selectedGMId={selectedGMId}
                conflictInfo={conflictInfo}
              />

              <StoreSelector
                stores={stores}
                selectedStoreId={selectedStoreId}
                onSelect={setSelectedStoreId}
                requestedStores={selectedRequest.candidate_datetimes?.requestedStores || []}
                candidates={selectedRequest.candidate_datetimes?.candidates || []}
                conflictInfo={conflictInfo}
              />

              <GMSelector
                availableGMs={availableGMs}
                allGMs={allGMs}
                selectedGMId={selectedGMId}
                onSelect={setSelectedGMId}
                candidates={selectedRequest.candidate_datetimes?.candidates || []}
                conflictInfo={conflictInfo}
              />

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
        )}

        {/* 却下ダイアログ */}
        {showRejectDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-lg">
              <CardHeader>
                <CardTitle>貸切リクエストの却下</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">却下理由</label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={8}
                    placeholder="却下理由を入力してください"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={handleRejectCancel}
                    className="px-4 py-2 border rounded hover:bg-gray-100"
                    disabled={submitting}
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleRejectConfirm}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
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
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { UserCheck } from 'lucide-react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { ConfirmDialog } from '@/components/patterns/modal'
import { useAuth } from '@/contexts/AuthContext'
import { useGMRequests } from './hooks/useGMRequests'
import { useAvailabilityCheck } from './hooks/useAvailabilityCheck'
import { useResponseSubmit } from './hooks/useResponseSubmit'
import { RequestCard } from './components/RequestCard'
import { formatMonthYear } from './utils/gmFormatters'

/**
 * GM可否確認ページ
 */
export function GMAvailabilityCheck() {
  const { user } = useAuth()

  // フック
  const {
    requests,
    isLoading,
    stores,
    staffName,
    activeTab,
    setActiveTab,
    currentDate,
    setCurrentDate,
    selectedCandidates,
    notes,
    setNotes,
    loadGMRequests,
    toggleCandidate,
    pendingRequests,
    allRequests
  } = useGMRequests({ userId: user?.id })

  const {
    candidateAvailability,
    gmScheduleConflicts,
    updateCandidateAvailability
  } = useAvailabilityCheck()

  // 編集モード状態
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)

  // 編集開始時に既存の回答を選択状態にセット
  const handleStartEdit = useCallback((request: any) => {
    setEditingRequestId(request.id)
    // 既存の選択を復元（0始まり→1始まりに変換）
    const existingCandidates = (request.available_candidates || []).map((c: number) => c + 1)
    // toggleCandidate を使って選択状態を設定
    existingCandidates.forEach((order: number) => {
      const current = selectedCandidates[request.id] || []
      if (!current.includes(order)) {
        toggleCandidate(request.id, order)
      }
    })
  }, [selectedCandidates, toggleCandidate])

  const handleCancelEdit = useCallback(() => {
    setEditingRequestId(null)
  }, [])

  const {
    submitting,
    handleSubmit,
    conflictConfirmOpen,
    conflictConfirmOrders,
    setConflictConfirmOpen,
    confirmSubmitDespiteConflict
  } = useResponseSubmit({
    requests,
    selectedCandidates,
    gmScheduleConflicts,
    notes,
    onSubmitSuccess: loadGMRequests
  })

  // リクエストが読み込まれた後、店舗情報に基づいて候補の利用可能性をチェック
  useEffect(() => {
    requests.forEach(request => {
      const storeId = request.candidate_datetimes?.confirmedStore?.storeId || 
                     request.candidate_datetimes?.requestedStores?.[0]?.storeId
      if (storeId) {
        updateCandidateAvailability(request, storeId, staffName || undefined)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, stores, staffName])

  if (isLoading) {
    return (
      <AppLayout
        currentPage="gm-availability"
        maxWidth="max-w-[1440px]"
        containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
        stickyLayout={true}
      >
        <div className="text-center py-12">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      currentPage="gm-availability"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <div className="space-y-4">
        <PageHeader
          title={<><UserCheck className="h-5 w-5 text-primary" />GM可否確認</>}
          description="貸切予約のGM可否を確認・回答します"
        />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'pending' | 'all')} className="w-full">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="pending" className="flex-1 sm:flex-initial text-xs sm:text-sm">未回答 ({pendingRequests.length})</TabsTrigger>
              <TabsTrigger value="all" className="flex-1 sm:flex-initial text-xs sm:text-sm">全て ({requests.length})</TabsTrigger>
            </TabsList>
            
            <div className="w-full sm:w-auto flex justify-center sm:justify-end">
              <MonthSwitcher
                value={currentDate}
                onChange={setCurrentDate}
                showToday
                quickJump
                enableKeyboard
              />
            </div>
          </div>

          {/* 未回答タブ */}
          <TabsContent value="pending" className="mt-0">
            {pendingRequests.length === 0 ? (
              <Card className="shadow-none border">
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  未回答のリクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => {
                  const isResponded = request.response_status === 'available' || request.response_status === 'all_unavailable'
                  const isConfirmed = request.reservation_status === 'confirmed'
                  const isGMConfirmed = request.reservation_status === 'gm_confirmed'
                  const isEditing = editingRequestId === request.id
                  
                  return (
                    <RequestCard
                      key={request.id}
                      request={request}
                      selectedCandidates={
                        (isResponded || isConfirmed) && !isEditing
                          ? (request.available_candidates || []).map(idx => idx + 1) // 0始まり→1始まりに変換
                          : selectedCandidates[request.id] || []
                      }
                      candidateAvailability={candidateAvailability[request.id] || {}}
                      gmScheduleConflicts={gmScheduleConflicts[request.id] || {}}
                      notes={notes[request.id] || ''}
                      submitting={submitting === request.id}
                      isEditing={isEditing}
                      onToggleCandidate={(order) => toggleCandidate(request.id, order)}
                      onNotesChange={(value) => setNotes({ ...notes, [request.id]: value })}
                      onSubmit={(allUnavailable) => {
                        handleSubmit(request.id, allUnavailable)
                        setEditingRequestId(null)
                      }}
                      onStartEdit={() => handleStartEdit(request)}
                      onCancelEdit={handleCancelEdit}
                    />
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* 全てのリクエストタブ（月別） */}
          <TabsContent value="all" className="mt-0">
            {allRequests.length === 0 ? (
              <Card className="shadow-none border">
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  {formatMonthYear(currentDate)}のリクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {allRequests.map((request) => {
                  const isResponded = request.response_status === 'available' || request.response_status === 'all_unavailable'
                  const isConfirmed = request.reservation_status === 'confirmed'
                  const isGMConfirmed = request.reservation_status === 'gm_confirmed'
                  const isEditing = editingRequestId === request.id
                  
                  return (
                    <RequestCard
                      key={request.id}
                      request={request}
                      selectedCandidates={
                        (isResponded || isConfirmed) && !isEditing
                          ? (request.available_candidates || []).map(idx => idx + 1) // 0始まり→1始まりに変換
                          : selectedCandidates[request.id] || []
                      }
                      candidateAvailability={candidateAvailability[request.id] || {}}
                      gmScheduleConflicts={gmScheduleConflicts[request.id] || {}}
                      notes={notes[request.id] || ''}
                      submitting={submitting === request.id}
                      isEditing={isEditing}
                      onToggleCandidate={(order) => toggleCandidate(request.id, order)}
                      onNotesChange={(value) => setNotes({ ...notes, [request.id]: value })}
                      onSubmit={(allUnavailable) => {
                        handleSubmit(request.id, allUnavailable)
                        setEditingRequestId(null)
                      }}
                      onStartEdit={() => handleStartEdit(request)}
                      onCancelEdit={handleCancelEdit}
                    />
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* 既存予定との重複確認ダイアログ */}
      <ConfirmDialog
        open={conflictConfirmOpen}
        onOpenChange={setConflictConfirmOpen}
        title="このまま送信しますか？"
        description={`選択した候補の中に、あなたの既存予定と重複の可能性がある日時があります（候補${conflictConfirmOrders.join(', ')}）。`}
        confirmLabel="送信する"
        variant="default"
        onConfirm={confirmSubmitDespiteConflict}
      />
    </AppLayout>
  )
}


import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { MonthSwitcher } from '@/components/patterns/calendar'
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
    activeTab,
    setActiveTab,
    currentDate,
    setCurrentDate,
    selectedCandidates,
    setSelectedCandidates,
    notes,
    setNotes,
    loadGMRequests,
    toggleCandidate,
    pendingRequests,
    allRequests
  } = useGMRequests({ userId: user?.id })

  const {
    candidateAvailability,
    updateCandidateAvailability
  } = useAvailabilityCheck()

  const { submitting, handleSubmit } = useResponseSubmit({
    requests,
    selectedCandidates,
    notes,
    onSubmitSuccess: loadGMRequests
  })

  // リクエストが読み込まれた後、店舗情報に基づいて候補の利用可能性をチェック
  useEffect(() => {
    requests.forEach(request => {
      const storeId = request.candidate_datetimes?.confirmedStore?.storeId || 
                     request.candidate_datetimes?.requestedStores?.[0]?.storeId
      if (storeId) {
        updateCandidateAvailability(request, storeId)
      }
    })
  }, [requests, stores])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="gm-availability" />
        <div className="container mx-auto max-w-4xl px-6 py-12 text-center">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="gm-availability" />
      
      <div className="container mx-auto max-w-7xl px-6 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">GM可否確認</h1>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'pending' | 'all')} className="w-full">
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="pending">未回答 ({pendingRequests.length})</TabsTrigger>
              <TabsTrigger value="all">全て ({requests.length})</TabsTrigger>
            </TabsList>
            
            {activeTab === 'all' && (
              <MonthSwitcher
                value={currentDate}
                onChange={setCurrentDate}
                showToday
                quickJump
                enableKeyboard
              />
            )}
          </div>

          {/* 未回答タブ */}
          <TabsContent value="pending" className="mt-0">
            {pendingRequests.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  未回答のリクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    selectedCandidates={selectedCandidates[request.id] || []}
                    candidateAvailability={candidateAvailability[request.id] || {}}
                    notes={notes[request.id] || ''}
                    submitting={submitting === request.id}
                    onToggleCandidate={(order) => toggleCandidate(request.id, order)}
                    onNotesChange={(value) => setNotes({ ...notes, [request.id]: value })}
                    onSubmit={(allUnavailable) => handleSubmit(request.id, allUnavailable)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* 全てのリクエストタブ（月別） */}
          <TabsContent value="all" className="mt-0">
            {allRequests.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  {formatMonthYear(currentDate)}のリクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {allRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    selectedCandidates={selectedCandidates[request.id] || []}
                    candidateAvailability={candidateAvailability[request.id] || {}}
                    notes={notes[request.id] || ''}
                    submitting={submitting === request.id}
                    onToggleCandidate={(order) => toggleCandidate(request.id, order)}
                    onNotesChange={(value) => setNotes({ ...notes, [request.id]: value })}
                    onSubmit={(allUnavailable) => handleSubmit(request.id, allUnavailable)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}


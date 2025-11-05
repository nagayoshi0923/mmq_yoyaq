import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { CheckCircle, Clock, Calendar, Settings } from 'lucide-react'

// サイドバーのメニュー項目定義
const GM_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'gm-list', label: 'GM確認一覧', icon: CheckCircle, description: 'すべてのGM確認を表示' },
  { id: 'pending', label: '承認待ち', icon: Clock, description: '承認待ちGM' },
  { id: 'schedule', label: 'スケジュール', icon: Calendar, description: 'GMスケジュール' },
  { id: 'settings', label: '設定', icon: Settings, description: '表示設定' }
]
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
  const [sidebarActiveTab, setSidebarActiveTab] = useState('availability-check')

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
      <AppLayout
        currentPage="gm-availability"
        sidebar={
          <UnifiedSidebar
            title="GM確認"
            mode="list"
            menuItems={GM_MENU_ITEMS}
            activeTab={sidebarActiveTab}
            onTabChange={setSidebarActiveTab}
          />
        }
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
      sidebar={
        <UnifiedSidebar
          title="GM確認"
          mode="list"
          menuItems={GM_MENU_ITEMS}
          activeTab={sidebarActiveTab}
          onTabChange={setSidebarActiveTab}
        />
      }
      maxWidth="max-w-[1600px]"
      containerPadding="px-2 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <div className="space-y-3 sm:space-y-4 md:space-y-6">
        <div className="flex justify-between items-center mb-3 sm:mb-4 md:mb-6">
          <div></div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'pending' | 'all')} className="w-full">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="pending" className="text-xs sm:text-sm">未回答 ({pendingRequests.length})</TabsTrigger>
              <TabsTrigger value="all" className="text-xs sm:text-sm">全て ({requests.length})</TabsTrigger>
            </TabsList>
            
            <div className="flex-shrink-0">
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
              <Card>
                <CardContent className="py-8 sm:py-12 text-center text-muted-foreground text-xs sm:text-sm p-3 sm:p-4 md:p-6">
                  未回答のリクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 sm:space-y-4">
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
                <CardContent className="py-8 sm:py-12 text-center text-muted-foreground text-xs sm:text-sm p-3 sm:p-4 md:p-6">
                  {formatMonthYear(currentDate)}のリクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 sm:space-y-4">
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
    </AppLayout>
  )
}


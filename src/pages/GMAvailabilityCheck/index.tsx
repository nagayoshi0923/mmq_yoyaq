import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { CheckCircle, Clock, Calendar, Settings } from 'lucide-react'

// サイドバーのメニュー項目定義
const GM_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'gm-list', label: 'GM確認一覧', icon: CheckCircle },
  { id: 'pending', label: '承認待ち', icon: Clock },
  { id: 'schedule', label: 'スケジュール', icon: Calendar },
  { id: 'settings', label: '設定', icon: Settings }
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
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <div className="space-y-4">
        <PageHeader
          title="GM可否確認"
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
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  未回答のリクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
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
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  {formatMonthYear(currentDate)}のリクエストはありません
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
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


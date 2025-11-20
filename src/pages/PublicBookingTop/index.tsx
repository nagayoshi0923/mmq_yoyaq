import { useState, useEffect, useCallback, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { useAuth } from '@/contexts/AuthContext'
import { getColorFromName } from '@/lib/utils'
import { useBookingData } from './hooks/useBookingData'
import { useCalendarData } from './hooks/useCalendarData'
import { useListViewData } from './hooks/useListViewData'
import { useBookingFilters } from './hooks/useBookingFilters'
import { useFavorites } from '@/hooks/useFavorites'
import { SearchBar } from './components/SearchBar'
import { LineupView } from './components/LineupView'
import { CalendarView } from './components/CalendarView'
import { ListView } from './components/ListView'

interface PublicBookingTopProps {
  onScenarioSelect?: (scenarioId: string) => void
}

export function PublicBookingTop({ onScenarioSelect }: PublicBookingTopProps) {
  const { user } = useAuth()
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined
  
  // タブ状態（URLハッシュと連携）
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash
    if (hash.includes('calendar')) return 'calendar'
    if (hash.includes('list')) return 'list'
    return 'lineup'
  })

  // 店舗フィルター
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all')

  // データ取得フック
  const { scenarios, allEvents, stores, isLoading, loadData } = useBookingData()

  // カレンダーデータフック
  const { currentMonth, setCurrentMonth, calendarDays, getEventsForDate } = useCalendarData(
    allEvents,
    selectedStoreFilter
  )

  // リストビューデータフック
  const { listViewMonth, setListViewMonth, listViewData, getEventsForDateStore } = useListViewData(
    allEvents,
    stores,
    selectedStoreFilter
  )

  // 検索キーワード
  const [searchTerm, setSearchTerm] = useState('')
  
  // お気に入り機能
  const { isFavorite, toggleFavorite } = useFavorites()
  
  // フィルタリングフック
  const { filteredScenarios, newScenarios, upcomingScenarios, allScenarios } = useBookingFilters(scenarios, searchTerm)
  
  // お気に入りトグルハンドラ（メモ化）
  const handleToggleFavorite = useCallback((scenarioId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }, [toggleFavorite])

  // 初期データロード
  useEffect(() => {
    loadData()
  }, [loadData])

  // タブ変更時にURLハッシュを更新（メモ化）
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value)
    if (value === 'calendar') {
      window.location.hash = 'customer-booking/calendar'
    } else if (value === 'list') {
      window.location.hash = 'customer-booking/list'
    } else {
      window.location.hash = 'customer-booking'
    }
  }, [])

  // シナリオカードクリック（メモ化）
  const handleCardClick = useCallback((scenarioId: string) => {
    if (onScenarioSelect) {
      onScenarioSelect(scenarioId)
    } else {
      window.location.hash = `scenario-detail/${scenarioId}`
    }
  }, [onScenarioSelect])

  // 店舗名取得（メモ化）
  const getStoreName = useCallback((event: any): string => {
    if (event.stores) {
      return event.stores.short_name || event.stores.name || '店舗不明'
    }
    return event.store_name || event.store_short_name || '店舗不明'
  }, [])

  // 店舗カラー取得（メモ化）
  const getStoreColor = useCallback((event: any): string => {
    if (event.stores?.color) {
      return getColorFromName(event.stores.color)
    }
    if (event.store_color) {
      return getColorFromName(event.store_color)
    }
    return '#4F46E5'
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {shouldShowNavigation && (
        <NavigationBar currentPage="customer-booking" />
      )}

      {/* ヒーローセクション */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white">
        <div className="container mx-auto max-w-7xl px-2.5 sm:px-6 py-8 sm:py-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-4">Murder Mystery Quest</h1>
          <p className="text-sm sm:text-base md:text-lg text-purple-100">
            リアルな謎解き体験。あなたは事件の真相を暴けるか？
          </p>
        </div>
      </div>

      {/* 検索バー */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto max-w-7xl px-2.5 sm:px-6 py-2 sm:py-3">
          <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-2.5 sm:px-6 py-4 sm:py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm sm:text-base text-muted-foreground">読み込み中...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-4 sm:mb-6 h-10 sm:h-11">
              <TabsTrigger value="lineup" className="text-xs sm:text-sm">ラインナップ</TabsTrigger>
              <TabsTrigger value="calendar" className="text-xs sm:text-sm">カレンダー</TabsTrigger>
              <TabsTrigger value="list" className="text-xs sm:text-sm">リスト</TabsTrigger>
            </TabsList>

            {/* ラインナップ表示 */}
            <TabsContent value="lineup">
              <LineupView
                newScenarios={newScenarios}
                upcomingScenarios={upcomingScenarios}
                allScenarios={allScenarios}
                onCardClick={handleCardClick}
                isFavorite={isFavorite}
                onToggleFavorite={handleToggleFavorite}
              />
            </TabsContent>

            {/* カレンダー表示 */}
            <TabsContent value="calendar">
              <CalendarView
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                calendarDays={calendarDays}
                getEventsForDate={getEventsForDate}
                selectedStoreFilter={selectedStoreFilter}
                onStoreFilterChange={setSelectedStoreFilter}
                stores={stores}
                scenarios={scenarios}
                onCardClick={handleCardClick}
                getStoreName={getStoreName}
                getStoreColor={getStoreColor}
              />
            </TabsContent>

            {/* リスト表示 */}
            <TabsContent value="list">
              <ListView
                listViewMonth={listViewMonth}
                onMonthChange={setListViewMonth}
                selectedStoreFilter={selectedStoreFilter}
                onStoreFilterChange={setSelectedStoreFilter}
                stores={stores}
                listViewData={listViewData}
                getEventsForDateStore={getEventsForDateStore}
                getColorFromName={getColorFromName}
                scenarios={scenarios}
                onCardClick={handleCardClick}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}


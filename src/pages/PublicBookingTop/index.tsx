import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
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
  
  // お気に入りトグルハンドラ
  const handleToggleFavorite = (scenarioId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }

  // 初期データロード
  useEffect(() => {
    loadData()
  }, [loadData])

  // タブ変更時にURLハッシュを更新
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === 'calendar') {
      window.location.hash = 'customer-booking/calendar'
    } else if (value === 'list') {
      window.location.hash = 'customer-booking/list'
    } else {
      window.location.hash = 'customer-booking'
    }
  }

  // シナリオカードクリック
  const handleCardClick = (scenarioId: string) => {
    if (onScenarioSelect) {
      onScenarioSelect(scenarioId)
    } else {
      window.location.hash = `scenario-detail/${scenarioId}`
    }
  }

  // 店舗名取得
  const getStoreName = (event: any): string => {
    if (event.stores) {
      return event.stores.short_name || event.stores.name || '店舗不明'
    }
    return event.store_name || event.store_short_name || '店舗不明'
  }

  // 店舗カラー取得
  const getStoreColor = (event: any): string => {
    if (event.stores?.color) {
      return getColorFromName(event.stores.color)
    }
    if (event.store_color) {
      return getColorFromName(event.store_color)
    }
    return '#4F46E5'
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="customer-booking" />

      {/* ヒーローセクション */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white">
        <div className="container mx-auto max-w-7xl px-6 py-12">
          <h1 className="text-4xl font-bold mb-4">Murder Mystery Quest</h1>
          <p className="text-lg text-purple-100">
            リアルな謎解き体験。あなたは事件の真相を暴けるか？
          </p>
        </div>
      </div>

      {/* 検索バー */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto max-w-7xl px-6 py-3">
          <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-6">
              <TabsTrigger value="lineup">ラインナップ</TabsTrigger>
              <TabsTrigger value="calendar">カレンダー</TabsTrigger>
              <TabsTrigger value="list">リスト</TabsTrigger>
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


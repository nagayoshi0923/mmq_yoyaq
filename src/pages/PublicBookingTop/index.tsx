import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/utils/logger'
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
import { useStoreFilterPreference } from '@/hooks/useUserPreference'
import { SearchBar } from './components/SearchBar'
import { LineupView } from './components/LineupView'
import { CalendarView } from './components/CalendarView'
import { ListView } from './components/ListView'

interface PublicBookingTopProps {
  onScenarioSelect?: (scenarioId: string) => void
  organizationSlug?: string  // 組織slug（パス方式用）
}

export function PublicBookingTop({ onScenarioSelect, organizationSlug }: PublicBookingTopProps) {
  const { user } = useAuth()
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined
  
  // タブ状態（URLハッシュと連携）
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash
    if (hash.includes('calendar')) return 'calendar'
    if (hash.includes('list')) return 'list'
    return 'lineup'
  })

  // 店舗フィルター（アカウントごとに保存）
  const [selectedStoreFilter, setSelectedStoreFilter] = useStoreFilterPreference('all')
  const [isStoreFilterInitialized, setIsStoreFilterInitialized] = useState(false)

  // データ取得フック
  const { 
    scenarios, 
    allEvents, 
    blockedSlots, 
    stores, 
    privateBookingDeadlineDays, 
    isLoading, 
    loadData,
    organizationNotFound,
    organizationName
  } = useBookingData(organizationSlug)
  
  // 店舗データがロードされたら、保存されたフィルターを検証（存在しない店舗IDの場合はリセット）
  useEffect(() => {
    if (stores.length > 0 && !isStoreFilterInitialized) {
      // 保存されたフィルターが有効か確認
      if (selectedStoreFilter && selectedStoreFilter !== 'all') {
        const storeExists = stores.some(s => s.id === selectedStoreFilter)
        if (!storeExists) {
          // 店舗が存在しない場合はデフォルト（馬場）を選択
          const babaStore = stores.find(s => s.name?.includes('馬場') || s.short_name?.includes('馬場'))
          if (babaStore) {
            setSelectedStoreFilter(babaStore.id)
          }
        }
      } else if (!selectedStoreFilter || selectedStoreFilter === 'all') {
        // 保存がない場合はデフォルト（馬場）を選択
        const babaStore = stores.find(s => s.name?.includes('馬場') || s.short_name?.includes('馬場'))
        if (babaStore) {
          setSelectedStoreFilter(babaStore.id)
        }
      }
      setIsStoreFilterInitialized(true)
    }
  }, [stores, isStoreFilterInitialized, selectedStoreFilter, setSelectedStoreFilter])

  // 店舗フィルター変更ハンドラ（useStoreFilterPreferenceで自動保存）
  const handleStoreFilterChange = useCallback((storeId: string) => {
    setSelectedStoreFilter(storeId)
  }, [setSelectedStoreFilter])

  // カレンダーデータフック
  const { currentMonth, setCurrentMonth, calendarDays, getEventsForDate } = useCalendarData(
    allEvents,
    selectedStoreFilter,
    stores
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
  const { newScenarios, upcomingScenarios, allScenarios } = useBookingFilters(scenarios, searchTerm)
  
  // お気に入りトグルハンドラ（メモ化）
  const handleToggleFavorite = useCallback((scenarioId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }, [toggleFavorite])

  // 初期データロード
  useEffect(() => {
    const pageLoadStart = performance.now()
    logger.log('🚀 PublicBookingTop ページロード開始:', new Date().toISOString())
    logger.log('📊 現在の状態:', {
      scenariosCount: scenarios.length,
      allEventsCount: allEvents.length,
      storesCount: stores.length,
      isLoading
    })
    
    loadData().then(() => {
      const loadEnd = performance.now()
      logger.log(`⏱️ PublicBookingTop データ取得完了: ${((loadEnd - pageLoadStart) / 1000).toFixed(2)}秒`)
      logger.log('📊 データ取得後の状態:', {
        scenariosCount: scenarios.length,
        allEventsCount: allEvents.length,
        storesCount: stores.length
      })
      
      // レンダリング完了を待つ（複数回チェック）
      let checkCount = 0
      const checkRender = () => {
        checkCount++
        const renderEnd = performance.now()
        const elapsed = (renderEnd - pageLoadStart) / 1000
        
        // DOMが更新されているか確認
        const hasContent = document.querySelector('[data-scenario-card]') || document.querySelector('.grid')
        
        if (hasContent || checkCount > 20) {
          logger.log(`⏱️ PublicBookingTop レンダリング完了: ${elapsed.toFixed(2)}秒 (チェック回数: ${checkCount})`)
          logger.log('📊 最終状態:', {
            scenariosCount: scenarios.length,
            allEventsCount: allEvents.length,
            storesCount: stores.length,
            hasContent: !!hasContent
          })
        } else {
          setTimeout(checkRender, 100)
        }
      }
      setTimeout(checkRender, 0)
    }).catch((error) => {
      logger.error('❌ PublicBookingTop データ取得エラー:', error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData])

  // タブ変更時にURLハッシュを更新（メモ化）
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value)
    // organizationSlug がある場合は新形式、ない場合は旧形式
    const basePath = organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'
    if (value === 'calendar') {
      window.location.hash = `${basePath}/calendar`
    } else if (value === 'list') {
      window.location.hash = `${basePath}/list`
    } else {
      window.location.hash = basePath
    }
  }, [organizationSlug])

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

  // 組織が見つからない場合のエラー表示
  if (organizationNotFound) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto max-w-7xl px-4 md:px-6 py-16">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">組織が見つかりません</h1>
            <p className="text-gray-600 mb-8">
              指定された組織「{organizationSlug}」は存在しないか、現在利用できません。
            </p>
            <a 
              href="#booking/queens-waltz" 
              className="inline-flex items-center justify-center rounded-md bg-purple-600 px-6 py-3 text-white hover:bg-purple-700 transition-colors"
            >
              トップページへ戻る
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {shouldShowNavigation && (
        <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />
      )}

      {/* ヒーローセクション */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white">
        <div className="container mx-auto max-w-7xl px-4 md:px-6 py-4 md:py-3">
          <h1 className="text-base font-medium mb-0.5">{organizationName || 'Murder Mystery Quest'}</h1>
          <p className="text-sm text-purple-100/90">
            リアルな謎解き体験。あなたは事件の真相を暴けるか？
          </p>
        </div>
      </div>

      {/* 検索バー */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-4 md:px-6 py-2">
          <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 md:px-6 py-4">
        {/* パフォーマンス最適化: ローディング中でもUIを即座に表示 */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full max-w-sm mx-auto grid-cols-3 mb-4 p-0.5 h-auto">
              <TabsTrigger value="lineup" className="text-sm px-2 py-1.5">ラインナップ</TabsTrigger>
              <TabsTrigger value="calendar" className="text-sm px-2 py-1.5">カレンダー</TabsTrigger>
              <TabsTrigger value="list" className="text-sm px-2 py-1.5">リスト</TabsTrigger>
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
                searchTerm={searchTerm}
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
                onStoreFilterChange={handleStoreFilterChange}
                stores={stores}
                scenarios={scenarios}
                onCardClick={handleCardClick}
                getStoreName={getStoreName}
                getStoreColor={getStoreColor}
                blockedSlots={blockedSlots}
                privateBookingDeadlineDays={privateBookingDeadlineDays}
              />
            </TabsContent>

            {/* リスト表示 */}
            <TabsContent value="list">
              <ListView
                listViewMonth={listViewMonth}
                onMonthChange={setListViewMonth}
                selectedStoreFilter={selectedStoreFilter}
                onStoreFilterChange={handleStoreFilterChange}
                stores={stores}
                listViewData={listViewData}
                getEventsForDateStore={getEventsForDateStore}
                getColorFromName={getColorFromName}
                scenarios={scenarios}
                onCardClick={handleCardClick}
                blockedSlots={blockedSlots}
                privateBookingDeadlineDays={privateBookingDeadlineDays}
              />
            </TabsContent>
          </Tabs>
      </div>
    </div>
  )
}


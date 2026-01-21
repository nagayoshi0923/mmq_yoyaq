import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { useAuth } from '@/contexts/AuthContext'
import { getColorFromName } from '@/lib/utils'
import { BOOKING_THEME, MYPAGE_THEME as THEME } from '@/lib/theme'
import { Sparkles } from 'lucide-react'
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
import { Footer } from '@/components/layout/Footer'
import { HowToUseGuide, HowToUseButton, useHowToUseGuide } from './components/HowToUseGuide'

interface PublicBookingTopProps {
  onScenarioSelect?: (scenarioId: string) => void
  organizationSlug?: string  // 組織slug（パス方式用）
}

export function PublicBookingTop({ onScenarioSelect, organizationSlug }: PublicBookingTopProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined
  
  // 使い方ガイド
  const { isGuideOpen, openGuide, closeGuide } = useHowToUseGuide()
  
  // タブ状態（URLパスと連携）
  const [activeTab, setActiveTab] = useState(() => {
    const pathname = window.location.pathname
    if (pathname.includes('/calendar')) return 'calendar'
    if (pathname.includes('/list')) return 'list'
    return 'lineup'
  })

  // URLパス変更時にタブ状態を同期（ブラウザバック対応）
  useEffect(() => {
    const pathname = location.pathname
    if (pathname.includes('/calendar')) {
      setActiveTab('calendar')
    } else if (pathname.includes('/list')) {
      setActiveTab('list')
    } else {
      setActiveTab('lineup')
    }
  }, [location.pathname])

  // 店舗フィルター（アカウントごとに保存、複数選択対応）
  const [selectedStoreIds, setSelectedStoreIds] = useStoreFilterPreference([])
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
      // 保存されたフィルターが有効か確認（存在しない店舗IDを除外）
      if (selectedStoreIds.length > 0) {
        const validIds = selectedStoreIds.filter(id => stores.some(s => s.id === id))
        if (validIds.length !== selectedStoreIds.length) {
          setSelectedStoreIds(validIds)
        }
      }
      // 保存がない場合はデフォルトで全店舗選択（臨時会場を除く）
      if (selectedStoreIds.length === 0) {
        const regularStores = stores.filter(s => !s.is_temporary)
        setSelectedStoreIds(regularStores.map(s => s.id))
      }
      setIsStoreFilterInitialized(true)
    }
  }, [stores, isStoreFilterInitialized, selectedStoreIds, setSelectedStoreIds])

  // 店舗フィルター変更ハンドラ（useStoreFilterPreferenceで自動保存）
  const handleStoreIdsChange = useCallback((storeIds: string[]) => {
    setSelectedStoreIds(storeIds)
  }, [setSelectedStoreIds])

  // カレンダーデータフック
  const { currentMonth, setCurrentMonth, calendarDays, getEventsForDate } = useCalendarData(
    allEvents,
    selectedStoreIds,
    stores
  )

  // リストビューデータフック
  const { listViewMonth, setListViewMonth, listViewData, getEventsForDateStore } = useListViewData(
    allEvents,
    stores,
    selectedStoreIds
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

  // タブ変更時にURL更新（メモ化）
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value)
    const basePath = organizationSlug ? `/${organizationSlug}` : '/queens-waltz'
    if (value === 'calendar') {
      navigate(`${basePath}/calendar`)
    } else if (value === 'list') {
      navigate(`${basePath}/list`)
    } else {
      navigate(basePath)
    }
  }, [organizationSlug, navigate])

  // シナリオカードクリック（メモ化）
  const handleCardClick = useCallback((scenarioId: string) => {
    if (onScenarioSelect) {
      onScenarioSelect(scenarioId)
    } else {
      // 組織slugがあれば予約サイト形式、なければグローバル形式
      if (organizationSlug) {
        navigate(`/${organizationSlug}/scenario/${scenarioId}`)
      } else {
        navigate(`/scenario-detail/${scenarioId}`)
      }
    }
  }, [onScenarioSelect, organizationSlug, navigate])

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
            <h1 className="text-2xl font-bold text-gray-900 mb-4">ページが見つかりません</h1>
            <p className="text-gray-600 mb-8">
              指定されたページは存在しないか、現在利用できません。
            </p>
            <a 
              href="/" 
              className={`inline-flex items-center justify-center px-6 py-3 transition-colors ${BOOKING_THEME.classes.button}`}
            >
              MMQトップページへ
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

      {/* ヒーローセクション - シャープデザイン */}
      <section 
        className="relative overflow-hidden"
        style={{ backgroundColor: THEME.primary }}
      >
        {/* アクセント装飾 */}
        <div 
          className="absolute top-0 right-0 w-48 h-48 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div 
          className="absolute bottom-0 left-0 w-1 h-12"
          style={{ backgroundColor: THEME.accent }}
        />
        
        <div className="container mx-auto max-w-7xl px-4 md:px-6 py-4 md:py-5 relative">
          <div className="text-white">
            {/* アクセントバッジ */}
            <div 
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium mb-2"
              style={{ backgroundColor: THEME.accent, color: '#000' }}
            >
              <Sparkles className="w-2.5 h-2.5" />
              {organizationName?.toUpperCase() || 'MURDER MYSTERY QUEST'}
            </div>
            
            <h1 className="text-lg md:text-xl font-bold tracking-tight">
              {organizationName || 'MMQ'}
            </h1>
            <p className="text-sm text-white/80">
              リアルな謎解き体験。あなたは事件の真相を暴けるか？
            </p>
          </div>
        </div>
      </section>

      {/* 検索バー - スクロール時に固定 */}
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="container mx-auto max-w-7xl px-4 md:px-6 py-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} organizationSlug={organizationSlug} />
            </div>
            <HowToUseButton onClick={openGuide} />
          </div>
        </div>
      </div>

      {/* 使い方ガイド */}
      <HowToUseGuide 
        organizationName={organizationName}
        isOpen={isGuideOpen}
        onClose={closeGuide}
      />

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
                organizationSlug={organizationSlug}
                organizationName={organizationName}
                selectedStoreIds={selectedStoreIds}
                onStoreIdsChange={handleStoreIdsChange}
                stores={stores}
              />
            </TabsContent>

            {/* カレンダー表示 */}
            <TabsContent value="calendar">
              <CalendarView
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                calendarDays={calendarDays}
                getEventsForDate={getEventsForDate}
                selectedStoreIds={selectedStoreIds}
                onStoreIdsChange={handleStoreIdsChange}
                stores={stores}
                scenarios={scenarios}
                onCardClick={handleCardClick}
                getStoreName={getStoreName}
                getStoreColor={getStoreColor}
                blockedSlots={blockedSlots}
                privateBookingDeadlineDays={privateBookingDeadlineDays}
                organizationSlug={organizationSlug}
              />
            </TabsContent>

            {/* リスト表示 */}
            <TabsContent value="list">
              <ListView
                listViewMonth={listViewMonth}
                onMonthChange={setListViewMonth}
                selectedStoreIds={selectedStoreIds}
                onStoreIdsChange={handleStoreIdsChange}
                stores={stores}
                listViewData={listViewData}
                getEventsForDateStore={getEventsForDateStore}
                getColorFromName={getColorFromName}
                scenarios={scenarios}
                onCardClick={handleCardClick}
                blockedSlots={blockedSlots}
                privateBookingDeadlineDays={privateBookingDeadlineDays}
                organizationSlug={organizationSlug}
              />
            </TabsContent>
          </Tabs>
      </div>

      {/* フッター */}
      <Footer organizationSlug={organizationSlug} organizationName={organizationName ?? undefined} />
    </div>
  )
}


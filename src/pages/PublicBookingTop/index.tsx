import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { useAuth } from '@/contexts/AuthContext'
import { getColorFromName } from '@/lib/utils'
import { BOOKING_THEME, MYPAGE_THEME as THEME } from '@/lib/theme'
import { Sparkles, MapPin, Store, BookOpen, Target, Users, Flame, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBookingData } from './hooks/useBookingData'
import { useCalendarData } from './hooks/useCalendarData'
import { useListViewData } from './hooks/useListViewData'
import { useBookingFilters } from './hooks/useBookingFilters'
import { useFavorites } from '@/hooks/useFavorites'
import { useStoreFilterPreference } from '@/hooks/useUserPreference'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { SearchBar } from './components/SearchBar'
import { LineupView } from './components/LineupView'
import { CalendarView } from './components/CalendarView'
import { ListView } from './components/ListView'
import { ScenarioCard } from './components/ScenarioCard'
import { Footer } from '@/components/layout/Footer'
import { HowToUseGuide, HowToUseButton, useHowToUseGuide } from './components/HowToUseGuide'
import { getOptimizedImageUrl } from '@/utils/imageUtils'

/** 公開トップ（queens-waltz）ヒーロー説明文 */
const QUEENS_WALTZ_HERO_DESCRIPTION =
  '都内（大久保、高田馬場、大塚）に4店舗、埼玉に1店舗を運営するマーダーミステリー専門店クインズワルツ。160種類以上のマーダーミステリーシナリオをご用意しています。あなたの気に入る物語がきっと見つかる！'

interface PublicBookingTopProps {
  onScenarioSelect?: (scenarioId: string) => void
  organizationSlug?: string  // 組織slug（パス方式用）
}

export function PublicBookingTop({ onScenarioSelect, organizationSlug }: PublicBookingTopProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined

  // 詳細ページから戻ったときカレンダー／リストの表示月を維持する（sessionStorage）
  const bookingViewPersistSlug = organizationSlug ?? 'platform'
  const calendarMonthStorageKey = `booking-${bookingViewPersistSlug}-calendar-month`
  const listMonthStorageKey = `booking-${bookingViewPersistSlug}-list-month`
  
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
    isFetching,
    loadData,
    organizationNotFound,
    organizationName,
    organizationHeaderImageUrl,
    nearlyCompleteGroups
  } = useBookingData(organizationSlug)
  
  useReportRouteScrollRestoration('public-booking-top', {
    isLoading,
    isFetching,
  })
  
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
  const { currentMonth, setCurrentMonth, calendarDays, getEventsForDate, canGoToPrevMonth } = useCalendarData(
    allEvents,
    selectedStoreIds,
    stores,
    calendarMonthStorageKey
  )

  // 過去月へのナビゲーションを防止するラッパー関数
  const handleMonthChange = useCallback((newMonth: Date) => {
    const today = new Date()
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const targetMonthStart = new Date(newMonth.getFullYear(), newMonth.getMonth(), 1)
    
    // 過去月への変更を防止
    if (targetMonthStart < currentMonthStart) {
      return
    }
    setCurrentMonth(newMonth)
  }, [setCurrentMonth])

  // リストビューデータフック
  const { listViewMonth, setListViewMonth, listViewData, getEventsForDateStore } = useListViewData(
    allEvents,
    stores,
    selectedStoreIds,
    blockedSlots,
    listMonthStorageKey
  )

  // リストビュー用の過去月ナビゲーション防止
  const handleListViewMonthChange = useCallback((newMonth: Date) => {
    const today = new Date()
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const targetMonthStart = new Date(newMonth.getFullYear(), newMonth.getMonth(), 1)
    
    if (targetMonthStart < currentMonthStart) {
      return
    }
    setListViewMonth(newMonth)
  }, [setListViewMonth])

  // 検索キーワード（詳細から戻ったときに復元）
  const lineupSearchStorageKey = `booking-${bookingViewPersistSlug}-lineup-search`
  const [searchTerm, setSearchTerm] = useState(() => {
    try {
      return sessionStorage.getItem(lineupSearchStorageKey) ?? ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(lineupSearchStorageKey, searchTerm)
      } catch {
        /* ignore */
      }
    }, 300)
    return () => window.clearTimeout(t)
  }, [searchTerm, lineupSearchStorageKey])
  
  // お気に入り機能
  const { isFavorite, toggleFavorite } = useFavorites()
  
  // 組織情報（店舗数・所在地）
  const orgInfo = useMemo(() => {
    const regularStores = stores.filter((s: any) => !s.is_temporary && s.status !== 'inactive')
    const storeCount = regularStores.length
    // 重複しない地域名を取得
    const regions = Array.from(new Set(
      regularStores
        .map((s: any) => s.region)
        .filter((r: string | null): r is string => !!r)
    ))
    // 住所から地域を抽出（regionがない場合のフォールバック）
    const addresses = regions.length > 0 ? regions : Array.from(new Set(
      regularStores
        .map((s: any) => {
          if (!s.address) return null
          // 「東京都新宿区...」→「東京都新宿区」のように市区町村まで抽出
          const match = s.address.match(/^(.+?[都道府県])(.+?[市区町村郡])/)
          return match ? `${match[1]}${match[2]}` : s.address.slice(0, 10)
        })
        .filter((a: string | null): a is string => !!a)
    ))
    return { storeCount, regions: addresses, scenarioCount: scenarios.length }
  }, [stores, scenarios])
  
  // フィルタリングフック
  const { newScenarios, upcomingScenarios, allScenarios, nearlyConfirmed } = useBookingFilters(scenarios, searchTerm)
  
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
  // ScenarioCardからはslug（またはID）が渡される
  const handleCardClick = useCallback((slugOrId: string, eventDate?: string, eventTime?: string) => {
    saveScrollPositionForCurrentUrl()
    if (onScenarioSelect) {
      onScenarioSelect(slugOrId)
    } else {
      // 日付・時間パラメータがあれば追加
      const params = new URLSearchParams()
      if (eventDate) params.set('date', eventDate)
      if (eventTime) params.set('time', eventTime)
      const query = params.toString() ? `?${params.toString()}` : ''
      // 組織slugがあれば予約サイト形式、なければグローバル形式
      if (organizationSlug) {
        navigate(`/${organizationSlug}/scenario/${slugOrId}${query}`)
      } else {
        navigate(`/scenario-detail/${slugOrId}${query}`)
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

      {/* ヒーローセクション - 背景画像対応 */}
      <section 
        className="relative overflow-hidden"
        style={{ backgroundColor: THEME.primary }}
      >
        {/* 背景画像（設定されている場合） */}
        {organizationHeaderImageUrl && (
          <>
            <img 
              src={getOptimizedImageUrl(organizationHeaderImageUrl, { width: 1200, format: 'webp', quality: 80 }) || organizationHeaderImageUrl} 
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* 暗いオーバーレイで文字を読みやすく */}
            <div className="absolute inset-0 bg-black/50" />
          </>
        )}
        
        {/* アクセント装飾（背景画像がない場合のみ表示） */}
        {!organizationHeaderImageUrl && (
          <>
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
          </>
        )}
        
        <div className="container mx-auto max-w-7xl px-4 md:px-6 py-8 md:py-12 relative">
          <div className="text-white" style={{ textShadow: organizationHeaderImageUrl ? '0 2px 4px rgba(0,0,0,0.5)' : 'none' }}>
            {/* アクセントバッジ */}
            <div 
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium mb-2"
              style={{ backgroundColor: THEME.accent, color: '#000' }}
            >
              <Sparkles className="w-2.5 h-2.5" />
              {organizationName?.toUpperCase() || 'MURDER MYSTERY QUEST'}
            </div>
            
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              {organizationName || 'MMQ'}
            </h1>
            <p className="text-sm md:text-[0.95rem] text-white/90 mb-3 max-w-xl leading-relaxed text-pretty">
              {organizationSlug === 'queens-waltz'
                ? QUEENS_WALTZ_HERO_DESCRIPTION
                : 'リアルな謎解き体験。あなたは事件の真相を暴けるか？'}
            </p>
            
            {/* 組織情報 + アクセスボタン */}
            {!isLoading && (orgInfo.storeCount > 0 || orgInfo.scenarioCount > 0) && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
                  {orgInfo.storeCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Store className="w-3 h-3" />
                      {orgInfo.storeCount}店舗
                    </span>
                  )}
                  {orgInfo.scenarioCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {orgInfo.scenarioCount}タイトル
                    </span>
                  )}
                  {orgInfo.regions.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {orgInfo.regions.join(' / ')}
                    </span>
                  )}
                </div>
                {orgInfo.storeCount > 0 && (
                  <button
                    onClick={() => document.getElementById('store-access')?.scrollIntoView({ behavior: 'smooth' })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 text-white transition-colors"
                  >
                    <MapPin className="w-3 h-3" />
                    アクセス
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 検索バー - スクロール時に固定 */}
      <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="container mx-auto max-w-7xl px-4 md:px-6 py-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} organizationSlug={organizationSlug} />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFetching}
              title="ページ先頭に戻らず、公演・シナリオ情報だけ再取得します"
              className="h-10 shrink-0 gap-1.5 px-2 sm:px-3"
              onClick={() => {
                saveScrollPositionForCurrentUrl()
                void loadData()
              }}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline text-xs">更新</span>
            </Button>
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

      {/* 残りわずか公演 */}
      {!isLoading && nearlyConfirmed.length > 0 && (
        <section className="container mx-auto max-w-7xl px-4 md:px-6 pt-6 md:pt-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-3">
              <Flame className="w-5 h-5 text-orange-500" />
              残りわずか
              <span 
                className="w-10 h-1 ml-2"
                style={{ backgroundColor: '#f97316' }}
              />
              <span className="text-xs font-normal text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                お早めに！
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {nearlyConfirmed.map((scenario) => (
              <ScenarioCard
                key={`nearly-${scenario.scenario_id}`}
                scenario={scenario}
                onClick={(slugOrId) => {
                  // 残りわずかのイベント日付・時間を渡す（next_eventsの先頭が残りわずかのイベント）
                  const nearlyFullEvent = scenario.next_events?.[0]
                  handleCardClick(slugOrId, nearlyFullEvent?.date, nearlyFullEvent?.time)
                }}
                isFavorite={isFavorite(scenario.scenario_id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}

      {/* 残りわずかで達成 - 貸切グループ */}
      {!isLoading && nearlyCompleteGroups.length > 0 && (
        <div className="container mx-auto max-w-7xl px-4 md:px-6 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-bold text-gray-900">あと少しで達成</h2>
            <span className="text-[10px] font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
              貸切グループ
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {nearlyCompleteGroups.map((group) => (
              <div 
                key={group.id}
                className="bg-white border border-emerald-200 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/group/invite/${group.invite_code}`)}
              >
                <div className="flex gap-2">
                  {group.scenario_key_visual ? (
                    <img 
                      src={group.scenario_key_visual} 
                      alt={group.scenario_title}
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                      <Users className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{group.scenario_title}</p>
                    <p className="text-[10px] text-gray-500">{group.organizer_name}さんの募集</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${(group.current_count / group.target_count) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-emerald-600">
                        {group.current_count}/{group.target_count}
                      </span>
                    </div>
                    <p className="text-[10px] text-emerald-600 font-medium">
                      あと{group.remaining}人で達成！
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                onMonthChange={handleMonthChange}
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
                onMonthChange={handleListViewMonthChange}
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
      <Footer organizationSlug={organizationSlug} organizationName={organizationName ?? undefined} stores={stores} />
    </div>
  )
}


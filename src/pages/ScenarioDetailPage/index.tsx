import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { ArrowLeft, Users } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { BookingConfirmation } from '../BookingConfirmation/index'
import { PrivateBookingRequest } from '../PrivateBookingRequest/index'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { getOptimizedImageUrl } from '@/utils/imageUtils'

// 分離された型定義
import { calculateParticipationFee } from './utils/pricingUtils'

// 分離されたフック
import { useScenarioDetail } from './hooks/useScenarioDetail'
import { usePrivateBooking } from './hooks/usePrivateBooking'
import { useBookingActions } from './hooks/useBookingActions'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'

// 分離されたコンポーネント
import { ScenarioHero } from './components/ScenarioHero'
import { EventList } from './components/EventList'
import { PrivateBookingForm } from './components/PrivateBookingForm'
import { BookingPanel } from './components/BookingPanel'
import { PrivateBookingPanel } from './components/PrivateBookingPanel'
import { VenueAccess } from './components/VenueAccess'
import { RelatedScenarios } from './components/RelatedScenarios'
import { StoreSelector } from './components/StoreSelector'
import { ScenarioAbout } from './components/ScenarioAbout'
import { Footer } from '@/components/layout/Footer'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'

interface ScenarioDetailPageProps {
  scenarioId: string
  onClose?: () => void
  organizationSlug?: string  // 組織slug（パス方式用）
}

type PrivateBookingUrlSlotKey = 'morning' | 'afternoon' | 'evening'

export function ScenarioDetailPage({ scenarioId, onClose, organizationSlug }: ScenarioDetailPageProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined
  const [activeTab, setActiveTab] = useState<'schedule' | 'private'>('schedule')
  /** ?tab=private&date&store&slot の枠を getTimeSlotsForDate で解決するまで保持 */
  const [privateBookingUrlPending, setPrivateBookingUrlPending] = useState<{
    date: string
    storeId: string
    slotKey: PrivateBookingUrlSlotKey
  } | null>(null)
  const [showStickyInfo, setShowStickyInfo] = useState(false)
  // 公演日程用の店舗フィルタ
  const [scheduleStoreFilter, setScheduleStoreFilter] = useState<string[]>([])
  
  // スクロール検知（600px以上スクロールしたらスティッキー情報を表示）
  useEffect(() => {
    const handleScroll = () => {
      setShowStickyInfo(window.scrollY > 600)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  
  // データ取得フック（organization_idでフィルタリング）
  const { scenario, events, stores, relatedScenarios, isLoading, loadScenarioDetail } = useScenarioDetail(scenarioId, organizationSlug)

  // URLがUUIDでシナリオにslugがある場合、slugのURLにリダイレクト
  useEffect(() => {
    if (!scenario || isLoading) return
    
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isUuid = uuidPattern.test(scenarioId)
    
    if (isUuid && scenario.slug && scenario.slug !== scenarioId) {
      // クエリパラメータを保持してリダイレクト
      const searchParams = new URLSearchParams(window.location.search)
      const queryString = searchParams.toString()
      const newPath = organizationSlug 
        ? `/${organizationSlug}/scenario/${scenario.slug}${queryString ? '?' + queryString : ''}`
        : `/scenario/${scenario.slug}${queryString ? '?' + queryString : ''}`
      navigate(newPath, { replace: true })
    }
  }, [scenario, scenarioId, organizationSlug, isLoading, navigate])

  useReportRouteScrollRestoration('scenario-detail-page', { isLoading })
  
  // 予約・貸切リクエストアクションフック
  const {
    selectedEventId,
    selectedEvent,
    participantCount,
    showBookingConfirmation,
    showPrivateBookingRequest,
    setSelectedEventId,
    setParticipantCount,
    handleBooking,
    handleBookingComplete,
    handleBackFromBooking,
    handlePrivateBookingRequest,
    handlePrivateBookingComplete,
    handleBackFromPrivateBooking
  } = useBookingActions({ events, onReload: loadScenarioDetail })
  
  // カスタム休日フック（usePrivateBookingより先に呼ぶ必要がある）
  // 公開ページではorganizationSlugから組織IDを取得して休日を取得
  const { isCustomHoliday } = useCustomHolidays({ organizationSlug })
  
  // 貸切リクエストロジックフック
  const {
    currentMonth,
    selectedStoreIds,
    selectedTimeSlots,
    MAX_SELECTIONS,
    availableStores,
    isNextMonthDisabled,
    isLoadingEvents,
    setSelectedStoreIds,
    setSelectedTimeSlots,
    checkTimeSlotAvailability,
    generatePrivateDates,
    changeMonth,
    toggleTimeSlot,
    getTimeSlotsForDate
  } = usePrivateBooking({ events, stores, scenarioId, scenario, organizationSlug, isCustomHoliday, isActive: activeTab === 'private' })

  // 選択されたイベントの日付に応じた参加費を計算
  const calculatedParticipationFee = useMemo(() => {
    if (!scenario) return 0
    
    // 選択されたイベントの日付を取得
    const selectedEvent = selectedEventId ? events.find(e => e.event_id === selectedEventId) : null
    const eventDate = selectedEvent?.date
    
    return calculateParticipationFee(
      scenario.participation_fee,
      scenario.participation_costs,
      eventDate,
      isCustomHoliday
    )
  }, [scenario, selectedEventId, events, isCustomHoliday])

  // 公演日程タブ用の店舗リスト（実際にスケジュールに存在する店舗から抽出）
  // scenario.available_storesではなく、eventsに実際に存在する店舗を使用
  const scheduleStores = useMemo(() => {
    // eventsに存在する店舗IDを収集
    const eventStoreIds = new Set(events.map(e => e.store_id).filter(Boolean))
    // 店舗リストからフィルタリング（オフィス除外、営業中のみ）
    return stores.filter(s => 
      eventStoreIds.has(s.id) &&
      s.ownership_type !== 'office' &&
      s.status === 'active'
    )
  }, [events, stores])

  // 公演日程タブの店舗フィルタ: 1店舗の場合は自動選択
  // 出張公演など store_id が無い枠があるときは自動選択しない（そのままだと出張が一覧から消える）
  useEffect(() => {
    const hasEventWithoutStore = events.some((e) => !e.store_id)
    if (scheduleStores.length === 1 && scheduleStoreFilter.length === 0 && !hasEventWithoutStore) {
      setScheduleStoreFilter([scheduleStores[0].id])
    }
  }, [scheduleStores, scheduleStoreFilter.length, events])

  useEffect(() => {
    // URLパラメータを処理
    const urlParams = new URLSearchParams(window.location.search)
    const tabParam = urlParams.get('tab')
    const dateParam = urlParams.get('date')
    const storeParam = urlParams.get('store')
    const slotParam = urlParams.get('slot')

    const isUuidLike = (value: string): boolean =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    
    if (tabParam === 'private') {
      setActiveTab('private')

      const slotKeys: PrivateBookingUrlSlotKey[] = ['morning', 'afternoon', 'evening']
      // 日付・店舗・枠キーが揃っている場合は店舗だけ即時反映し、実時刻は getTimeSlotsForDate で後段適用
      if (
        dateParam &&
        storeParam &&
        slotParam &&
        /^\d{4}-\d{2}-\d{2}$/.test(dateParam) &&
        slotKeys.includes(slotParam as PrivateBookingUrlSlotKey) &&
        isUuidLike(storeParam) &&
        stores.some((s: any) => s.id === storeParam)
      ) {
        setSelectedStoreIds([storeParam])
        setPrivateBookingUrlPending({
          date: dateParam,
          storeId: storeParam,
          slotKey: slotParam as PrivateBookingUrlSlotKey,
        })
      } else {
        setPrivateBookingUrlPending(null)
      }
    } else {
      setPrivateBookingUrlPending(null)
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && events.length > 0) {
      // 公演日程タブ: 指定日付（+時間）に一致するイベントを自動選択
      const timeParam = urlParams.get('time')
      let matchingEvent
      if (timeParam) {
        // 時間パラメータがある場合は日付+時間で一致を探す
        matchingEvent = events.find(e => e.date === dateParam && e.start_time === timeParam)
      }
      // 見つからない場合は日付のみで探す
      if (!matchingEvent) {
        matchingEvent = events.find(e => e.date === dateParam)
      }
      if (matchingEvent) {
        setSelectedEventId(matchingEvent.event_id)
      }
      }
    }
  }, [scenarioId, stores, events, setSelectedStoreIds, setSelectedTimeSlots, setSelectedEventId])

  // URL の slot=morning|afternoon|evening を、カレンダーと同じ getTimeSlotsForDate の実時刻に変換して反映
  useEffect(() => {
    if (!privateBookingUrlPending) return
    if (activeTab !== 'private') return
    const { date, storeId, slotKey } = privateBookingUrlPending
    if (selectedStoreIds.length !== 1 || selectedStoreIds[0] !== storeId) return

    const labelByKey: Record<PrivateBookingUrlSlotKey, string> = {
      morning: '午前',
      afternoon: '午後',
      evening: '夜',
    }
    const slots = getTimeSlotsForDate(date)
    const found = slots.find((s) => s.label === labelByKey[slotKey])
    setPrivateBookingUrlPending(null)
    if (found) {
      setSelectedTimeSlots([{ date, slot: found }])
    }
  }, [
    privateBookingUrlPending,
    activeTab,
    selectedStoreIds,
    getTimeSlotsForDate,
    setSelectedTimeSlots,
  ])

  // generatePrivateDates の結果を安定化（インライン呼び出しだと毎レンダーで新配列が生まれ memo() が無効になる）
  const privateDates = useMemo(() => generatePrivateDates(), [generatePrivateDates])

  // 貸切リクエスト完了時のハンドラ（選択状態をクリア）
  const handlePrivateBookingCompleteWithClear = useCallback(() => {
    setSelectedTimeSlots([])
    setSelectedStoreIds([])
    handlePrivateBookingComplete()
  }, [handlePrivateBookingComplete, setSelectedTimeSlots, setSelectedStoreIds])

  // 予約確認画面を表示
  if (showBookingConfirmation && selectedEvent && scenario) {
    return (
      <BookingConfirmation
        eventId={selectedEvent.event_id}
        scenarioTitle={scenario.scenario_title}
        scenarioId={scenario.scenario_master_id}
        storeId={selectedEvent.store_id}
        eventDate={selectedEvent.date}
        startTime={selectedEvent.start_time}
        endTime={selectedEvent.end_time}
        storeName={selectedEvent.store_name}
        storeAddress={selectedEvent.store_address}
        storeColor={selectedEvent.store_color}
        maxParticipants={selectedEvent.max_participants}
        currentParticipants={selectedEvent.current_participants}
        participationFee={calculatedParticipationFee}
        initialParticipantCount={participantCount}
        organizationSlug={organizationSlug}
        onBack={handleBackFromBooking}
        onComplete={handleBookingComplete}
      />
    )
  }

  // 貸切リクエスト確認画面を表示
  if (showPrivateBookingRequest && scenario) {
    return (
      <PrivateBookingRequest
        scenarioTitle={scenario.scenario_title}
        scenarioId={scenario.scenario_master_id}
        participationFee={scenario.participation_fee}
        maxParticipants={scenario.player_count_max}
        scenarioDuration={scenario.duration}
        weekendDuration={scenario.weekend_duration ?? null}
        selectedTimeSlots={selectedTimeSlots}
        selectedStoreIds={selectedStoreIds}
        stores={stores}
        organizationSlug={organizationSlug}
        onBack={handleBackFromPrivateBooking}
        onComplete={handlePrivateBookingCompleteWithClear}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background overflow-x-clip">
        <Header />
        {shouldShowNavigation && (
          <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />
        )}
        <div className="text-white relative overflow-hidden" style={{ backgroundColor: THEME.primary }}>
          <div className="container mx-auto max-w-7xl px-4 py-2 relative">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={onClose}
                className="flex items-center gap-1 hover:bg-white/10 h-8 px-2 touch-manipulation text-sm text-white"
              >
                <ArrowLeft className="w-4 h-4 flex-shrink-0" />
                <span>戻る</span>
              </Button>
            </div>
          </div>
        </div>
        {/* スケルトンUI */}
        <div className="container mx-auto max-w-7xl px-4 py-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* 左側：キービジュアルスケルトン */}
            <div className="md:col-span-5">
              <div className="aspect-[3/4] bg-gray-200 animate-pulse rounded-lg" />
            </div>
            {/* 右側：情報スケルトン */}
            <div className="md:col-span-7 space-y-4">
              {/* タイトル */}
              <div className="h-8 bg-gray-200 animate-pulse rounded w-3/4" />
              {/* サブタイトル */}
              <div className="h-4 bg-gray-200 animate-pulse rounded w-1/2" />
              {/* バッジ */}
              <div className="flex gap-2">
                <div className="h-6 w-16 bg-gray-200 animate-pulse rounded-full" />
                <div className="h-6 w-20 bg-gray-200 animate-pulse rounded-full" />
                <div className="h-6 w-14 bg-gray-200 animate-pulse rounded-full" />
              </div>
              {/* 説明文 */}
              <div className="space-y-2 pt-4">
                <div className="h-4 bg-gray-200 animate-pulse rounded w-full" />
                <div className="h-4 bg-gray-200 animate-pulse rounded w-full" />
                <div className="h-4 bg-gray-200 animate-pulse rounded w-2/3" />
              </div>
              {/* 料金 */}
              <div className="pt-4">
                <div className="h-10 bg-gray-200 animate-pulse rounded w-1/3" />
              </div>
            </div>
          </div>
          {/* 公演日程スケルトン */}
          <div className="mt-8">
            <div className="h-6 bg-gray-200 animate-pulse rounded w-32 mb-4" />
            <div className="space-y-3">
              <div className="h-16 bg-gray-200 animate-pulse rounded" />
              <div className="h-16 bg-gray-200 animate-pulse rounded" />
              <div className="h-16 bg-gray-200 animate-pulse rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="min-h-screen bg-background overflow-x-clip">
        <Header />
        {shouldShowNavigation && (
          <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />
        )}
        <div className="text-white relative overflow-hidden" style={{ backgroundColor: THEME.primary }}>
          {/* アクセント装飾 */}
          <div 
            className="absolute top-0 right-0 w-24 h-24 opacity-20"
            style={{ 
              background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
              transform: 'translate(30%, -30%)'
            }}
          />
          <div className="container mx-auto max-w-7xl px-4 py-2 relative">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={onClose}
                className="flex items-center gap-1 hover:bg-white/10 h-8 px-2 touch-manipulation text-sm text-white"
              >
                <ArrowLeft className="w-4 h-4 flex-shrink-0" />
                <span>戻る</span>
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">シナリオが見つかりませんでした</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <Header />
      {shouldShowNavigation && (
        <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />
      )}

      {/* ヒーローセクション（トップページと統一） */}
      <div className="text-white relative overflow-hidden" style={{ backgroundColor: THEME.primary }}>
        {/* アクセント装飾 */}
        <div 
          className="absolute top-0 right-0 w-24 h-24 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div className="container mx-auto max-w-7xl px-4 py-2 relative">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              className="flex items-center gap-1 hover:bg-white/10 h-8 px-2 touch-manipulation text-sm text-white"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0" />
              <span>戻る</span>
            </Button>
            <div className="h-4 w-px bg-white/30" />
            <span className="text-sm text-white/80">シナリオ詳細</span>
          </div>
        </div>
      </div>

      {/* スティッキーヘッダー */}
      <div className="bg-background border-b sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-4">
          
          {/* 2行目: モバイル用シナリオ概要（スクロール時にアニメーション表示） */}
          {/* md:hidden - 768px未満でのみ表示（グリッドレイアウトのmd:と統一） */}
          <div 
            className={`md:hidden overflow-hidden transition-all duration-300 ease-out ${
              showStickyInfo 
                ? 'max-h-[120px] opacity-100' 
                : 'max-h-0 opacity-0'
            }`}
          >
            <div className="flex items-center gap-3 pb-2 border-t pt-2">
              {/* キービジュアル（縦80px）- 最適化済み */}
              {scenario.key_visual_url && (
                <div className="flex-shrink-0 h-[80px] aspect-[1/1.4] bg-gray-200 overflow-hidden">
                  <img
                    src={getOptimizedImageUrl(scenario.key_visual_url, { width: 100, format: 'webp', quality: 80 })}
                    alt={scenario.scenario_title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      if (scenario.key_visual_url && e.currentTarget.src !== scenario.key_visual_url) {
                        e.currentTarget.src = scenario.key_visual_url
                      }
                    }}
                  />
                </div>
              )}
              {/* タイトルと基本情報 */}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold line-clamp-2">{scenario.scenario_title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {scenario.player_count_min === scenario.player_count_max
                    ? `${scenario.player_count_max}人`
                    : `${scenario.player_count_min}〜${scenario.player_count_max}人`}
                  {' / '}
                  {scenario.duration}分
                </p>
                {scenario.participation_fee && (
                  <p className="text-xs font-medium mt-0.5">
                    ¥{scenario.participation_fee.toLocaleString()}〜
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container mx-auto max-w-7xl px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* メインエリア - 詳細情報 */}
          <div className="md:col-span-7 space-y-4">
            <ScenarioHero scenario={scenario} events={events} organizationSlug={organizationSlug} stores={stores} />
            
            {/* あらすじ・シナリオ情報 */}
            <ScenarioAbout scenario={scenario} stores={stores} />
          </div>

          {/* 右サイドバー - チケット購入 */}
          <div className="md:col-span-5">
            <div className="md:sticky md:top-[50px] space-y-3">
              {/* タブ: 公演日程 / 貸切リクエスト */}
              <Tabs 
                value={activeTab}
                className="w-full" 
                onValueChange={(value) => setActiveTab(value as 'schedule' | 'private')}
              >
                <TabsList className="grid w-full grid-cols-2 mb-2">
                  <TabsTrigger value="schedule" className="text-sm py-1.5">公演日程</TabsTrigger>
                  <TabsTrigger value="private" className="text-sm py-1.5">貸切リクエスト</TabsTrigger>
                </TabsList>
                
                {/* 公演日程タブ */}
                <TabsContent value="schedule">
                  <div>
                    {/* 店舗フィルタ（実際にスケジュールに存在する店舗のみ表示） */}
                    <StoreSelector
                      stores={scheduleStores}
                      selectedStoreIds={scheduleStoreFilter}
                      onStoreIdsChange={setScheduleStoreFilter}
                      label="店舗で絞り込み"
                      placeholder="店舗を選択"
                    />
                    
                    {/* 日程未選択時のガイダンス（選択後と同じスタイル） */}
                    {!selectedEventId && (
                      <div 
                        className="mb-3 px-3 py-2 border-l-4 text-sm"
                        style={{ 
                          borderColor: THEME.primary,
                          backgroundColor: THEME.primaryLight,
                          color: THEME.primary
                        }}
                      >
                        参加したい日程を選択してください
                      </div>
                    )}
                    
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">日付を選択</h3>
                    <EventList
                      events={scheduleStoreFilter.length > 0 
                        ? events.filter(
                            (e) =>
                              scheduleStoreFilter.includes(e.store_id) ||
                              // 店舗未紐付け（出張公演など）は店舗絞り込みしても表示を維持
                              !e.store_id
                          )
                        : events}
                      selectedEventId={selectedEventId}
                      scenarioTitle={scenario.scenario_title}
                      onEventSelect={setSelectedEventId}
                      minParticipants={scenario.player_count_min}
                    />
                  </div>
                </TabsContent>
                
                {/* 貸切リクエストタブ */}
                <TabsContent value="private">
                  {/* 日程を決めないで作成するボタン（一番上） */}
                  <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm text-purple-800 mb-2">
                      日程やメンバーが決まっていない場合
                    </p>
                    <Button 
                      variant="outline"
                      className="w-full gap-2 border-purple-300 text-purple-700 hover:bg-purple-100"
                      onClick={() => {
                        const params = new URLSearchParams()
                        const scenarioIdToUse = scenario.scenario_master_id
                        if (scenarioIdToUse) params.set('scenarioId', scenarioIdToUse)
                        if (organizationSlug) params.set('org', organizationSlug)
                        params.set('mode', 'no-dates')
                        const groupCreateUrl = `/group/create?${params.toString()}`
                        
                        if (!user) {
                          sessionStorage.setItem('returnUrl', groupCreateUrl)
                          navigate('/login')
                          return
                        }
                        navigate(groupCreateUrl)
                      }}
                    >
                      <Users className="w-4 h-4" />
                      まずはメンバーを招待して貸切グループを作成
                    </Button>
                  </div>
                  
                  <PrivateBookingForm
                    stores={availableStores}
                    selectedStoreIds={selectedStoreIds}
                    onStoreIdsChange={setSelectedStoreIds}
                    currentMonth={currentMonth}
                    onMonthChange={changeMonth}
                    availableDates={privateDates}
                    getTimeSlotsForDate={getTimeSlotsForDate}
                    selectedSlots={selectedTimeSlots}
                    onTimeSlotToggle={toggleTimeSlot}
                    checkTimeSlotAvailability={checkTimeSlotAvailability}
                    maxSelections={MAX_SELECTIONS}
                    isCustomHoliday={isCustomHoliday}
                    blockedSlots={scenario?.private_booking_blocked_slots}
                    isNextMonthDisabled={isNextMonthDisabled}
                    loading={isLoadingEvents}
                  />
                  
                  {/* 選択された時間枠の表示 */}
                  {selectedTimeSlots.length > 0 && (
                    <div className="mt-4 p-3 bg-purple-50 border border-purple-200">
                      <div className="text-xs sm:text-sm text-purple-900 mb-2">
                        選択中の候補日時 ({selectedTimeSlots.length}/{MAX_SELECTIONS})
                      </div>
                      <div className="space-y-1">
                        {selectedTimeSlots.map((item, index) => {
                          const dateObj = new Date(item.date)
                          const month = dateObj.getMonth() + 1
                          const day = dateObj.getDate()
                          const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                          const weekday = weekdays[dateObj.getDay()]
                          
                          return (
                            <div key={`${item.date}-${item.slot.label}`} className="flex items-center justify-between text-xs sm:text-sm">
                              <span className="text-purple-900 flex-1 min-w-0 pr-2">
                                {index + 1}. {month}/{day}({weekday}) {item.slot.label}{' '}
                                {item.slot.startTime}〜{item.slot.endTime}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 sm:h-7 sm:w-7 p-0 hover:bg-purple-100 flex-shrink-0 touch-manipulation"
                                onClick={() => toggleTimeSlot(item.date, item.slot)}
                              >
                                ×
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>


              {/* タブの内容に応じて表示を切り替え */}
              <div>
                {activeTab === 'schedule' && (
                  <BookingPanel
                    participantCount={participantCount}
                    maxParticipants={scenario.player_count_max}
                    participationFee={calculatedParticipationFee}
                    selectedEventId={selectedEventId}
                    isLoggedIn={!!user}
                    events={events}
                    onParticipantCountChange={setParticipantCount}
                    onBooking={handleBooking}
                    reservationDeadlineHours={events[0]?.reservation_deadline_hours ?? 0}
                    hasPreReading={scenario.has_pre_reading}
                  />
                )}

                {activeTab === 'private' && (() => {
                  const now = new Date()
                  const jstOffset = 9 * 60
                  const jstNow = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60 * 1000)
                  const todayStr = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, '0')}-${String(jstNow.getDate()).padStart(2, '0')}`
                  const startDate = scenario.booking_start_date
                  const endDate = scenario.booking_end_date
                  const hasPeriod = !!(startDate || endDate)
                  const isBeforeStart = startDate && todayStr < startDate
                  const isAfterEnd = endDate && todayStr > endDate
                  const isOutOfPeriod = hasPeriod && (isBeforeStart || isAfterEnd)

                  if (isOutOfPeriod) {
                    return (
                      <div className="border rounded-lg bg-gray-50 p-6 text-center space-y-2">
                        <p className="text-sm text-gray-600">現在は募集していません</p>
                        {startDate && endDate ? (
                          <p className="text-xs text-muted-foreground">
                            募集期間: {startDate} 〜 {endDate}
                          </p>
                        ) : endDate ? (
                          <p className="text-xs text-muted-foreground">
                            募集終了日: {endDate}
                          </p>
                        ) : startDate ? (
                          <p className="text-xs text-muted-foreground">
                            募集開始日: {startDate}
                          </p>
                        ) : null}
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-4">
                      {selectedStoreIds.length > 0 && (
                        <VenueAccess
                          selectedStoreIds={selectedStoreIds}
                          stores={availableStores}
                          mode="private"
                        />
                      )}
                      <PrivateBookingPanel
                        participationFee={scenario.participation_fee}
                        maxParticipants={scenario.player_count_max}
                        selectedTimeSlotsCount={selectedTimeSlots.length}
                        isLoggedIn={!!user}
                        onRequestBooking={() => handlePrivateBookingRequest(!!user)}
                        reservationDeadlineHours={events[0]?.reservation_deadline_hours ?? 0}
                        hasPreReading={scenario.has_pre_reading}
                        scenarioId={scenario.scenario_master_id}
                        organizationSlug={organizationSlug}
                      />
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* 関連シナリオ（2カラムレイアウトの外、全幅で表示） */}
        {relatedScenarios.length > 0 && (
          <div className="mt-8 pt-8 border-t">
            <RelatedScenarios
              scenarios={relatedScenarios}
              authorName={scenario.author}
              onScenarioClick={(id) => {
                saveScrollPositionForCurrentUrl()
                // 組織slugがあれば予約サイト形式、なければグローバル形式
                if (organizationSlug) {
                  navigate(`/${organizationSlug}/scenario/${id}`)
                } else {
                  navigate(`/scenario-detail/${id}`)
                }
              }}
            />
          </div>
        )}
      </div>

      {/* フッター */}
      <Footer organizationSlug={organizationSlug} minimal />
    </div>
  )
}

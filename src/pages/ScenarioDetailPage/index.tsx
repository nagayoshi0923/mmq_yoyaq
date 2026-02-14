import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { BookingConfirmation } from '../BookingConfirmation/index'
import { PrivateBookingRequest } from '../PrivateBookingRequest/index'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

// 分離された型定義
import { TIME_SLOTS } from './utils/types'

// 分離されたフック
import { useScenarioDetail } from './hooks/useScenarioDetail'
import { usePrivateBooking } from './hooks/usePrivateBooking'
import { useBookingActions } from './hooks/useBookingActions'

// 分離されたコンポーネント
import { ScenarioHero } from './components/ScenarioHero'
import { EventList } from './components/EventList'
import { PrivateBookingForm } from './components/PrivateBookingForm'
import { BookingPanel } from './components/BookingPanel'
import { PrivateBookingPanel } from './components/PrivateBookingPanel'
import { BookingNotice } from './components/BookingNotice'
import { VenueAccess } from './components/VenueAccess'
import { RelatedScenarios } from './components/RelatedScenarios'
import { StoreSelector } from './components/StoreSelector'
import { ScenarioAbout } from './components/ScenarioAbout'
import { Footer } from '@/components/layout/Footer'

interface ScenarioDetailPageProps {
  scenarioId: string
  onClose?: () => void
  organizationSlug?: string  // 組織slug（パス方式用）
}

export function ScenarioDetailPage({ scenarioId, onClose, organizationSlug }: ScenarioDetailPageProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined
  const [activeTab, setActiveTab] = useState<'schedule' | 'private'>('schedule')
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
  
  // 貸切リクエストロジックフック
  const {
    currentMonth,
    selectedStoreIds,
    selectedTimeSlots,
    MAX_SELECTIONS,
    availableStores,
    setSelectedStoreIds,
    setSelectedTimeSlots,
    checkTimeSlotAvailability,
    generatePrivateDates,
    changeMonth,
    toggleTimeSlot,
    getTimeSlotsForDate
  } = usePrivateBooking({ events, stores, scenarioId, scenario, organizationSlug })

  useEffect(() => {
    // URLパラメータを処理して貸切リクエストタブを開く
    const urlParams = new URLSearchParams(window.location.search)
    const tabParam = urlParams.get('tab')
    const dateParam = urlParams.get('date')
    const storeParam = urlParams.get('store')
    const slotParam = urlParams.get('slot')

    const isUuidLike = (value: string): boolean =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    
    if (tabParam === 'private') {
      setActiveTab('private')
      
      // 日付、店舗、時間帯が指定されている場合、それを選択状態にする
      if (dateParam && storeParam && slotParam) {
        // store がこのシナリオの組織の店舗に存在する場合のみ適用（不正なIDの注入対策）
        if (isUuidLike(storeParam) && stores.some((s: any) => s.id === storeParam)) {
          setSelectedStoreIds([storeParam])
        }
        
        const slotMap = {
          morning: { label: '午前', startTime: '09:00', endTime: '12:00' },
          afternoon: { label: '午後', startTime: '12:00', endTime: '17:00' },
          evening: { label: '夜間', startTime: '17:00', endTime: '22:00' }
        }
        
        const slot = slotMap[slotParam as keyof typeof slotMap]
        if (slot && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
          setSelectedTimeSlots([{ date: dateParam, slot }])
        }
      }
    }
  }, [scenarioId, stores, setSelectedStoreIds, setSelectedTimeSlots])

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
        scenarioId={scenario.scenario_id}
        storeId={selectedEvent.store_id}
        eventDate={selectedEvent.date}
        startTime={selectedEvent.start_time}
        endTime={selectedEvent.end_time}
        storeName={selectedEvent.store_name}
        storeAddress={selectedEvent.store_address}
        storeColor={selectedEvent.store_color}
        maxParticipants={selectedEvent.max_participants}
        currentParticipants={selectedEvent.current_participants}
        participationFee={scenario.participation_fee}
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
        scenarioId={scenario.scenario_id}
        participationFee={scenario.participation_fee}
        maxParticipants={scenario.player_count_max}
        selectedTimeSlots={selectedTimeSlots}
        selectedStoreIds={selectedStoreIds}
        stores={stores}
        scenarioAvailableStores={scenario.available_stores}
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
    <div className="min-h-screen bg-gray-50 overflow-x-clip">
      <Header />
      {shouldShowNavigation && (
        <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />
      )}

      {/* 戻るバー */}
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
            <div className="h-4 w-px bg-white/30" />
            <span className="text-sm text-white/80">シナリオ詳細</span>
          </div>
        </div>
      </div>

      {/* ヒーローセクション - 全幅ダーク背景 */}
      <ScenarioHero scenario={scenario} events={events} />

      {/* スティッキーヘッダー */}
      <div className="bg-white/95 backdrop-blur-md border-b sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto max-w-7xl px-4">
          <div 
            className={`md:hidden overflow-hidden transition-all duration-300 ease-out ${
              showStickyInfo 
                ? 'max-h-[120px] opacity-100' 
                : 'max-h-0 opacity-0'
            }`}
          >
            <div className="flex items-center gap-3 py-2">
              {scenario.key_visual_url && (
                <div className="flex-shrink-0 h-[60px] aspect-[1/1.4] bg-gray-200 overflow-hidden rounded">
                  <img
                    src={scenario.key_visual_url}
                    alt={scenario.scenario_title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold line-clamp-1">{scenario.scenario_title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {scenario.player_count_min === scenario.player_count_max
                    ? `${scenario.player_count_max}人`
                    : `${scenario.player_count_min}〜${scenario.player_count_max}人`}
                  {' / '}
                  {scenario.duration}分
                  {scenario.participation_fee ? ` / ¥${scenario.participation_fee.toLocaleString()}〜` : ''}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container mx-auto max-w-7xl px-4 py-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* メインエリア - 詳細情報 */}
          <div className="md:col-span-7 space-y-5">
            {/* あらすじ・シナリオ情報 */}
            <ScenarioAbout scenario={scenario} />
            
            {/* PC版: 注意事項 */}
            <div className="hidden md:block">
              <BookingNotice 
                reservationDeadlineHours={events[0]?.reservation_deadline_hours ?? 0}
                hasPreReading={scenario.has_pre_reading}
                mode={activeTab}
              />
            </div>

            {/* 関連シナリオ（PC版: メインエリアに表示） */}
            {relatedScenarios.length > 0 && (
              <div className="hidden md:block">
                <RelatedScenarios
                  scenarios={relatedScenarios}
                  authorName={scenario.author}
                  onScenarioClick={(id) => {
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

          {/* 右サイドバー - チケット購入 */}
          <div className="md:col-span-5">
            <div className="md:sticky md:top-[50px] space-y-3">
              <Tabs 
                value={activeTab}
                className="w-full" 
                onValueChange={(value) => setActiveTab(value as 'schedule' | 'private')}
              >
                <TabsList className="grid w-full grid-cols-2 mb-2 h-10">
                  <TabsTrigger value="schedule" className="text-sm py-2 font-medium">公演日程</TabsTrigger>
                  <TabsTrigger value="private" className="text-sm py-2 font-medium">貸切リクエスト</TabsTrigger>
                </TabsList>
                
                <TabsContent value="schedule">
                  <div>
                    <StoreSelector
                      stores={availableStores}
                      selectedStoreIds={scheduleStoreFilter}
                      onStoreIdsChange={setScheduleStoreFilter}
                      label="店舗で絞り込み"
                      placeholder="全店舗"
                    />
                    
                    {!selectedEventId && (
                      <div 
                        className="mb-3 px-3 py-2 border-l-4 text-sm rounded-r"
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
                        ? events.filter(e => scheduleStoreFilter.includes(e.store_id))
                        : events}
                      selectedEventId={selectedEventId}
                      scenarioTitle={scenario.scenario_title}
                      onEventSelect={setSelectedEventId}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="private">
                  <PrivateBookingForm
                    stores={availableStores}
                    selectedStoreIds={selectedStoreIds}
                    onStoreIdsChange={setSelectedStoreIds}
                    currentMonth={currentMonth}
                    onMonthChange={changeMonth}
                    availableDates={generatePrivateDates()}
                    timeSlots={TIME_SLOTS}
                    selectedSlots={selectedTimeSlots}
                    onTimeSlotToggle={toggleTimeSlot}
                    checkTimeSlotAvailability={checkTimeSlotAvailability}
                    maxSelections={MAX_SELECTIONS}
                    scenarioDuration={scenario.duration}
                    getTimeSlotsForDate={getTimeSlotsForDate}
                  />
                  
                  {selectedTimeSlots.length > 0 && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="text-xs sm:text-sm text-red-900 mb-2 font-medium">
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
                              <span className="text-red-900 flex-1 min-w-0 pr-2">
                                {index + 1}. {month}/{day}({weekday}) {item.slot.label} {item.slot.startTime}〜
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 sm:h-7 sm:w-7 p-0 hover:bg-red-100 flex-shrink-0 touch-manipulation"
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

              <div className="md:hidden">
                <BookingNotice 
                  reservationDeadlineHours={events[0]?.reservation_deadline_hours ?? 0}
                  hasPreReading={scenario.has_pre_reading}
                  mode={activeTab}
                />
              </div>

              <div>
                {activeTab === 'schedule' && (
                  <BookingPanel
                    participantCount={participantCount}
                    maxParticipants={scenario.player_count_max}
                    participationFee={scenario.participation_fee}
                    selectedEventId={selectedEventId}
                    isLoggedIn={!!user}
                    events={events}
                    onParticipantCountChange={setParticipantCount}
                    onBooking={handleBooking}
                  />
                )}

                {activeTab === 'private' && (
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
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* モバイル版: 関連シナリオ */}
        {relatedScenarios.length > 0 && (
          <div className="md:hidden mt-8 pt-6 border-t">
            <RelatedScenarios
              scenarios={relatedScenarios}
              authorName={scenario.author}
              onScenarioClick={(id) => {
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

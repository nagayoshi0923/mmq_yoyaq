import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { BookingConfirmation } from '../BookingConfirmation/index'
import { PrivateBookingRequest } from '../PrivateBookingRequest/index'

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

interface ScenarioDetailPageProps {
  scenarioId: string
  onClose?: () => void
}

export function ScenarioDetailPage({ scenarioId, onClose }: ScenarioDetailPageProps) {
  const { user } = useAuth()
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined
  const [activeTab, setActiveTab] = useState<'schedule' | 'private'>('schedule')
  const [showStickyInfo, setShowStickyInfo] = useState(false)
  
  // スクロール検知（600px以上スクロールしたらスティッキー情報を表示）
  useEffect(() => {
    const handleScroll = () => {
      setShowStickyInfo(window.scrollY > 600)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  
  // データ取得フック
  const { scenario, events, stores, isLoading, loadScenarioDetail } = useScenarioDetail(scenarioId)
  
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
    setSelectedStoreIds,
    setSelectedTimeSlots,
    checkTimeSlotAvailability,
    generatePrivateDates,
    changeMonth,
    toggleTimeSlot
  } = usePrivateBooking({ events, stores, scenarioId, scenario })

  useEffect(() => {
    // URLパラメータを処理して貸切リクエストタブを開く
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const tabParam = urlParams.get('tab')
    const dateParam = urlParams.get('date')
    const storeParam = urlParams.get('store')
    const slotParam = urlParams.get('slot')
    
    if (tabParam === 'private') {
      setActiveTab('private')
      
      // 日付、店舗、時間帯が指定されている場合、それを選択状態にする
      if (dateParam && storeParam && slotParam) {
        setSelectedStoreIds([storeParam])
        
        const slotMap = {
          morning: { label: '午前', startTime: '09:00', endTime: '12:00' },
          afternoon: { label: '午後', startTime: '12:00', endTime: '17:00' },
          evening: { label: '夜間', startTime: '17:00', endTime: '22:00' }
        }
        
        const slot = slotMap[slotParam as keyof typeof slotMap]
        if (slot) {
          setSelectedTimeSlots([{ date: dateParam, slot }])
        }
      }
    }
  }, [scenarioId, setSelectedStoreIds, setSelectedTimeSlots])

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
        onBack={handleBackFromPrivateBooking}
        onComplete={handlePrivateBookingCompleteWithClear}
      />
    )
  }

  if (isLoading) {
    const { user } = useAuth()
    const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined
    
    return (
      <div className="min-h-screen bg-background">
        <Header />
        {shouldShowNavigation && (
          <NavigationBar currentPage="customer-booking" />
        )}
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        {shouldShowNavigation && (
          <NavigationBar currentPage="customer-booking" />
        )}
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">シナリオが見つかりませんでした</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {shouldShowNavigation && (
        <NavigationBar currentPage="customer-booking" />
      )}

      {/* スティッキーヘッダー */}
      <div className="bg-background border-b sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-[10px]">
          {/* 1行目: 戻るボタン */}
          <div className="py-2">
            <Button
              variant="ghost"
              onClick={onClose}
              className="flex items-center gap-1 hover:bg-accent h-9 px-2 touch-manipulation text-sm"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0" />
              <span className="hidden md:inline">シナリオ一覧に戻る</span>
              <span className="md:hidden">戻る</span>
            </Button>
          </div>
          
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
              {/* キービジュアル（縦80px） */}
              {scenario.key_visual_url && (
                <div className="flex-shrink-0 h-[80px] aspect-[1/1.4] bg-gray-200 rounded overflow-hidden">
                  <img
                    src={scenario.key_visual_url}
                    alt={scenario.scenario_title}
                    className="w-full h-full object-cover"
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
      <div className="container mx-auto max-w-7xl px-[10px] py-4 md:py-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
          {/* メインエリア - 詳細情報 */}
          <div className="md:col-span-8 space-y-4 md:space-y-6">
            <ScenarioHero scenario={scenario} events={events} />
            {/* PC版: 注意事項をここに表示 */}
            <div className="hidden md:block">
              <BookingNotice 
                reservationDeadlineHours={events[0]?.reservation_deadline_hours || 24}
                hasPreReading={scenario.has_pre_reading}
              />
            </div>
          </div>

          {/* 右サイドバー - チケット購入 */}
          <div className="md:col-span-4">
            <div className="md:sticky md:top-[60px] space-y-4 md:space-y-6">
              {/* タブ: 公演日程 / 貸切リクエスト */}
              <Tabs 
                defaultValue="schedule" 
                className="w-full" 
                onValueChange={(value) => setActiveTab(value as 'schedule' | 'private')}
              >
                <TabsList className="grid w-full grid-cols-2 mb-3 md:mb-4 h-auto p-1">
                  <TabsTrigger value="schedule" className="text-sm md:text-base px-2 md:px-4 py-2 md:py-3">公演日程</TabsTrigger>
                  <TabsTrigger value="private" className="text-sm md:text-base px-2 md:px-4 py-2 md:py-3">貸切リクエスト</TabsTrigger>
                </TabsList>
                
                {/* 公演日程タブ */}
                <TabsContent value="schedule">
                  <div>
                    <h3 className="mb-3 md:mb-4 text-base md:text-lg font-semibold">日付を選択</h3>
                    <EventList
                      events={events}
                      selectedEventId={selectedEventId}
                      scenarioTitle={scenario.scenario_title}
                      onEventSelect={setSelectedEventId}
                    />
                  </div>
                </TabsContent>
                
                {/* 貸切リクエストタブ */}
                <TabsContent value="private">
                  <PrivateBookingForm
                    stores={stores}
                    selectedStoreIds={selectedStoreIds}
                    onStoreIdsChange={setSelectedStoreIds}
                    currentMonth={currentMonth}
                    onMonthChange={changeMonth}
                    availableDates={generatePrivateDates()}
                    timeSlots={TIME_SLOTS}
                    selectedSlots={selectedTimeSlots}
                    onTimeSlotToggle={toggleTimeSlot}
                    checkTimeSlotAvailability={checkTimeSlotAvailability}
                  />
                  
                  {/* 選択された時間枠の表示 */}
                  {selectedTimeSlots.length > 0 && (
                    <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-purple-50 border border-purple-200 rounded">
                      <div className="text-xs sm:text-sm text-purple-900 mb-1.5 sm:mb-2">
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

              {/* モバイル版: 注意事項をタブの下に表示 */}
              <div className="md:hidden">
                <BookingNotice 
                  reservationDeadlineHours={events[0]?.reservation_deadline_hours || 24}
                  hasPreReading={scenario.has_pre_reading}
                />
              </div>

              {/* タブの内容に応じて表示を切り替え */}
              <div className="mt-6">
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
                  <>
                    {/* 選択店舗（選択した店舗がある場合のみ表示） */}
                    {selectedStoreIds.length > 0 && (
                      <VenueAccess
                        selectedStoreIds={selectedStoreIds}
                        stores={stores}
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
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

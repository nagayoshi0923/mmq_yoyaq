import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { BookingConfirmation } from '../BookingConfirmation'
import { PrivateBookingRequest } from '../PrivateBookingRequest'

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
import { OrganizerInfo } from './components/OrganizerInfo'
import { VenueAccess } from './components/VenueAccess'
import { ScenarioAbout } from './components/ScenarioAbout'

interface ScenarioDetailPageProps {
  scenarioId: string
  onClose?: () => void
}

export function ScenarioDetailPage({ scenarioId, onClose }: ScenarioDetailPageProps) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'schedule' | 'private'>('schedule')
  
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
  } = usePrivateBooking({ events, stores })

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
        onComplete={handlePrivateBookingComplete}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="customer-booking" />
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
        <NavigationBar currentPage="customer-booking" />
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">シナリオが見つかりませんでした</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="customer-booking" />

      {/* 戻るボタン */}
      <div className="bg-background border-b">
        <div className="container mx-auto max-w-7xl px-6 py-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex items-center gap-1.5 hover:bg-accent h-8 px-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">シナリオ一覧に戻る</span>
          </Button>
        </div>
      </div>

      {/* ヒーローセクション */}
      <ScenarioHero scenario={scenario} />

      {/* メインコンテンツ */}
      <div className="container mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左メインエリア - 詳細情報 */}
          <div className="lg:col-span-8 space-y-6">
            <ScenarioAbout scenario={scenario} />
            <VenueAccess events={events} />
            <BookingNotice 
              reservationDeadlineHours={events[0]?.reservation_deadline_hours || 24}
              hasPreReading={scenario.has_pre_reading}
            />
            <OrganizerInfo authorName={scenario.author} />
          </div>

          {/* 右サイドバー - チケット購入 */}
          <div className="lg:col-span-4">
            <div className="sticky top-4 space-y-6">
              {/* タブ: 公演日程 / 貸切リクエスト */}
              <Tabs 
                defaultValue="schedule" 
                className="w-full" 
                onValueChange={(value) => setActiveTab(value as 'schedule' | 'private')}
              >
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="schedule">公演日程</TabsTrigger>
                  <TabsTrigger value="private">貸切リクエスト</TabsTrigger>
                </TabsList>
                
                {/* 公演日程タブ */}
                <TabsContent value="schedule">
                  <div>
                    <h3 className="font-bold mb-3">日付を選択</h3>
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
                    <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded">
                      <div className="text-xs font-medium text-purple-900 mb-2">
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
                            <div key={`${item.date}-${item.slot.label}`} className="flex items-center justify-between text-xs">
                              <span className="text-purple-900">
                                {index + 1}. {month}/{day}({weekday}) {item.slot.label} {item.slot.startTime}〜
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 hover:bg-red-100"
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
              <div className="mt-6">
                {activeTab === 'schedule' && (
                  <BookingPanel
                    participantCount={participantCount}
                    maxParticipants={scenario.player_count_max}
                    participationFee={scenario.participation_fee}
                    selectedEventId={selectedEventId}
                    isLoggedIn={!!user}
                    onParticipantCountChange={setParticipantCount}
                    onBooking={handleBooking}
                  />
                )}

                {activeTab === 'private' && (
                  <PrivateBookingPanel
                    participationFee={scenario.participation_fee}
                    maxParticipants={scenario.player_count_max}
                    selectedTimeSlotsCount={selectedTimeSlots.length}
                    isLoggedIn={!!user}
                    onRequestBooking={() => handlePrivateBookingRequest(!!user)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

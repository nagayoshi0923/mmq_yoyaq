import { memo, useMemo } from 'react'
import { formatDateJST } from '@/utils/dateUtils'
import { BookingFilters } from './BookingFilters'
import { OptimizedImage } from '@/components/ui/optimized-image'

interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
}

interface CalendarViewProps {
  currentMonth: Date
  onMonthChange: (date: Date) => void
  calendarDays: CalendarDay[]
  getEventsForDate: (date: Date) => any[]
  selectedStoreFilter: string
  onStoreFilterChange: (storeId: string) => void
  stores: any[]
  scenarios: any[]
  onCardClick: (scenarioId: string) => void
  getStoreName: (event: any) => string
  getStoreColor: (event: any) => string
  blockedSlots?: any[]
}

/**
 * カレンダービューコンポーネント
 */
export const CalendarView = memo(function CalendarView({
  currentMonth,
  onMonthChange,
  calendarDays,
  getEventsForDate,
  selectedStoreFilter,
  onStoreFilterChange,
  stores,
  scenarios,
  onCardClick,
  getStoreName,
  getStoreColor,
  blockedSlots = []
}: CalendarViewProps) {
  // 最適化: シナリオをMapでインデックス化（O(1)アクセス）
  const scenarioMap = useMemo(() => {
    const map = new Map<string, any>()
    scenarios.forEach(scenario => {
      map.set(scenario.scenario_id, scenario)
      if (scenario.scenario_title) {
        map.set(scenario.scenario_title, scenario)
      }
    })
    return map
  }, [scenarios])
  
  // GMテスト等のブロックされたイベントを日付でMapに管理
  const blockedEventsByDate = useMemo(() => {
    const map = new Map<string, any[]>()
    blockedSlots.forEach(event => {
      if (!map.has(event.date)) {
        map.set(event.date, [])
      }
      map.get(event.date)!.push(event)
    })
    return map
  }, [blockedSlots])

  return (
    <div>
      {/* 月ナビゲーション + 店舗フィルター（1行に配置） */}
      <BookingFilters
        currentMonth={currentMonth}
        onMonthChange={onMonthChange}
        selectedStoreFilter={selectedStoreFilter}
        onStoreFilterChange={onStoreFilterChange}
        stores={stores}
      />
      
      {/* カレンダーグリッド */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {/* 曜日ヘッダー（日曜始まり） */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
            <div 
              key={day} 
              className={`text-center py-2 sm:py-3 text-xs sm:text-sm ${
                index === 0 ? 'text-red-600' : index === 6 ? 'text-blue-600' : ''
              }`}
            >
              {day}
            </div>
          ))}
        </div>
        
        {/* 日付グリッド */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, index) => {
            const events = getEventsForDate(day.date)
            const dateNum = day.date.getDate()
            const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6
            const isSunday = day.date.getDay() === 0
            
            return (
              <div
                key={index}
                className={`border-r border-b ${
                  !day.isCurrentMonth ? 'bg-muted/20' : ''
                } flex flex-col min-h-[110px] sm:min-h-[150px]`}
              >
                {/* 日付 */}
                <div 
                  className={`text-xs p-0.5 sm:p-1 pb-0.5 flex-shrink-0 flex items-center justify-between ${
                    !day.isCurrentMonth 
                      ? 'text-muted-foreground' 
                      : isSunday 
                        ? 'text-red-600' 
                        : isWeekend 
                          ? 'text-blue-600' 
                          : ''
                  }`}
                >
                  <span>{dateNum}</span>
                  {events.length > 3 && (
                    <span className="text-xs bg-blue-100 text-blue-600 px-0.5 sm:px-1 py-0.5 rounded-full">
                      +{events.length - 3}
                    </span>
                  )}
                </div>
                
                {/* 公演リスト（スクロール可能） */}
                <div className="relative space-y-1 px-0 pb-0 overflow-y-auto max-h-[200px] sm:max-h-[250px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                  {(() => {
                    const dateStr = formatDateJST(day.date)
                    const allBlockedEvents = blockedEventsByDate.get(dateStr) || []
                    
                    // blockedEventsにも店舗フィルターを適用
                    const blockedEvents = selectedStoreFilter !== 'all'
                      ? allBlockedEvents.filter((e: any) => {
                          const eventStoreId = e.store_id || e.venue
                          const selectedStore = stores.find(s => s.id === selectedStoreFilter)
                          return eventStoreId === selectedStoreFilter || 
                                 eventStoreId === selectedStore?.short_name || 
                                 eventStoreId === selectedStore?.name
                        })
                      : allBlockedEvents
                    
                    // 通常公演 + 貸切公演 + GMテスト等を全てマージして時間順にソート
                    const allDisplayEvents = [...events, ...blockedEvents].sort((a, b) => {
                      return (a.start_time || '').localeCompare(b.start_time || '')
                    })
                    
                    // 時間帯別にイベントを分類
                    const getTimeSlot = (startTime: string) => {
                      const hour = parseInt(startTime?.split(':')[0] || '0')
                      if (hour < 12) return 'morning'
                      if (hour < 18) return 'afternoon'
                      return 'evening'
                    }
                    
                    // 選択中の店舗の各時間帯に予約があるかチェック
                    const selectedStore = selectedStoreFilter !== 'all' 
                      ? stores.find(s => s.id === selectedStoreFilter) 
                      : null
                    
                    const hasEventInSlot = (slot: 'morning' | 'afternoon' | 'evening') => {
                      if (!selectedStore) return true // 全店舗表示時は貸切ボタン非表示
                      return allDisplayEvents.some((e: any) => {
                        const eventStoreId = e.store_id || e.venue
                        const isTargetStore = eventStoreId === selectedStore.id || 
                                              eventStoreId === selectedStore.short_name || 
                                              eventStoreId === selectedStore.name
                        return isTargetStore && getTimeSlot(e.start_time) === slot
                      })
                    }
                    
                    const timeSlots: { slot: 'morning' | 'afternoon' | 'evening', label: string }[] = [
                      { slot: 'morning', label: '午前' },
                      { slot: 'afternoon', label: '午後' },
                      { slot: 'evening', label: '夜間' }
                    ]
                    
                    // 何もない場合は時間帯ごとの貸切申込ボタン
                    if (allDisplayEvents.length === 0 && selectedStore) {
                      return (
                        <div className="space-y-1 p-1">
                          {timeSlots.map(({ slot, label }) => (
                            <button
                              key={slot}
                              className="w-full text-xs py-1 px-1 border border-dashed border-gray-300 rounded text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
                              onClick={() => {
                                window.location.hash = `#private-booking-select?date=${dateStr}&store=${selectedStore.id}&slot=${slot}`
                              }}
                            >
                              {label} 貸切
                            </button>
                          ))}
                        </div>
                      )
                    }
                    
                    // 全店舗表示で何もない場合
                    if (allDisplayEvents.length === 0) {
                      return (
                        <div className="p-1 sm:p-2 text-xs text-gray-400 text-center">
                          店舗を選択して貸切申込
                        </div>
                      )
                    }
                    
                    // イベントを表示 + 空いている時間帯に貸切申込ボタン
                    return (
                    <>
                    {allDisplayEvents.map((event: any, idx: number) => {
                    // useBookingDataで事前計算済みのplayer_count_maxを使用
                    const maxParticipants = event.player_count_max || 8
                    const available = maxParticipants - (event.current_participants || 0)
                    const isFull = available === 0
                    const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
                    const isGmTest = event.category === 'gmtest' || event.category === 'testplay'
                    const isReserved = isPrivateBooking || isGmTest // 予約済みかどうか
                    const storeName = getStoreName(event)
                    const storeColor = getStoreColor(event)
                    
                    // シナリオ情報を取得（クリック時のscenario_id用）
                    const scenario = scenarioMap.get(event.scenario_id) || 
                                   scenarioMap.get(event.scenario) ||
                                   event.scenario_data
                    // useBookingDataで事前計算済みのkey_visual_urlを使用
                    const imageUrl = event.key_visual_url
                    
                    // 予約済みの場合はシンプル表示
                    if (isReserved) {
                      return (
                        <div
                          key={idx}
                          className="text-xs border-l-2 bg-gray-100"
                          style={{
                            borderLeftColor: '#9CA3AF',
                            padding: '2px 3px'
                          }}
                        >
                          <div className="flex items-center gap-1 text-gray-500">
                            <span>{event.start_time?.slice(0, 5)}</span>
                            <span>{storeName}</span>
                            <span>予約済</span>
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (scenario) {
                            onCardClick(scenario.scenario_id)
                          }
                        }}
                        className="text-xs transition-colors border-l-2 touch-manipulation cursor-pointer hover:bg-gray-50"
                        style={{
                          borderLeftColor: isFull ? '#9CA3AF' : storeColor,
                          backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`,
                          padding: '2px 3px'
                        }}
                      >
                        <div className="flex gap-1 sm:gap-1.5">
                          {/* 左カラム: 画像（PC版のみ表示）比率1:1.4 */}
                          <div 
                            className="hidden sm:block flex-shrink-0 w-[40px] overflow-hidden bg-gray-200"
                            style={{ aspectRatio: '1 / 1.4' }}
                          >
                            {imageUrl ? (
                              <OptimizedImage
                                src={imageUrl}
                                alt={event.scenario || scenario?.scenario_title || event.scenarios?.title || 'シナリオ画像'}
                                responsive={false}
                                useWebP={true}
                                quality={70}
                                lazy={true}
                                srcSetSizes={[50, 100]}
                                breakpoints={{ mobile: 50, tablet: 75, desktop: 100 }}
                                className="w-full h-full object-cover"
                                fallback={
                                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                    <span className="text-gray-400 text-[8px]">No Image</span>
                                  </div>
                                }
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                <span className="text-gray-400 text-[8px]">No Image</span>
                              </div>
                            )}
                          </div>

                          {/* 右カラム: 情報 */}
                          <div className="flex flex-col gap-0 flex-1 min-w-0 justify-between">
                            {/* 1行目: 時間 */}
                            <div className="text-xs leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                              {event.start_time?.slice(0, 5)}
                            </div>
                            {/* 2行目: 店舗 */}
                            <div className="text-xs leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                              {storeName}
                            </div>
                            {/* 3行目: シナリオ */}
                            <div className="text-xs leading-tight truncate text-gray-800">
                              {event.scenario || event.scenarios?.title}
                            </div>
                            {/* 4行目: 人数 */}
                            <div className={`text-xs leading-tight ${isFull ? 'text-gray-500' : 'text-gray-600'}`}>
                              {isFull ? '満席' : `残${available}人`}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {/* 選択中の店舗で空いている時間帯に貸切申込ボタンを表示 */}
                  {selectedStore && (
                    <div className="space-y-1 p-1 pt-2 border-t border-gray-200 mt-1">
                      {timeSlots.map(({ slot, label }) => (
                        !hasEventInSlot(slot) && (
                          <button
                            key={slot}
                            className="w-full text-xs py-1 px-1 border border-dashed border-gray-300 rounded text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
                            onClick={() => {
                              window.location.hash = `#private-booking-select?date=${dateStr}&store=${selectedStore.id}&slot=${slot}`
                            }}
                          >
                            {label} 貸切
                          </button>
                        )
                      ))}
                    </div>
                  )}
                  </>
                  )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})


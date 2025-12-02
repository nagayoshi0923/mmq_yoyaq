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
  
  // GMテスト等のブロックされた日付をSetで管理
  const blockedDates = useMemo(() => {
    const set = new Set<string>()
    blockedSlots.forEach(event => {
      set.add(event.date)
    })
    return set
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
                    const isBlocked = blockedDates.has(dateStr)
                    
                    // 貸切公演を除外した通常公演のみを表示用に抽出
                    const displayEvents = events.filter((event: any) => 
                      !(event.category === 'private' || event.is_private_booking === true)
                    )
                    // 貸切公演があるかどうか
                    const hasPrivateBooking = events.some((event: any) => 
                      event.category === 'private' || event.is_private_booking === true
                    )
                    
                    if (displayEvents.length === 0) {
                      // 通常公演がない場合
                      if (isBlocked || hasPrivateBooking) {
                        // GMテスト等でブロックされている、または貸切公演がある場合は「満室」と表示
                        return (
                          <div className="p-1 sm:p-2">
                            <div className="w-full text-xs py-1 sm:py-1.5 px-1 sm:px-2 text-center text-gray-400">
                              満室
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div className="p-1 sm:p-2">
                          <button
                            className="w-full text-xs py-1 sm:py-1.5 px-1 sm:px-2 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
                            onClick={() => {
                              window.location.hash = `#private-booking-select?date=${dateStr}`
                            }}
                          >
                            貸切申込
                          </button>
                        </div>
                      )
                    }
                    
                    // 通常公演を表示
                    return (
                    displayEvents.map((event: any, idx: number) => {
                    // useBookingDataで事前計算済みのplayer_count_maxを使用
                    const maxParticipants = event.player_count_max || 8
                    const available = maxParticipants - (event.current_participants || 0)
                    const isFull = available === 0
                    const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
                    const storeName = getStoreName(event)
                    const storeColor = getStoreColor(event)
                    
                    // シナリオ情報を取得（クリック時のscenario_id用）
                    const scenario = scenarioMap.get(event.scenario_id) || 
                                   scenarioMap.get(event.scenario) ||
                                   event.scenario_data
                    // useBookingDataで事前計算済みのkey_visual_urlを使用
                    const imageUrl = event.key_visual_url
                    
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (!isPrivateBooking && scenario) {
                            onCardClick(scenario.scenario_id)
                          }
                        }}
                        className={`text-xs transition-colors border-l-2 touch-manipulation ${isPrivateBooking ? '' : 'cursor-pointer hover:bg-gray-50'}`}
                        style={{
                          borderLeftColor: isPrivateBooking ? '#9CA3AF' : (isFull ? '#9CA3AF' : storeColor),
                          backgroundColor: isPrivateBooking ? '#F3F4F6' : (isFull ? '#F3F4F6' : `${storeColor}15`),
                          padding: '2px 3px'
                        }}
                      >
                        <div className="flex gap-1 sm:gap-1.5">
                          {/* 左カラム: 画像（PC版のみ表示）比率1:1.4 */}
                          <div 
                            className={`hidden sm:block flex-shrink-0 w-[40px] overflow-hidden ${
                              isPrivateBooking ? 'bg-gray-300' : 'bg-gray-200'
                            }`}
                            style={{ aspectRatio: '1 / 1.4' }}
                          >
                            {isPrivateBooking ? (
                              <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                                <span className="text-gray-500 text-[8px] font-medium">MMQ</span>
                              </div>
                            ) : imageUrl ? (
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
                            <div className="text-xs leading-tight" style={{ color: isPrivateBooking ? '#6B7280' : (isFull ? '#6B7280' : storeColor) }}>
                              {event.start_time?.slice(0, 5)}
                            </div>
                            {/* 2行目: 店舗 */}
                            <div className="text-xs leading-tight" style={{ color: isPrivateBooking ? '#6B7280' : (isFull ? '#6B7280' : storeColor) }}>
                              {storeName}
                            </div>
                            {/* 3行目: シナリオ */}
                            <div className={`text-xs leading-tight truncate ${isPrivateBooking ? 'text-gray-500' : 'text-gray-800'}`}>
                              {isPrivateBooking ? '貸切' : (event.scenario || event.scenarios?.title)}
                            </div>
                            {/* 4行目: 人数 */}
                            <div className={`text-xs leading-tight ${isPrivateBooking ? 'text-gray-500' : (isFull ? 'text-gray-500' : 'text-gray-600')}`}>
                              {isPrivateBooking ? '貸切' : isFull ? '満席' : `残${available}人`}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
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


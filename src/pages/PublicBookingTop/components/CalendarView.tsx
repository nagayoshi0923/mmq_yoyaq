import { memo, useMemo } from 'react'
import { formatDateJST } from '@/utils/dateUtils'
import { BookingFilters } from './BookingFilters'

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
  getStoreColor
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
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        {/* 曜日ヘッダー（日曜始まり） */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
            <div 
              key={day} 
              className={`text-center py-2 sm:py-3 text-xs sm:text-sm font-medium ${
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
                } flex flex-col min-h-[80px] sm:min-h-[120px]`}
              >
                {/* 日付 */}
                <div 
                  className={`text-xs font-medium p-0.5 sm:p-1 pb-0.5 flex-shrink-0 flex items-center justify-between ${
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
                <div className="relative space-y-0.5 px-0 pb-0 overflow-y-auto max-h-[60px] sm:max-h-[200px] md:max-h-[250px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                  {events.length === 0 ? (
                    <div className="p-1 sm:p-2">
                      <button
                        className="w-full text-xs py-1 sm:py-1.5 px-1 sm:px-2 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
                        onClick={() => {
                          const dateStr = formatDateJST(day.date)
                          window.location.hash = `#private-booking-select?date=${dateStr}`
                        }}
                      >
                        貸切申込
                      </button>
                    </div>
                  ) : (
                    events.slice(0, 3).map((event: any, idx: number) => {
                    const available = (event.max_participants || 8) - (event.current_participants || 0)
                    const isFull = available === 0
                    const isPrivateBooking = event.category === 'private' || event.is_private_booking === true
                    const storeName = getStoreName(event)
                    const storeColor = getStoreColor(event)
                    
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (!isPrivateBooking) {
                            // 最適化: Mapから直接取得（O(1)）
                            const scenario = scenarioMap.get(event.scenario_id) || 
                                           scenarioMap.get(event.scenario) ||
                                           scenarios.find(s => 
                                             s.scenario_id === event.scenario_id || 
                                             s.scenario_title === event.scenario
                                           )
                            if (scenario) onCardClick(scenario.scenario_id)
                          }
                        }}
                        className={`text-xs p-0.5 sm:p-1 rounded-none transition-shadow border-l-2 touch-manipulation ${isPrivateBooking ? '' : 'cursor-pointer hover:shadow-md'}`}
                        style={{
                          borderLeftColor: isPrivateBooking ? '#9CA3AF' : (isFull ? '#9CA3AF' : storeColor),
                          backgroundColor: isPrivateBooking ? '#F3F4F6' : (isFull ? '#F3F4F6' : `${storeColor}15`)
                        }}
                      >
                        <div className="flex items-start gap-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-0.5">
                              <div className="truncate text-sm leading-tight" style={{ color: isPrivateBooking ? '#6B7280' : (isFull ? '#6B7280' : storeColor) }}>
                                {event.start_time?.slice(0, 5)} {storeName}
                              </div>
                              <div className={`text-sm font-medium leading-tight flex-shrink-0 ml-0.5 ${isPrivateBooking ? 'text-gray-500' : (isFull ? 'text-gray-500' : 'text-gray-600')}`}>
                                {isPrivateBooking ? '貸切' : isFull ? '満' : `${available}`}
                              </div>
                            </div>
                            <div className={`text-sm font-medium leading-tight truncate ${isPrivateBooking ? 'text-gray-500' : 'text-gray-800'}`}>
                              {isPrivateBooking ? '貸切' : (event.scenario || event.scenarios?.title)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                  )}
                  {/* 下部グラデーション（スクロール可能な場合のみ表示） */}
                  {events.length > 3 && (
                    <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})


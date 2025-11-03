import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MapPin } from 'lucide-react'
import { memo } from 'react'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { formatDateJST } from '@/utils/dateUtils'

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
  return (
    <div>
      {/* 月選択と店舗フィルター */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <MonthSwitcher
          value={currentMonth}
          onChange={onMonthChange}
          showToday
          quickJump
        />
        
        {/* 店舗フィルター */}
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedStoreFilter} onValueChange={onStoreFilterChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="店舗を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての店舗</SelectItem>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* カレンダーグリッド */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        {/* 曜日ヘッダー（月曜始まり） */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {['月', '火', '水', '木', '金', '土', '日'].map((day, index) => (
            <div 
              key={day} 
              className={`text-center py-3 font-medium ${
                index === 5 ? 'text-blue-600' : index === 6 ? 'text-red-600' : ''
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
                } flex flex-col`}
              >
                {/* 日付 */}
                <div 
                  className={`text-xs font-medium p-1 pb-0.5 flex-shrink-0 flex items-center justify-between ${
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
                  {events.length > 4 && (
                    <span className="text-[10px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded-full">
                      +{events.length - 4}
                    </span>
                  )}
                </div>
                
                {/* 公演リスト（スクロール可能） */}
                <div className="relative space-y-0.5 px-0 pb-0 overflow-y-auto max-h-[250px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                  {events.length === 0 ? (
                    <div className="p-2">
                      <button
                        className="w-full text-xs py-1.5 px-2 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                        onClick={() => {
                          const dateStr = formatDateJST(day.date)
                          window.location.hash = `#private-booking-select?date=${dateStr}`
                        }}
                      >
                        貸切申し込み
                      </button>
                    </div>
                  ) : (
                    events.map((event: any, idx: number) => {
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
                            const scenario = scenarios.find(s => 
                              s.scenario_id === event.scenario_id || 
                              s.scenario_title === event.scenario
                            )
                            if (scenario) onCardClick(scenario.scenario_id)
                          }
                        }}
                        className={`text-xs p-1 rounded-none transition-shadow border-l-2 ${isPrivateBooking ? '' : 'cursor-pointer hover:shadow-md'}`}
                        style={{
                          borderLeftColor: isPrivateBooking ? '#9CA3AF' : (isFull ? '#9CA3AF' : storeColor),
                          backgroundColor: isPrivateBooking ? '#F3F4F6' : (isFull ? '#F3F4F6' : `${storeColor}15`)
                        }}
                      >
                        <div className="flex items-start gap-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold truncate text-[11px] leading-tight" style={{ color: isPrivateBooking ? '#6B7280' : (isFull ? '#6B7280' : storeColor) }}>
                                {event.start_time?.slice(0, 5)} {storeName}
                              </div>
                              <div className={`text-[11px] font-medium leading-tight flex-shrink-0 ml-1 ${isPrivateBooking ? 'text-gray-500' : (isFull ? 'text-gray-500' : 'text-gray-600')}`}>
                                {isPrivateBooking ? '貸切' : isFull ? '満席' : `残${available}席`}
                              </div>
                            </div>
                            <div className={`text-[11px] font-medium leading-tight truncate ${isPrivateBooking ? 'text-gray-500' : 'text-gray-800'}`}>
                              {isPrivateBooking ? '貸切予約済み' : (event.scenario || event.scenarios?.title)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                  )}
                  {/* 下部グラデーション（スクロール可能な場合のみ表示） */}
                  {events.length > 4 && (
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


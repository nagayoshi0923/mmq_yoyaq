import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MapPin } from 'lucide-react'
import { memo } from 'react'

interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
}

interface CalendarViewProps {
  currentMonth: Date
  onChangeMonth: (direction: 'prev' | 'next') => void
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
  onChangeMonth,
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
        <button
          onClick={() => onChangeMonth('prev')}
          className="px-4 py-2 rounded border hover:bg-muted transition-colors"
        >
          ← 前月
        </button>
        <h2 className="text-2xl font-bold">
          {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
        </h2>
        <button
          onClick={() => onChangeMonth('next')}
          className="px-4 py-2 rounded border hover:bg-muted transition-colors"
        >
          次月 →
        </button>
        
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
                  {events.map((event: any, idx: number) => {
                    const available = (event.max_participants || 8) - (event.current_participants || 0)
                    const isFull = available === 0
                    const storeName = getStoreName(event)
                    const storeColor = getStoreColor(event)
                    
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          const scenario = scenarios.find(s => 
                            s.scenario_id === event.scenario_id || 
                            s.scenario_title === event.scenario
                          )
                          if (scenario) onCardClick(scenario.scenario_id)
                        }}
                        className="text-xs p-1 rounded-none cursor-pointer hover:shadow-md transition-shadow border-l-2"
                        style={{
                          borderLeftColor: isFull ? '#9CA3AF' : storeColor,
                          backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`
                        }}
                      >
                        <div className="flex items-start gap-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="font-semibold truncate text-[11px] leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                                {event.start_time?.slice(0, 5)} {storeName}
                              </div>
                              <div className={`text-[11px] font-medium leading-tight flex-shrink-0 ml-1 ${isFull ? 'text-gray-500' : 'text-gray-600'}`}>
                                {event.is_private_booking ? '貸切' : isFull ? '満席' : `残${available}席`}
                              </div>
                            </div>
                            <div className="text-[11px] font-medium text-gray-800 leading-tight truncate">
                              {event.scenario || event.scenarios?.title}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
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


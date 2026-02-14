import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Bell, Calendar } from 'lucide-react'
import type { EventSchedule } from '../utils/types'
import { formatTime } from '../utils/formatters'

interface EventListProps {
  events: EventSchedule[]
  selectedEventId: string | null
  scenarioTitle: string
  onEventSelect: (eventId: string | null) => void
}

/**
 * イベントリストコンポーネント（公演日程一覧）
 */
export const EventList = memo(function EventList({
  events,
  selectedEventId,
  scenarioTitle,
  onEventSelect
}: EventListProps) {
  if (events.length === 0) {
    return (
      <div className="py-8 text-center">
        <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p className="text-sm text-muted-foreground">現在予約可能な公演はありません</p>
        <p className="text-xs text-muted-foreground mt-1">貸切リクエストタブからリクエストできます</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
      {events.map((event) => {
        const isSelected = selectedEventId === event.event_id
        const eventDate = new Date(event.date)
        const month = eventDate.getMonth() + 1
        const day = eventDate.getDate()
        const weekdays = ['日', '月', '火', '水', '木', '金', '土']
        const weekday = weekdays[eventDate.getDay()]
        const dayOfWeek = eventDate.getDay()
        const weekdayColor = dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-500'
        const storeColor = event.store_color || '#6B7280'
        const isSoldOut = event.available_seats === 0
        
        return (
          <div 
            key={event.event_id}
            className={`rounded-lg transition-all cursor-pointer border ${
              isSoldOut
                ? isSelected 
                  ? 'border-amber-400 bg-amber-50 shadow-sm' 
                  : 'border-gray-200 bg-gray-50/50 opacity-75 hover:opacity-100 hover:bg-gray-50'
                : isSelected 
                  ? 'border-blue-400 bg-blue-50 shadow-sm ring-1 ring-blue-200' 
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
            }`}
            onClick={() => onEventSelect(isSelected ? null : event.event_id)}
          >
            <div className="flex items-center gap-2.5 p-2.5 touch-manipulation">
              {/* 左：日付 */}
              <div className="flex-shrink-0 w-12 text-center">
                <div className="text-base font-bold leading-tight text-gray-900">{month}/{day}</div>
                <div className={`text-xs font-medium ${weekdayColor}`}>({weekday})</div>
              </div>
              
              {/* 中央：時間 + 店舗 */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">
                    {formatTime(event.start_time)}〜
                  </span>
                  <span 
                    className="text-xs px-2 py-0.5 rounded-sm font-medium"
                    style={{ 
                      backgroundColor: `${storeColor}15`,
                      color: storeColor,
                      border: `1px solid ${storeColor}30`
                    }}
                  >
                    {event.store_short_name}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {event.scenario_title || scenarioTitle}
                </div>
              </div>
              
              {/* 右：残り人数 + ボタン */}
              <div className="flex-shrink-0 flex items-center gap-2">
                {isSoldOut ? (
                  <>
                    <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-700 border-red-200 px-1.5">
                      満席
                    </Badge>
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={`h-8 px-2.5 text-xs touch-manipulation gap-1 ${
                        isSelected ? "bg-amber-500 hover:bg-amber-600" : "border-amber-300 text-amber-700 hover:bg-amber-50"
                      }`}
                    >
                      <Bell className="w-3 h-3" />
                      {isSelected ? '選択中' : 'キャンセル待ち'}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      残り<span className="font-bold text-sm text-gray-900">{event.available_seats}</span>名
                    </div>
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={`h-8 px-3 text-sm touch-manipulation ${
                        isSelected ? "bg-blue-500 hover:bg-blue-600" : "hover:bg-blue-50 hover:border-blue-300"
                      }`}
                    >
                      {isSelected ? '選択中' : '選択'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
})

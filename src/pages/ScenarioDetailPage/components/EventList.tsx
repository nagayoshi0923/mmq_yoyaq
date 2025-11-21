import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
      <Card>
        <CardContent className="p-4 text-center text-muted-foreground">
          現在予約可能な公演はありません
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {events.map((event) => {
        const isSelected = selectedEventId === event.event_id
        const eventDate = new Date(event.date)
        const month = eventDate.getMonth() + 1
        const day = eventDate.getDate()
        const weekdays = ['日', '月', '火', '水', '木', '金', '土']
        const weekday = weekdays[eventDate.getDay()]
        const dayOfWeek = eventDate.getDay()
        const weekdayColor = dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : ''
        
        return (
          <Card 
            key={event.event_id}
            className={`transition-all overflow-hidden ${
              event.available_seats === 0
                ? 'opacity-50 cursor-not-allowed bg-gray-50 border-2 border-gray-200'
                : `cursor-pointer ${isSelected ? 'border-2 border-blue-500 bg-blue-50' : 'hover:bg-accent border-2 border-gray-200'}`
            }`}
            onClick={() => {
              if (event.available_seats === 0) return
              onEventSelect(isSelected ? null : event.event_id)
            }}
          >
            <div className="flex items-center gap-3 p-3 touch-manipulation min-h-[64px]">
              {/* 一番左：店舗 */}
              <div className="flex items-center gap-1.5 flex-shrink-0 justify-center">
                <div 
                  className="flex-shrink-0 w-3 h-3 rounded-sm"
                  style={{ 
                    backgroundColor: event.store_color || '#9CA3AF'
                  }}
                />
                <span 
                  className="text-sm whitespace-nowrap"
                  style={{ 
                    color: event.store_color || '#6B7280'
                  }}
                >
                  {event.store_short_name}
                </span>
              </div>
              
              {/* 左側：日付+時間(上) + タイトル(下) */}
              <div className="flex flex-col gap-1 flex-1 min-w-0 justify-center">
                {/* 日付 + 時間（同じ行） */}
                <div className="flex items-center gap-2">
                  <span className="text-sm whitespace-nowrap">
                    {month}/{day} <span className={`text-sm ${weekdayColor}`}>({weekday})</span>
                  </span>
                  <span className="font-bold text-sm whitespace-nowrap">
                    {formatTime(event.start_time)}〜
                  </span>
                </div>
                {/* タイトル */}
                <div className="text-sm text-muted-foreground truncate">
                  {event.scenario_title || scenarioTitle}
                </div>
              </div>
              
              {/* 右側：残り人数 / 満席バッジ + ボタン */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {event.available_seats === 0 ? (
                  <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300 text-sm px-2 py-1 whitespace-nowrap">
                    満席
                  </Badge>
                ) : (
                  <div className="text-right whitespace-nowrap">
                    <div className="font-bold text-sm">
                      残り{event.available_seats}人
                    </div>
                  </div>
                )}
                
                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  disabled={event.available_seats === 0}
                  className={`min-w-[50px] whitespace-nowrap text-sm h-9 px-3 touch-manipulation ${
                    isSelected ? "bg-blue-500 text-white hover:bg-blue-600" : ""
                  }`}
                >
                  {event.available_seats === 0 ? '満席' : '選択'}
                </Button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
})


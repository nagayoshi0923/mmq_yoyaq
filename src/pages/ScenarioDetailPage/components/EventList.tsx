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
    <div className="space-y-3 max-h-96 overflow-y-auto">
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
        
        return (
          <Card 
            key={event.event_id}
            className={`transition-all ${
              event.available_seats === 0
                ? 'opacity-50 cursor-not-allowed bg-gray-50'
                : `cursor-pointer ${isSelected ? 'border-2 border-blue-500 bg-blue-50' : 'border border-gray-200 hover:bg-accent'}`
            }`}
            onClick={() => {
              if (event.available_seats === 0) return
              onEventSelect(isSelected ? null : event.event_id)
            }}
          >
            <div className="flex items-center gap-3 p-3 touch-manipulation">
              {/* 左：日付（縦並び） */}
              <div className="flex-shrink-0 w-12 text-center">
                <div className="text-base font-semibold leading-tight">{month}/{day}</div>
                <div className={`text-sm ${weekdayColor}`}>({weekday})</div>
              </div>
              
              {/* 中央：時間 + 店舗 + タイトル */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm">
                    {formatTime(event.start_time)}〜
                  </span>
                  <span 
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ 
                      backgroundColor: `${storeColor}20`,
                      color: storeColor
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
              <div className="flex-shrink-0 flex items-center gap-3">
                {event.available_seats === 0 ? (
                  <Badge variant="secondary" className="text-xs">
                    満席
                  </Badge>
                ) : (
                  <>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      残り<span className="font-semibold text-foreground">{event.available_seats}</span>人
                    </div>
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={`h-8 px-4 text-sm touch-manipulation ${
                        isSelected ? "bg-blue-500 hover:bg-blue-600" : ""
                      }`}
                    >
                      {isSelected ? '選択中' : '選択'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
})


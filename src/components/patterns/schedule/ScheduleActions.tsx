/** 「カレンダーに登録」「地図を開く」を横に並べる（確定した貸切・予約だけで出す） */
import type { CalendarEventInput } from '@/lib/calendarEvent'
import { mapSearchUrl } from '@/lib/calendarEvent'
import { cn } from '@/lib/utils'
import { AddToCalendarButton } from './AddToCalendarButton'
import { OpenMapButton } from './OpenMapButton'

interface ScheduleActionsProps {
  event: CalendarEventInput | null
  address: string | null | undefined
  mapUrl?: string | null
  className?: string
  /** ボタンを横幅いっぱいに等分する */
  stretch?: boolean
  testId?: string
}

export function ScheduleActions({ event, address, mapUrl, className, stretch = false, testId = 'schedule-actions' }: ScheduleActionsProps) {
  const hasMap = Boolean(mapSearchUrl(address, mapUrl))
  if (!event && !hasMap) return null
  const item = stretch ? 'flex-1' : undefined
  return (
    <div className={cn('flex gap-2', className)} data-testid={testId}>
      <AddToCalendarButton event={event} className={item} />
      <OpenMapButton address={address} mapUrl={mapUrl} className={item} />
    </div>
  )
}

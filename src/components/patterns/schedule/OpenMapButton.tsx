/** 「地図を開く」。店舗の住所で Google マップを新しいタブで開く（店舗に地図の URL があればそれを優先） */
import { MapPin } from 'lucide-react'
import { mapSearchUrl } from '@/lib/calendarEvent'
import { cn } from '@/lib/utils'
import { SCHEDULE_ACTION_BUTTON } from './scheduleActionStyle'

interface OpenMapButtonProps {
  address: string | null | undefined
  mapUrl?: string | null
  className?: string
  testId?: string
}

export function OpenMapButton({ address, mapUrl, className, testId = 'open-map' }: OpenMapButtonProps) {
  const href = mapSearchUrl(address, mapUrl)
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center justify-center border font-medium transition-colors', SCHEDULE_ACTION_BUTTON, className)}
      data-testid={testId}
    >
      <MapPin className="w-4 h-4" aria-hidden="true" />
      地図を開く
    </a>
  )
}

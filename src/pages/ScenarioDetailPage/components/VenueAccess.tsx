import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin } from 'lucide-react'
import type { EventSchedule } from '../utils/types'

interface VenueAccessProps {
  events: EventSchedule[]
}

export const VenueAccess = memo(function VenueAccess({ events }: VenueAccessProps) {
  if (events.length === 0) return null

  // ユニークな会場のリスト
  const uniqueVenues = Array.from(new Set(events.map(e => e.store_name)))

  return (
    <div>
      <h3 className="font-bold mb-2 sm:mb-3 text-sm sm:text-base">会場アクセス</h3>
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
          {uniqueVenues.map((storeName) => {
            const event = events.find(e => e.store_name === storeName)!
            return (
              <div key={storeName} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: event.store_color }} />
                  <p className="font-bold text-sm sm:text-base" style={{ color: event.store_color }}>
                    {storeName}
                  </p>
                </div>
                {event.store_address && (
                  <p className="text-xs sm:text-sm text-muted-foreground pl-5 sm:pl-5.5">
                    {event.store_address}
                  </p>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
})


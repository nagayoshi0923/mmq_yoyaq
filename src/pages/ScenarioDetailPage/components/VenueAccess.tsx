import { memo, useMemo } from 'react'
import { MapPin, Navigation } from 'lucide-react'
import type { EventSchedule } from '../utils/types'
import { getColorFromName } from '@/lib/utils'

interface VenueAccessProps {
  events?: EventSchedule[]
  selectedEventId?: string | null
  selectedStoreIds?: string[]
  stores?: Array<{
    id: string
    name: string
    short_name: string
    color: string
    address: string
  }>
  mode?: 'schedule' | 'private'
}

export const VenueAccess = memo(function VenueAccess({ 
  events = [], 
  selectedEventId, 
  selectedStoreIds = [],
  stores = [],
  mode = 'schedule'
}: VenueAccessProps) {
  const displayVenues = useMemo(() => {
    if (mode === 'schedule') {
      if (!selectedEventId || events.length === 0) return []
      const selectedEvent = events.find(e => e.event_id === selectedEventId)
      if (!selectedEvent) return []
      return [{
        name: selectedEvent.store_name,
        short_name: selectedEvent.store_short_name,
        color: selectedEvent.store_color || '#6B7280',
        address: selectedEvent.store_address || ''
      }]
    } else {
      if (selectedStoreIds.length === 0) return []
      return selectedStoreIds.map(storeId => {
        const store = stores.find(s => s.id === storeId)
        if (!store) return null
        return {
          name: store.name || '',
          short_name: store.short_name || '',
          color: store.color || '#6B7280',
          address: store.address || ''
        }
      }).filter(Boolean) as Array<{
        name: string
        short_name: string
        color: string
        address: string
      }>
    }
  }, [mode, selectedEventId, events, selectedStoreIds, stores])

  if (displayVenues.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        {mode === 'schedule' ? '会場アクセス' : '選択店舗'}
      </h3>
      {mode === 'private' && displayVenues.length > 1 && (
        <p className="text-xs text-gray-500 mb-2">
          ※ この中からいずれかの店舗で確定します
        </p>
      )}
      <div className="space-y-2">
        {displayVenues.map((venue, index) => {
          const isHexColor = venue.color && venue.color.startsWith('#')
          const storeColor = venue.color 
            ? (isHexColor ? venue.color : getColorFromName(venue.color))
            : '#6B7280'
          
          return (
            <div 
              key={`${venue.name}-${index}`} 
              className="bg-white border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
                    style={{ backgroundColor: `${storeColor}15`, border: `1px solid ${storeColor}30` }}
                  >
                    <MapPin className="w-4 h-4" style={{ color: storeColor }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{venue.name}</p>
                    {venue.address && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {venue.address}
                      </p>
                    )}
                  </div>
                </div>
                {venue.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors px-2 py-1 rounded-md hover:bg-blue-50"
                  >
                    <Navigation className="w-3 h-3" />
                    地図
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

import { memo, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin } from 'lucide-react'
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
  // 公演日程タブ: 選択した公演の会場情報を表示
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
      // 貸切リクエストタブ: 選択した店舗の会場情報を表示
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
      <h3 className="text-sm font-medium text-muted-foreground mb-3">
        {mode === 'schedule' ? '会場アクセス' : '選択店舗'}
      </h3>
      <Card>
        <CardContent className="p-4 space-y-3">
          {displayVenues.map((venue, index) => {
            // 色名（例: "blue", "green"）か色コード（例: "#3B82F6"）かを判定
            const isHexColor = venue.color && venue.color.startsWith('#')
            const storeColor = venue.color 
              ? (isHexColor ? venue.color : getColorFromName(venue.color))
              : '#6B7280'
            
            return (
              <div key={`${venue.name}-${index}`} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: storeColor }} />
                  <p className="text-sm font-medium" style={{ color: storeColor }}>
                    {venue.name}
                  </p>
                </div>
                {venue.address && (
                  <p className="text-xs text-muted-foreground pl-5">
                    {venue.address}
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


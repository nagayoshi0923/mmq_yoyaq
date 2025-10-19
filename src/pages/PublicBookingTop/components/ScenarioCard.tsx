import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, Users, MapPin } from 'lucide-react'
import { getColorFromName } from '@/lib/utils'
import type { ScenarioCard as ScenarioCardType } from '../hooks/useBookingData'

interface ScenarioCardProps {
  scenario: ScenarioCardType
  onClick: (id: string) => void
}

/**
 * シナリオカード表示コンポーネント
 */
export const ScenarioCard = memo(function ScenarioCard({ scenario, onClick }: ScenarioCardProps) {
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const formatTime = (timeStr?: string): string => {
    if (!timeStr) return ''
    return timeStr.slice(0, 5)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">予約可能</Badge>
      case 'few_seats':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">残席わずか</Badge>
      case 'sold_out':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">満席</Badge>
      case 'private_booking':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">貸切受付中</Badge>
      default:
        return null
    }
  }

  return (
    <Card 
      className="overflow-hidden hover:shadow-lg transition-all cursor-pointer group"
      onClick={() => onClick(scenario.scenario_id)}
    >
      {/* キービジュアル */}
      <div className="relative h-48 bg-gradient-to-br from-purple-100 to-blue-100 overflow-hidden">
        {scenario.key_visual_url ? (
          <img 
            src={scenario.key_visual_url} 
            alt={scenario.scenario_title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-4xl font-bold text-purple-200">
              {scenario.scenario_title.charAt(0)}
            </div>
          </div>
        )}
        
        {/* バッジ */}
        <div className="absolute top-2 left-2 flex gap-2">
          {scenario.is_new && (
            <Badge className="bg-red-500 text-white">NEW</Badge>
          )}
          {getStatusBadge(scenario.status)}
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        {/* タイトル */}
        <div>
          <h3 className="font-bold text-lg line-clamp-2 group-hover:text-purple-600 transition-colors">
            {scenario.scenario_title}
          </h3>
          <p className="text-sm text-muted-foreground">{scenario.author}</p>
        </div>

        {/* 次回公演情報 */}
        {scenario.next_event_date && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{formatDate(scenario.next_event_date)}</span>
              <Clock className="h-4 w-4 text-muted-foreground ml-2" />
              <span>{formatTime(scenario.next_event_time)}</span>
            </div>
            
            {scenario.store_name && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <Badge 
                  variant="outline" 
                  style={{ 
                    backgroundColor: scenario.store_color ? `${scenario.store_color}20` : undefined,
                    borderColor: scenario.store_color || getColorFromName(scenario.store_name)
                  }}
                  className="text-xs"
                >
                  {scenario.store_name}
                </Badge>
              </div>
            )}

            {scenario.available_seats !== undefined && scenario.available_seats > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-green-600 font-medium">残り{scenario.available_seats}席</span>
              </div>
            )}
          </div>
        )}

        {/* シナリオ情報 */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-2">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{scenario.duration}分</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>{scenario.player_count_min}-{scenario.player_count_max}名</span>
          </div>
        </div>

        {/* ジャンル */}
        {scenario.genre.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {scenario.genre.slice(0, 3).map((g, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {g}
              </Badge>
            ))}
            {scenario.genre.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{scenario.genre.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
})


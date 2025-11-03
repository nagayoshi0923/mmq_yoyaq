import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Clock, Users, Heart } from 'lucide-react'
import { usePrefetch } from '@/hooks/usePrefetch'
import type { ScenarioCard as ScenarioCardType } from '../hooks/useBookingData'

interface ScenarioCardProps {
  scenario: ScenarioCardType
  onClick: (id: string) => void
  isFavorite?: boolean
  onToggleFavorite?: (scenarioId: string, e: React.MouseEvent) => void
}

/**
 * シナリオカード表示コンポーネント
 */
export const ScenarioCard = memo(function ScenarioCard({ scenario, onClick, isFavorite = false, onToggleFavorite }: ScenarioCardProps) {
  const { prefetchScenario } = usePrefetch()
  
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite?.(scenario.scenario_id, e)
  }
  
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }


  return (
    <Card 
      className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
      onClick={() => onClick(scenario.scenario_id)}
      onMouseEnter={() => prefetchScenario(scenario.scenario_id)}
    >
      {/* キービジュアル */}
      <div className="relative w-full aspect-[1/1.4] bg-gray-200 overflow-hidden flex items-center justify-center group">
        <OptimizedImage
          src={scenario.key_visual_url}
          alt={scenario.scenario_title}
          className="w-full h-full object-cover"
          responsive={true}
          srcSetSizes={[300, 600, 900]}
          breakpoints={{ mobile: 300, tablet: 400, desktop: 600 }}
          useWebP={true}
          quality={85}
          fallback={
            <div className="text-center px-4">
              <div className="text-xl font-medium text-gray-400 leading-relaxed">
                {scenario.scenario_title}
              </div>
            </div>
          }
        />
        
        {/* お気に入りボタン */}
        {onToggleFavorite && (
          <Button
            onClick={handleFavoriteClick}
            size="icon"
            variant="ghost"
            className={`absolute top-2 right-2 h-9 w-9 rounded-full bg-white/90 hover:bg-white shadow-md transition-all ${
              isFavorite ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-500'
            }`}
          >
            <Heart 
              className={`h-5 w-5 transition-all ${isFavorite ? 'fill-current' : ''}`}
            />
          </Button>
        )}
      </div>

      <CardContent className="p-2 space-y-0.5 bg-white">
        {/* 著者 */}
        <p className="text-xs text-gray-500">{scenario.author}</p>
        
        {/* タイトル */}
        <h3 className="font-bold text-base truncate leading-tight mt-0.5">
          {scenario.scenario_title}
        </h3>

        {/* 人数・時間 */}
        <div className="flex items-center gap-2.5 text-sm text-gray-600 mt-0.5">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>
              {scenario.player_count_min === scenario.player_count_max
                ? `${scenario.player_count_max}人`
                : `${scenario.player_count_min}~${scenario.player_count_max}人`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{scenario.duration}分</span>
          </div>
        </div>

        {/* 次回公演（最大3つまで表示） */}
        {scenario.next_events && scenario.next_events.length > 0 && (
          <div className="text-sm text-gray-700 mt-0.5 space-y-0.5">
            {scenario.next_events.map((event, index) => (
              <div key={index}>
                次回: {formatDate(event.date)}
                {event.time && ` ${event.time.slice(0, 5)}`}
                {event.store_name && ` @ ${event.store_name}`}
                {event.available_seats !== undefined && event.available_seats >= 0 && (
                  <span className="ml-1 text-gray-600">
                    (残り{event.available_seats}席)
                  </span>
                )}
              </div>
            ))}
            {scenario.total_events_count && scenario.total_events_count > 3 && (
              <div className="text-xs text-gray-500">
                ...他 {scenario.total_events_count - 3}件
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
})


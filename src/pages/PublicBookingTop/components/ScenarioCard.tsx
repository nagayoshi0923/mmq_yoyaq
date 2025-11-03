import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Calendar, Clock, Users, MapPin, Heart } from 'lucide-react'
import { getColorFromName } from '@/lib/utils'
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

  const formatTime = (timeStr?: string): string => {
    if (!timeStr) return ''
    return timeStr.slice(0, 5)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-green-600 text-white text-xs">開催中</Badge>
      case 'few_seats':
        return <Badge className="bg-orange-500 text-white text-xs">残りわずか</Badge>
      case 'sold_out':
        return <Badge className="bg-red-600 text-white text-xs">完売</Badge>
      case 'private_booking':
        return <Badge className="bg-gray-400 text-white text-xs">過去限定公開</Badge>
      default:
        return null
    }
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

      <CardContent className="p-2 space-y-1 bg-white">
        {/* 著者 */}
        <p className="text-xs text-gray-500">{scenario.author}</p>
        
        {/* タイトル */}
        <h3 className="font-bold text-base truncate leading-tight">
          {scenario.scenario_title}
        </h3>

        {/* 人数・時間 */}
        <div className="flex items-center gap-2.5 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{scenario.player_count_min}~{scenario.player_count_max}人</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{Math.floor(scenario.duration / 60)}.{Math.round((scenario.duration % 60) / 6)}h</span>
          </div>
        </div>

        {/* 次回公演日（開催場所も表示） */}
        {scenario.next_event_date && (
          <div className="flex items-center gap-1.5 text-sm text-gray-700">
            <Calendar className="h-4 w-4 text-gray-500" />
            <span>
              次回: {formatDate(scenario.next_event_date)}
              {scenario.store_name && ` @ ${scenario.store_name}`}
            </span>
          </div>
        )}

        {/* 店舗（次回公演がない場合のみ表示） */}
        {!scenario.next_event_date && scenario.store_name && (
          <div className="flex items-center gap-1.5 text-sm text-gray-700">
            <MapPin className="h-4 w-4 text-gray-500" />
            <span>{scenario.store_name}</span>
          </div>
        )}

        {/* ステータスバッジ */}
        <div className="pt-1">
          {getStatusBadge(scenario.status)}
        </div>
      </CardContent>
    </Card>
  )
})


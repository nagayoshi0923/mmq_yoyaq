import { memo, useState, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Users, Heart } from 'lucide-react'
import { usePrefetch } from '@/hooks/usePrefetch'
import type { ScenarioCard as ScenarioCardType } from '../hooks/useBookingData'

// 画像コンポーネントをインライン化して最適化
const LazyImage = ({ src, alt, className }: { src?: string, alt: string, className?: string }) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const imgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '50px' }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={imgRef} className={`relative w-full h-full bg-gray-200 ${className}`}>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {isInView && src ? (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIsLoaded(true)}
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          <span className="text-xs">{alt}</span>
        </div>
      )}
    </div>
  )
}

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
  
  const formatDate = (dateStr?: string): { date: string, weekday: string, dayOfWeek: number } => {
    if (!dateStr) return { date: '', weekday: '', dayOfWeek: 0 }
    const date = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    const dayOfWeek = date.getDay()
    return {
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      weekday: weekdays[dayOfWeek],
      dayOfWeek: dayOfWeek
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
        <LazyImage
          src={scenario.key_visual_url}
          alt={scenario.scenario_title}
          className="w-full h-full"
        />
        
        {/* お気に入りボタン */}
        {onToggleFavorite && (
          <button
            onClick={handleFavoriteClick}
            className={`absolute top-2 right-2 transition-all opacity-70 hover:opacity-100 touch-manipulation ${
              isFavorite ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-500'
            }`}
          >
            <Heart 
              className={`h-5 w-5 sm:h-6 sm:w-6 transition-all ${isFavorite ? 'fill-current' : ''}`}
            />
          </button>
        )}
      </div>

      <CardContent className="p-2 sm:p-2.5 md:p-3 space-y-0.5 sm:space-y-1 bg-white">
        {/* 著者 */}
        <p className="text-xs text-gray-500">{scenario.author}</p>
        
        {/* タイトル */}
        <h3 className="font-bold text-sm sm:text-base truncate leading-tight mt-0.5 sm:mt-1">
          {scenario.scenario_title}
        </h3>

        {/* 人数・時間・参加費 */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1">
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>
              {scenario.player_count_min === scenario.player_count_max
                ? `${scenario.player_count_max}人`
                : `${scenario.player_count_min}~${scenario.player_count_max}人`}
            </span>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>{scenario.duration}分</span>
          </div>
          {scenario.participation_fee && (
            <div className="flex items-center gap-0.5 sm:gap-1">
              <span>¥{scenario.participation_fee.toLocaleString()}〜</span>
            </div>
          )}
        </div>

        {/* ジャンル（カテゴリ） */}
        {scenario.genre && scenario.genre.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 sm:mt-1.5">
            {scenario.genre.slice(0, 3).map((genre, index) => (
              <Badge 
                key={index} 
                variant="secondary" 
                className="text-xs px-1 sm:px-1.5 py-0.5 h-4 sm:h-5 font-normal bg-gray-100 border-0 rounded-[2px]"
              >
                {genre}
              </Badge>
            ))}
            {scenario.genre.length > 3 && (
              <Badge 
                variant="secondary" 
                className="text-xs px-1 sm:px-1.5 py-0.5 h-4 sm:h-5 font-normal bg-gray-100 border-0 rounded-[2px]"
              >
                +{scenario.genre.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* 次回公演（最大3つまで表示） */}
        {scenario.next_events && scenario.next_events.length > 0 && (
          <div className="space-y-0.5 sm:space-y-1 mt-1 sm:mt-1.5">
            {scenario.next_events.map((event, index) => {
              const dateInfo = formatDate(event.date)
              const isSunday = dateInfo.dayOfWeek === 0
              const isSaturday = dateInfo.dayOfWeek === 6
              
              return (
                <div 
                  key={index} 
                  className={`flex items-center gap-1 sm:gap-1.5 text-sm py-0.5 sm:py-1 px-1 sm:px-1.5 md:px-2 bg-gray-100 rounded-[3px] ${
                    index === 0 ? 'mt-0.5 sm:mt-1' : ''
                  }`}
                >
                  <span className="font-medium text-gray-800">
                    {dateInfo.date}
                    <span className={`ml-0.5 ${isSunday ? 'text-red-600' : isSaturday ? 'text-blue-600' : 'text-gray-600'}`}>
                      ({dateInfo.weekday})
                    </span>
                    {event.time && (
                      <span className="font-normal text-gray-600 ml-0.5">
                        {event.time.slice(0, 5)}
                      </span>
                    )}
                  </span>
                  {event.store_name && (
                    <span className="text-gray-500 text-xs truncate">
                      @ {event.store_name}
                    </span>
                  )}
                  {/* 空席がある場合は残席数を表示、満席の場合は何も表示しない */}
                  {event.available_seats !== undefined && event.available_seats > 0 && (
                    <span className={`text-xs font-medium ml-auto flex-shrink-0 ${
                      event.available_seats <= 2 
                        ? 'text-orange-600' 
                        : 'text-gray-600'
                    }`}>
                      残{event.available_seats}席
                    </span>
                  )}
                </div>
              )
            })}
            {scenario.total_events_count && scenario.total_events_count > 3 && (
              <div className="text-xs text-gray-400 pt-0.5">
                ...他 {scenario.total_events_count - 3}件
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
})


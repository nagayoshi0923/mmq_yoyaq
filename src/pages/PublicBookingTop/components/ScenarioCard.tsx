import { memo, useState, useRef, useEffect } from 'react'
import { Clock, Users, Heart, Sparkles } from 'lucide-react'
import { usePrefetch } from '@/hooks/usePrefetch'
import { getColorFromName } from '@/lib/utils'
import { devDb } from '@/components/ui/DevField'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

/**
 * シナリオカード用の汎用型定義
 * PublicBookingTop と PlatformTop で共通利用
 */
export interface ScenarioCardData {
  scenario_id: string
  scenario_slug?: string
  scenario_title: string
  key_visual_url?: string | null
  author?: string
  duration: number
  player_count_min: number
  player_count_max: number
  participation_fee?: number
  next_events?: Array<{
    date: string
    time?: string
    store_name?: string
    store_short_name?: string
    store_color?: string
    available_seats?: number
  }>
  total_events_count?: number
}

// 画像コンポーネントをインライン化して最適化
// 背景にぼかした画像を表示し、メインはobject-containで全体表示
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
    <div ref={imgRef} className={`relative w-full h-full bg-gray-900 overflow-hidden ${className}`}>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {isInView && src ? (
        <>
          {/* 背景：ぼかした画像で余白を埋める */}
          <div 
            className="absolute inset-0 scale-110"
            style={{
              backgroundImage: `url(${src})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(20px) brightness(0.7)',
            }}
          />
          {/* メイン画像：全体を表示 */}
          <img
            src={src}
            alt={alt}
            className={`relative w-full h-full object-contain transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setIsLoaded(true)}
            loading="lazy"
          />
        </>
      ) : !src && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-gray-300" />
        </div>
      )}
    </div>
  )
}

interface ScenarioCardProps {
  scenario: ScenarioCardData
  onClick: (id: string) => void
  isFavorite?: boolean
  onToggleFavorite?: (scenarioId: string, e: React.MouseEvent) => void
  organizationName?: string | null
  isFirst?: boolean
}

/**
 * シナリオカード表示コンポーネント - PlatformTop統一デザイン
 */
export const ScenarioCard = memo(function ScenarioCard({ 
  scenario, 
  onClick, 
  isFavorite = false, 
  onToggleFavorite, 
  organizationName,
  isFirst = false
}: ScenarioCardProps) {
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
    <div 
      className="group cursor-pointer"
      onClick={() => onClick(scenario.scenario_slug || scenario.scenario_id)}
      onMouseEnter={() => prefetchScenario(scenario.scenario_id)}
    >
      {/* カード本体 - シャープデザイン（1カラム：横、2カラム以上：縦） */}
      <div 
        className="relative bg-white overflow-hidden border border-gray-200 group-hover:border-gray-300 group-hover:shadow-lg transition-all duration-200 flex md:flex-col hover:scale-[1.02]"
        style={{ borderRadius: 0 }}
      >
        {/* キービジュアル */}
        <div className="relative w-32 md:w-full aspect-[3/4] overflow-hidden bg-gray-100 flex-shrink-0">
          <LazyImage
            src={scenario.key_visual_url ?? undefined}
            alt={scenario.scenario_title}
            className="w-full h-full"
          />
          {/* 人気タグ */}
          {isFirst && (
            <div 
              className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-black"
              style={{ backgroundColor: THEME.accent }}
            >
              人気
            </div>
          )}
        </div>

        {/* コンテンツ */}
        <div className="p-2 sm:p-3 flex-1 min-w-0">
          {/* 著者 + お気に入りボタン */}
          <div className="flex items-center justify-between mb-1">
            {scenario.author && (
              <p className="text-xs text-gray-500" {...devDb('scenarios.author')}>{scenario.author}</p>
            )}
            {onToggleFavorite && (
              <button
                onClick={handleFavoriteClick}
                className="flex-shrink-0 p-1 transition-colors hover:bg-red-50 rounded"
              >
                <Heart className={`h-4 w-4 fill-current text-red-500 ${
                  isFavorite ? 'opacity-100' : 'opacity-30 hover:opacity-50'
                }`} />
              </button>
            )}
          </div>
          
          {/* タイトル */}
          <h3 
            className="text-sm font-bold text-gray-900 leading-snug mb-2 line-clamp-2"
            {...devDb('scenarios.title')}
          >
            {scenario.scenario_title}
          </h3>

          {/* 人数・時間・参加費 */}
          <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
            <span className="flex items-center gap-1" {...devDb('scenarios.player_count_min/max')}>
              <Users className="h-3 w-3" />
              {scenario.player_count_min === scenario.player_count_max
                ? `${scenario.player_count_max}人`
                : `${scenario.player_count_min}-${scenario.player_count_max}人`}
            </span>
            <span className="flex items-center gap-1" {...devDb('scenarios.duration')}>
              <Clock className="h-3 w-3" />
              {scenario.duration >= 60 
                ? `${Math.floor(scenario.duration / 60)}h${scenario.duration % 60 > 0 ? `${scenario.duration % 60}m` : ''}`
                : `${scenario.duration}分`}
            </span>
            {scenario.participation_fee && (
              <span {...devDb('scenarios.participation_fee')}>
                ¥{scenario.participation_fee.toLocaleString()}〜
              </span>
            )}
          </div>

          {/* 次回公演 */}
          {scenario.next_events && scenario.next_events.length > 0 && (
            <div className="border-t border-gray-100 pt-2 space-y-1">
              {scenario.next_events.slice(0, 2).map((event, index) => {
                const dateInfo = formatDate(event.date)
                const isSunday = dateInfo.dayOfWeek === 0
                const isSaturday = dateInfo.dayOfWeek === 6
                
                return (
                  <div 
                    key={index} 
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span 
                        className="w-1 h-4 flex-shrink-0"
                        style={{ backgroundColor: event.store_color ? getColorFromName(event.store_color) : THEME.primary }}
                      />
                      <span className="font-medium text-gray-900">
                        {dateInfo.date}
                        <span className={`ml-0.5 font-normal ${isSunday ? 'text-red-500' : isSaturday ? 'text-blue-500' : 'text-gray-400'}`}>
                          ({dateInfo.weekday})
                        </span>
                      </span>
                      {event.time && (
                        <span className="text-gray-500">{event.time.slice(0, 5)}</span>
                      )}
                      <span className="text-gray-400 truncate">
                        {organizationName && event.store_short_name 
                          ? `${organizationName}${event.store_short_name}` 
                          : (event.store_short_name || event.store_name)}
                      </span>
                    </div>
                    {event.available_seats !== undefined && event.available_seats > 0 && (
                      <span 
                        className="text-[10px] font-bold px-1.5 py-0.5 flex-shrink-0 ml-2"
                        style={{
                          backgroundColor: event.available_seats <= 2 ? '#FEE2E2' : THEME.accentLight,
                          color: event.available_seats <= 2 ? '#DC2626' : THEME.accent,
                          borderRadius: 0,
                        }}
                      >
                        残{event.available_seats}
                      </span>
                    )}
                  </div>
                )
              })}
              {(() => {
                const eventsCount = scenario.total_events_count ?? scenario.next_events?.length ?? 0
                return eventsCount > 2 && (
                  <p className="text-[10px] text-gray-400">
                    +{eventsCount - 2}件
                  </p>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

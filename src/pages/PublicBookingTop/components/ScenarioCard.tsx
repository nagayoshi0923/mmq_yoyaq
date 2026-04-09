import { memo, useState, useRef, useEffect } from 'react'
import { Clock, Users, Heart, Sparkles, CheckCheck } from 'lucide-react'
import { usePrefetch } from '@/hooks/usePrefetch'
import { getColorFromName } from '@/lib/utils'
import { devDb } from '@/components/ui/DevField'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { getOptimizedImageUrl } from '@/utils/imageUtils'

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
    current_participants?: number
    is_extended?: boolean
    is_confirmed?: boolean
  }>
  total_events_count?: number
  // バッジ用フィールド
  is_recommended?: boolean  // おすすめ（管理者設定）
  favorite_count?: number   // 遊びたいリスト登録数（100以上で人気バッジ）
  release_date?: string     // リリース日（1年以上でロングセラー）
}

// 画像コンポーネントをインライン化して最適化
// 背景にぼかした画像を表示し、メインはobject-containで全体表示
// 🚀 パフォーマンス最適化: WebP変換 + サイズ縮小
const LazyImage = ({ src, alt, className }: { src?: string, alt: string, className?: string }) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
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

  const optimizedSrc = getOptimizedImageUrl(src, { width: 400, format: 'webp', quality: 80 })
  const bgSrc = getOptimizedImageUrl(src, { width: 100, format: 'webp', quality: 50 })

  // Transform失敗時は元URLにフォールバック
  const displaySrc = useFallback ? src : optimizedSrc
  const displayBgSrc = useFallback ? src : bgSrc

  const handleError = () => {
    if (!useFallback && src && src !== optimizedSrc) {
      setUseFallback(true)
    } else {
      setIsLoaded(true)
    }
  }

  return (
    <div ref={imgRef} className={`relative w-full h-full bg-gray-900 overflow-hidden ${className}`}>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {isInView && displaySrc ? (
        <>
          <div 
            className="absolute inset-0 scale-110"
            style={{
              backgroundImage: `url(${displayBgSrc})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(20px) brightness(0.7)',
            }}
          />
          <img
            src={displaySrc}
            alt={alt}
            className={`relative w-full h-full object-contain transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setIsLoaded(true)}
            onError={handleError}
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
  isPlayed?: boolean
  onToggleFavorite?: (scenarioId: string, e: React.MouseEvent) => void
  onTogglePlayed?: (scenarioId: string, scenarioTitle: string, e: React.MouseEvent) => void
  organizationName?: string | null
}

/**
 * シナリオカード表示コンポーネント - PlatformTop統一デザイン
 */
export const ScenarioCard = memo(function ScenarioCard({ 
  scenario, 
  onClick, 
  isFavorite = false, 
  isPlayed = false,
  onToggleFavorite,
  onTogglePlayed,
  organizationName
}: ScenarioCardProps) {
  const { prefetchScenario } = usePrefetch()
  
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite?.(scenario.scenario_id, e)
  }

  const handlePlayedClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onTogglePlayed?.(scenario.scenario_id, scenario.scenario_title, e)
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
          {/* バッジ表示: 成立間近 > 募集延長中 > おすすめ > ロングセラー > 人気 */}
          {(() => {
            const nextEvent = scenario.next_events?.[0]
            
            // 成立間近 - 最優先
            // 4人以下のシナリオ: 残り2人以下、5人以上のシナリオ: 残り3人以下
            if (nextEvent) {
              const currentParticipants = nextEvent.current_participants ?? 0
              const minRequired = scenario.player_count_min
              const remaining = minRequired - currentParticipants
              const threshold = minRequired <= 4 ? 2 : 3
              if (remaining >= 1 && remaining <= threshold) {
                return (
                  <div 
                    className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white"
                    style={{ backgroundColor: '#DC2626' }}
                  >
                    成立間近！
                  </div>
                )
              }
            }
            // 募集延長中 - 高優先度
            if (nextEvent?.is_extended) {
              return (
                <div 
                  className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white"
                  style={{ backgroundColor: '#F59E0B' }}
                >
                  募集延長中！
                </div>
              )
            }
            // おすすめ（管理者設定）
            if (scenario.is_recommended) {
              return (
                <div 
                  className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white"
                  style={{ backgroundColor: THEME.primary }}
                >
                  おすすめ
                </div>
              )
            }
            // ロングセラー（リリースから1年以上）
            if (scenario.release_date) {
              const releaseDate = new Date(scenario.release_date)
              const oneYearAgo = new Date()
              oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
              if (releaseDate <= oneYearAgo) {
                return (
                  <div 
                    className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-black"
                    style={{ backgroundColor: THEME.accent }}
                  >
                    ロングセラー
                  </div>
                )
              }
            }
            // 人気（遊びたいリスト100以上）
            if (scenario.favorite_count && scenario.favorite_count >= 100) {
              return (
                <div 
                  className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-white"
                  style={{ backgroundColor: '#F97316' }}
                >
                  人気
                </div>
              )
            }
            return null
          })()}
        </div>

        {/* コンテンツ */}
        <div className="p-2 sm:p-3 flex-1 min-w-0">
          {/* 著者 + 体験済み・お気に入りボタン */}
          <div className="flex items-center justify-between mb-1">
            {scenario.author && (
              <p className="text-xs text-gray-500" {...devDb('scenarios.author')}>{scenario.author}</p>
            )}
            <div className="flex items-center gap-0.5">
              {/* 体験済みボタン */}
              <button 
                type="button"
                onClick={handlePlayedClick}
                onTouchEnd={(e) => e.stopPropagation()}
                className={`flex-shrink-0 p-1 transition-colors rounded ${onTogglePlayed ? 'hover:bg-green-50 cursor-pointer' : 'cursor-default'}`}
                title={isPlayed ? '体験済み' : '未体験（クリックで登録）'}
              >
                <CheckCheck className={`h-4 w-4 ${isPlayed ? 'text-green-500' : 'text-gray-300 hover:text-green-300'}`} />
              </button>
              {/* お気に入りボタン */}
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    onToggleFavorite(scenario.scenario_id, e)
                  }}
                  onTouchEnd={(e) => e.stopPropagation()}
                  className="flex-shrink-0 p-1 transition-colors hover:bg-red-50 rounded"
                >
                  <Heart className={`h-4 w-4 fill-current text-red-500 ${
                    isFavorite ? 'opacity-100' : 'opacity-30 hover:opacity-50'
                  }`} />
                </button>
              )}
            </div>
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
                    {event.available_seats !== undefined && (
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {event.is_confirmed && event.available_seats > 0 && (
                          <span 
                            className="text-[10px] font-bold px-1.5 py-0.5"
                            style={{
                              backgroundColor: '#DBEAFE',
                              color: '#1D4ED8',
                              borderRadius: 0,
                            }}
                          >
                            開催決定
                          </span>
                        )}
                        <span 
                          className="text-[10px] font-bold px-1.5 py-0.5"
                          style={{
                            backgroundColor: event.available_seats === 0 ? '#E5E7EB' : event.available_seats <= 2 ? '#FEE2E2' : THEME.accentLight,
                            color: event.available_seats === 0 ? '#6B7280' : event.available_seats <= 2 ? '#DC2626' : THEME.accent,
                            borderRadius: 0,
                          }}
                        >
                          {event.available_seats === 0 ? '満席' : `残${event.available_seats}`}
                        </span>
                      </div>
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

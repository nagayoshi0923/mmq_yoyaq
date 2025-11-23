import { Badge } from '@/components/ui/badge'
import { ScenarioCard } from './ScenarioCard'
import { memo, useState, useEffect } from 'react'
import type { ScenarioCard as ScenarioCardType } from '../hooks/useBookingData'

interface LineupViewProps {
  newScenarios: ScenarioCardType[]
  upcomingScenarios: ScenarioCardType[]
  allScenarios: ScenarioCardType[]
  onCardClick: (scenarioId: string) => void
  isFavorite: (scenarioId: string) => boolean
  onToggleFavorite: (scenarioId: string, e: React.MouseEvent) => void
}

/**
 * ラインナップビューコンポーネント
 * パフォーマンス最適化: 初期表示を10件に制限
 */
const INITIAL_DISPLAY_COUNT = 10
const LOAD_MORE_COUNT = 10

export const LineupView = memo(function LineupView({
  newScenarios,
  upcomingScenarios,
  allScenarios,
  onCardClick,
  isFavorite,
  onToggleFavorite
}: LineupViewProps) {
  // 遅延読み込み: 初期表示は20件のみ
  const [displayedAllScenariosCount, setDisplayedAllScenariosCount] = useState(INITIAL_DISPLAY_COUNT)
  
  // スクロール検知で追加読み込み
  useEffect(() => {
    const handleScroll = () => {
      // ページの最下部に近づいたら追加読み込み
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight
      
      // 最下部から100px以内に来たら追加読み込み
      if (scrollTop + windowHeight >= documentHeight - 100) {
        setDisplayedAllScenariosCount(prev => {
          const next = prev + LOAD_MORE_COUNT
          return next > allScenarios.length ? allScenarios.length : next
        })
      }
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [allScenarios.length])
  
  // 表示するシナリオを制限
  const displayedAllScenarios = allScenarios.slice(0, displayedAllScenariosCount)
  const hasMore = displayedAllScenariosCount < allScenarios.length
  
  // パフォーマンス最適化: 新着・直近公演も表示件数を制限
  const displayedNewScenarios = newScenarios.slice(0, 10)
  const displayedUpcomingScenarios = upcomingScenarios.slice(0, 10)
  
  return (
    <div className="space-y-6 md:space-y-8">
      {/* 新着公演セクション */}
      {displayedNewScenarios.length > 0 && (
        <section>
          <h2 className="text-lg md:text-base xl:text-lg mb-3 md:mb-4 flex items-center gap-2">
            <span>新着公演</span>
            <Badge className="bg-red-600 text-white border-0 text-xs px-1.5 md:px-2 py-0.5 rounded-sm flex-shrink-0">NEW</Badge>
            {newScenarios.length > 10 && (
              <span className="text-xs font-normal text-gray-500 ml-1 flex-shrink-0">
                ({displayedNewScenarios.length} / {newScenarios.length})
              </span>
            )}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
            {displayedNewScenarios.map((scenario) => (
              <ScenarioCard 
                key={scenario.scenario_id} 
                scenario={scenario} 
                onClick={onCardClick}
                isFavorite={isFavorite(scenario.scenario_id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}

      {/* 直近公演セクション */}
      {displayedUpcomingScenarios.length > 0 && (
        <section>
          <h2 className="text-lg md:text-base xl:text-lg mb-3 md:mb-4">
            直近公演
            {upcomingScenarios.length > 10 && (
              <span className="text-xs font-normal text-gray-500 ml-1">
                ({displayedUpcomingScenarios.length} / {upcomingScenarios.length})
              </span>
            )}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
            {displayedUpcomingScenarios.map((scenario) => (
              <ScenarioCard 
                key={scenario.scenario_id} 
                scenario={scenario} 
                onClick={onCardClick}
                isFavorite={isFavorite(scenario.scenario_id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}

      {/* 全タイトルセクション */}
      {allScenarios.length > 0 ? (
        <section>
          <h2 className="text-base md:text-lg mb-2 sm:mb-3 md:mb-4">
            全タイトル
            {allScenarios.length > INITIAL_DISPLAY_COUNT && (
              <span className="text-xs sm:text-sm font-normal text-gray-500 ml-1">
                ({displayedAllScenarios.length} / {allScenarios.length})
              </span>
            )}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 sm:gap-2 md:gap-3">
            {displayedAllScenarios.map((scenario) => (
              <ScenarioCard 
                key={scenario.scenario_id} 
                scenario={scenario} 
                onClick={onCardClick}
                isFavorite={isFavorite(scenario.scenario_id)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
          {hasMore && (
            <div className="text-center mt-4 sm:mt-6">
              <p className="text-xs sm:text-sm text-gray-500">
                スクロールで続きを読み込む
              </p>
            </div>
          )}
        </section>
      ) : (
        <div className="text-center py-8 sm:py-12">
          <p className="text-sm sm:text-base text-muted-foreground">シナリオが見つかりませんでした</p>
        </div>
      )}
    </div>
  )
})


import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScenarioCard } from './ScenarioCard'
import { memo } from 'react'
import { BookOpen } from 'lucide-react'
import type { ScenarioCard as ScenarioCardType } from '../hooks/useBookingData'

interface LineupViewProps {
  newScenarios: ScenarioCardType[]
  upcomingScenarios: ScenarioCardType[]
  allScenarios: ScenarioCardType[]
  onCardClick: (scenarioId: string) => void
  isFavorite: (scenarioId: string) => boolean
  onToggleFavorite: (scenarioId: string, e: React.MouseEvent) => void
  searchTerm?: string
  organizationSlug?: string
}

/**
 * ラインナップビューコンポーネント
 * 新着・直近公演を表示（全タイトルはカタログページへ）
 * 検索時は全シナリオから検索結果を表示
 */
export const LineupView = memo(function LineupView({
  newScenarios,
  upcomingScenarios,
  allScenarios,
  onCardClick,
  isFavorite,
  onToggleFavorite,
  searchTerm = '',
  organizationSlug
}: LineupViewProps) {
  // 検索中かどうか
  const isSearching = searchTerm.length > 0
  
  // 新着は10件まで、直近公演は全て表示
  const displayedNewScenarios = newScenarios.slice(0, 10)
  
  const handleCatalogClick = () => {
    const catalogPath = organizationSlug ? `/${organizationSlug}/catalog` : '/catalog'
    window.location.href = catalogPath
  }
  
  // 検索中は全シナリオから検索結果を表示
  if (isSearching) {
    return (
      <div className="space-y-6 md:space-y-8">
        <section>
          <h2 className="text-lg mb-3 md:mb-4">
            「{searchTerm}」の検索結果
            <span className="text-xs font-normal text-gray-500 ml-1">
              ({allScenarios.length}件)
            </span>
          </h2>
          {allScenarios.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
              {allScenarios.map((scenario) => (
                <ScenarioCard 
                  key={scenario.scenario_id} 
                  scenario={scenario} 
                  onClick={onCardClick}
                  isFavorite={isFavorite(scenario.scenario_id)}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>該当するシナリオが見つかりませんでした</p>
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* 新着公演セクション */}
      {displayedNewScenarios.length > 0 && (
        <section>
          <h2 className="text-lg mb-3 md:mb-4 flex items-center gap-2">
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

      {/* 直近公演セクション（全て表示） */}
      {upcomingScenarios.length > 0 && (
        <section>
          <h2 className="text-lg mb-3 md:mb-4">
            直近公演
              <span className="text-xs font-normal text-gray-500 ml-1">
              ({upcomingScenarios.length}件)
              </span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
            {upcomingScenarios.map((scenario) => (
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

      {/* カタログへのリンク */}
      <section className="text-center py-6 border-t">
        <p className="text-sm text-muted-foreground mb-3">
          全{allScenarios.length}タイトルを検索・フィルター
        </p>
        <Button
          variant="outline"
          onClick={handleCatalogClick}
          className="gap-2"
        >
          <BookOpen className="w-4 h-4" />
          シナリオカタログを見る
        </Button>
        </section>
    </div>
  )
})


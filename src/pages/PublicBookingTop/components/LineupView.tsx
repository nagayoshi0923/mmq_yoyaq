import { Badge } from '@/components/ui/badge'
import { ScenarioCard } from './ScenarioCard'
import { memo } from 'react'

interface ScenarioWithEvents {
  scenario_id: string
  title: string
  author: string
  player_count_min: number
  player_count_max: number
  duration: number
  image_url: string | null
  status: string
  created_at: string
  nextEvent?: {
    event_datetime: string
    store_name: string
    store_short_name: string
  } | null
}

interface LineupViewProps {
  newScenarios: ScenarioWithEvents[]
  upcomingScenarios: ScenarioWithEvents[]
  allScenarios: ScenarioWithEvents[]
  onCardClick: (scenarioId: string) => void
  isFavorite: (scenarioId: string) => boolean
  onToggleFavorite: (scenarioId: string, e: React.MouseEvent) => void
}

/**
 * ラインナップビューコンポーネント
 */
export const LineupView = memo(function LineupView({
  newScenarios,
  upcomingScenarios,
  allScenarios,
  onCardClick,
  isFavorite,
  onToggleFavorite
}: LineupViewProps) {
  return (
    <div className="space-y-8">
      {/* 新着公演セクション */}
      {newScenarios.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <span>新着公演</span>
            <Badge className="bg-red-600 text-white border-0 text-xs px-2 py-0.5 rounded-sm">NEW</Badge>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {newScenarios.map((scenario) => (
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
      {upcomingScenarios.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4">直近公演</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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

      {/* 全タイトルセクション */}
      {allScenarios.length > 0 ? (
        <section>
          <h2 className="text-2xl font-bold mb-4">全タイトル</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
        </section>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">シナリオが見つかりませんでした</p>
        </div>
      )}
    </div>
  )
})


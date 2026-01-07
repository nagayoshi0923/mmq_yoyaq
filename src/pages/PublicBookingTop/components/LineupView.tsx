import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScenarioCard } from './ScenarioCard'
import { memo } from 'react'
import { BookOpen, Calendar } from 'lucide-react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
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
  organizationName?: string | null
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
  organizationSlug,
  organizationName
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {allScenarios.map((scenario) => (
                <ScenarioCard 
                  key={scenario.scenario_id} 
                  scenario={scenario} 
                  onClick={onCardClick}
                  isFavorite={isFavorite(scenario.scenario_id)}
                  onToggleFavorite={onToggleFavorite}
                  organizationName={organizationName}
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
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-3 md:mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" style={{ color: THEME.primary }} />
            <span>新着公演</span>
            <Badge 
              className="text-xs px-1.5 md:px-2 py-0.5 flex-shrink-0 border-0"
              style={{ backgroundColor: THEME.accent, color: '#000' }}
            >
              NEW
            </Badge>
            <span 
              className="w-8 h-1 ml-1"
              style={{ backgroundColor: THEME.accent }}
            />
            {newScenarios.length > 10 && (
              <span className="text-xs font-normal text-gray-500 ml-1 flex-shrink-0">
                ({displayedNewScenarios.length} / {newScenarios.length})
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {displayedNewScenarios.map((scenario, index) => (
              <ScenarioCard 
                key={scenario.scenario_id} 
                scenario={scenario} 
                onClick={onCardClick}
                isFavorite={isFavorite(scenario.scenario_id)}
                onToggleFavorite={onToggleFavorite}
                organizationName={organizationName}
                isFirst={index === 0}
              />
            ))}
          </div>
        </section>
      )}

      {/* 直近公演セクション（全て表示） */}
      {upcomingScenarios.length > 0 && (
        <section>
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-3 md:mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" style={{ color: THEME.primary }} />
            <span>直近公演</span>
            <span 
              className="w-8 h-1 ml-1"
              style={{ backgroundColor: THEME.accent }}
            />
            <span className="text-xs font-normal text-gray-500 ml-1">
              ({upcomingScenarios.length}件)
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {upcomingScenarios.map((scenario, index) => (
              <ScenarioCard 
                key={scenario.scenario_id} 
                scenario={scenario} 
                onClick={onCardClick}
                isFavorite={isFavorite(scenario.scenario_id)}
                onToggleFavorite={onToggleFavorite}
                organizationName={organizationName}
                isFirst={displayedNewScenarios.length === 0 && index === 0}
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
          className="gap-2 hover:scale-[1.02] transition-transform"
          style={{ 
            borderColor: THEME.primary,
            color: THEME.primary,
            borderWidth: 2,
          }}
        >
          <BookOpen className="w-4 h-4" />
          シナリオカタログを見る
        </Button>
      </section>
    </div>
  )
})


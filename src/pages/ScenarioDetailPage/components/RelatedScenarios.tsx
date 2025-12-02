import { memo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Clock } from 'lucide-react'

interface RelatedScenario {
  id: string
  title: string
  key_visual_url?: string
  author: string
  player_count_min: number
  player_count_max: number
  duration: number
}

interface RelatedScenariosProps {
  scenarios: RelatedScenario[]
  authorName: string
  onScenarioClick: (scenarioId: string) => void
}

/**
 * 関連シナリオ（同じ著者の他作品）コンポーネント
 */
export const RelatedScenarios = memo(function RelatedScenarios({
  scenarios,
  authorName,
  onScenarioClick
}: RelatedScenariosProps) {
  if (scenarios.length === 0) return null

  return (
    <div>
      <h3 className="mb-3 md:mb-4 text-base md:text-lg">{authorName}の他作品</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
        {scenarios.map((scenario) => (
          <Card
            key={scenario.id}
            className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => onScenarioClick(scenario.id)}
          >
            {/* キービジュアル */}
            <div className="aspect-[1/1.4] bg-gray-200 overflow-hidden">
              {scenario.key_visual_url ? (
                <img
                  src={scenario.key_visual_url}
                  alt={scenario.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                  No Image
                </div>
              )}
            </div>
            <CardContent className="p-2 md:p-3">
              <h4 className="text-xs md:text-sm font-medium line-clamp-2 mb-1">
                {scenario.title}
              </h4>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-0.5">
                  <Users className="w-3 h-3" />
                  <span>
                    {scenario.player_count_min === scenario.player_count_max
                      ? `${scenario.player_count_max}人`
                      : `${scenario.player_count_min}-${scenario.player_count_max}人`}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  <span>{scenario.duration}分</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
})


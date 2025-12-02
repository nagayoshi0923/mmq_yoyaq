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
      <h3 className="mb-2 md:mb-3 text-sm text-muted-foreground">{authorName}の他作品</h3>
      <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
        {scenarios.map((scenario) => (
          <div
            key={scenario.id}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onScenarioClick(scenario.id)}
          >
            {/* キービジュアル */}
            <div className="aspect-[1/1.4] bg-gray-200 rounded overflow-hidden mb-1">
              {scenario.key_visual_url ? (
                <img
                  src={scenario.key_visual_url}
                  alt={scenario.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">
                  No Image
                </div>
              )}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-2 leading-tight">
              {scenario.title}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
})


import { memo, useMemo } from 'react'
import { getOptimizedImageUrl } from '@/utils/imageUtils'
import { filterRelatedScenariosForPublicUi } from '@/lib/scenarioRelatedPublic'

interface RelatedScenario {
  id: string
  slug?: string  // URL用のslug（あればこちらを使用）
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
  const visible = useMemo(() => filterRelatedScenariosForPublicUi(scenarios), [scenarios])
  if (visible.length === 0) return null

  return (
    <div>
      <h3 className="mb-4 text-sm text-muted-foreground">{authorName}の他作品</h3>
      <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
        {visible.map((scenario) => (
          <div
            key={scenario.id}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onScenarioClick(scenario.slug || scenario.id)}
          >
            {/* キービジュアル - 横長画像も全体表示 */}
            <div className="aspect-[1/1.4] bg-gray-900 overflow-hidden mb-1 relative">
              {scenario.key_visual_url ? (
                <>
                  {/* 背景ぼかし */}
                  <div 
                    className="absolute inset-0 scale-110"
                    style={{
                      backgroundImage: `url(${getOptimizedImageUrl(scenario.key_visual_url, { width: 50, format: 'webp', quality: 30 })})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      filter: 'blur(10px) brightness(0.5)',
                    }}
                  />
                  <img
                    src={getOptimizedImageUrl(scenario.key_visual_url, { width: 150, format: 'webp', quality: 80 })}
                    alt={scenario.title}
                    className="relative w-full h-full object-contain"
                    loading="lazy"
                    onError={(e) => {
                      if (scenario.key_visual_url && e.currentTarget.src !== scenario.key_visual_url) {
                        e.currentTarget.src = scenario.key_visual_url
                      }
                    }}
                  />
                </>
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


import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Clock, Users, ExternalLink } from 'lucide-react'
import type { ScenarioDetail, EventSchedule } from '../utils/types'
import { formatDuration, formatPlayerCount } from '../utils/formatters'

interface ScenarioHeroProps {
  scenario: ScenarioDetail
  events?: EventSchedule[]
}

/**
 * シナリオヒーローセクション（キービジュアル + タイトル + 基本情報）
 */
export const ScenarioHero = memo(function ScenarioHero({ scenario, events = [] }: ScenarioHeroProps) {
  return (
    <div className="relative bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white -mx-3 sm:mx-0">
      <div className="container mx-auto max-w-7xl px-3 sm:px-6 py-4 sm:py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 md:gap-6 lg:gap-8">
          {/* キービジュアル */}
          <div className="lg:col-span-4">
            <div className="relative aspect-[3/4] bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg overflow-hidden shadow-2xl">
              <OptimizedImage
                src={scenario.key_visual_url}
                alt={scenario.scenario_title}
                className="w-full h-full object-cover"
                responsive={true}
                srcSetSizes={[400, 800, 1200]}
                breakpoints={{ mobile: 400, tablet: 600, desktop: 800 }}
                useWebP={true}
                quality={90}
                fallback={
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <div className="text-center p-8">
                      <p className="font-bold text-2xl">{scenario.scenario_title}</p>
                    </div>
                  </div>
                }
              />
            </div>
          </div>

          {/* タイトル・基本情報 */}
          <div className="lg:col-span-8 space-y-2 sm:space-y-3 md:space-y-4">
            <div>
              <p className="text-sm opacity-80 mb-1">{scenario.author}</p>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1.5 sm:mb-2 md:mb-3 leading-tight">{scenario.scenario_title}</h1>
              
              <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
                <div className="flex items-center gap-1 sm:gap-1.5 bg-white/10 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm">
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="font-medium">{formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}</span>
                </div>
                
                <div className="flex items-center gap-1 sm:gap-1.5 bg-white/10 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="font-medium">{formatDuration(scenario.duration, 'minutes')}</span>
                </div>
                
                <div className="flex items-center gap-1 sm:gap-1.5 bg-white/10 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm">
                  <span className="font-medium text-white">
                    {scenario.participation_fee ? `¥${scenario.participation_fee.toLocaleString()}〜` : '¥3,000〜'}
                  </span>
                </div>
              </div>
            </div>

            {scenario.description && (
              <p className="opacity-90 leading-relaxed text-sm sm:text-base">
                {scenario.description}
              </p>
            )}

            <div className="flex flex-wrap gap-1 sm:gap-1.5">
              {scenario.genre.map((g, i) => (
                <Badge key={i} variant="outline" className="bg-white/20 text-white border-white/30 text-xs px-1.5 sm:px-2 py-0.5 rounded-sm">
                  {g}
                </Badge>
              ))}
              {scenario.has_pre_reading && (
                <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-xs px-1.5 sm:px-2 py-0.5 rounded-sm">
                  事前読解あり
                </Badge>
              )}
            </div>

            <div className="flex gap-2">
              {scenario.official_site_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/10 border-white/30 text-white hover:bg-white/20 h-8 sm:h-9 text-xs sm:text-sm touch-manipulation"
                  onClick={() => window.open(scenario.official_site_url, '_blank')}
                >
                  <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
                  公式サイト
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})


import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Clock, Users, ExternalLink, Star, Share2 } from 'lucide-react'
import type { ScenarioDetail, EventSchedule } from '../utils/types'
import { formatDuration, formatPlayerCount } from '../utils/formatters'

// 難易度ラベル
const DIFFICULTY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: '初心者向け', color: 'bg-green-500' },
  2: { label: 'やや易しい', color: 'bg-lime-500' },
  3: { label: '普通', color: 'bg-yellow-500' },
  4: { label: 'やや難しい', color: 'bg-orange-500' },
  5: { label: '上級者向け', color: 'bg-red-500' },
}

interface ScenarioHeroProps {
  scenario: ScenarioDetail
  events?: EventSchedule[]
}

/**
 * シナリオヒーローセクション（キービジュアル + タイトル + 基本情報）
 */
export const ScenarioHero = memo(function ScenarioHero({ scenario, events = [] }: ScenarioHeroProps) {
  return (
    <div className="relative bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white -mx-4">
      <div className="container mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* キービジュアル */}
          <div className="md:col-span-4">
            <div className="relative aspect-[3/4] bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg overflow-hidden border">
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
                      <p className="text-lg">{scenario.scenario_title}</p>
                    </div>
                  </div>
                }
              />
            </div>
          </div>

          {/* タイトル・基本情報 */}
          <div className="md:col-span-8 space-y-4">
            <div>
              <p className="text-sm opacity-80 mb-2">{scenario.author}</p>
              <h1 className="text-xl md:text-2xl font-bold mb-4">{scenario.scenario_title}</h1>
              
              <div className="flex flex-wrap gap-1.5 items-center">
                <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full text-sm sm:text-base">
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="">{formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}</span>
                </div>
                
                <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full text-sm sm:text-base">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="">{formatDuration(scenario.duration, 'minutes')}</span>
                </div>
                
                <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full text-sm sm:text-base">
                  <span className="text-white">
                    {scenario.participation_fee ? `¥${scenario.participation_fee.toLocaleString()}〜` : '¥3,000〜'}
                  </span>
                </div>
                
                {/* 難易度表示 */}
                {scenario.difficulty && DIFFICULTY_LABELS[scenario.difficulty] && (
                  <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-full text-sm sm:text-base">
                    <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="text-white">{DIFFICULTY_LABELS[scenario.difficulty].label}</span>
                  </div>
                )}
              </div>
            </div>

            {scenario.description && (
              <p className="opacity-90 leading-relaxed text-sm sm:text-base">
                {scenario.description}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {scenario.genre.map((g, i) => (
                <Badge key={i} variant="outline" className="bg-white/20 text-white border-white/30 text-xs px-1.5 py-0.5 rounded-sm">
                  {g}
                </Badge>
              ))}
              {scenario.has_pre_reading && (
                <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-xs px-1.5 py-0.5 rounded-sm">
                  事前読解あり
                </Badge>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
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
              
              {/* SNSシェアボタン */}
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/30 text-white hover:bg-white/20 h-8 sm:h-9 text-xs sm:text-sm touch-manipulation"
                onClick={() => {
                  const url = window.location.href
                  const text = `${scenario.scenario_title} - マーダーミステリークエスト`
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'width=550,height=420')
                }}
              >
                <Share2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
                シェア
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})


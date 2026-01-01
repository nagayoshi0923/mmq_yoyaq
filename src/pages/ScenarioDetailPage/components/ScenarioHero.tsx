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
    <div className="relative bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white rounded-lg overflow-hidden">
      <div className="p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
          {/* キービジュアル */}
          <div className="md:col-span-4">
            <div className="relative aspect-[3/4] bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg overflow-hidden">
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
              
              {/* 基本情報（テキストベース） */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatDuration(scenario.duration, 'minutes')}
                </span>
                <span className="font-medium text-white">
                  {scenario.participation_fee ? `¥${scenario.participation_fee.toLocaleString()}〜` : '¥3,000〜'}
                </span>
                {scenario.difficulty && DIFFICULTY_LABELS[scenario.difficulty] && (
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4" />
                    {DIFFICULTY_LABELS[scenario.difficulty].label}
                  </span>
                )}
              </div>
            </div>

            {scenario.description && (
              <p className="opacity-90 leading-relaxed text-sm sm:text-base">
                {scenario.description}
              </p>
            )}

            {/* ジャンルタグ */}
            <div className="flex flex-wrap gap-1.5">
              {scenario.genre.map((g, i) => (
                <span key={i} className="text-xs text-white/70 border border-white/20 px-2 py-0.5 rounded">
                  {g}
                </span>
              ))}
              {scenario.has_pre_reading && (
                <span className="text-xs text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded">
                  事前読解あり
                </span>
              )}
            </div>

            {/* アクションボタン */}
            <div className="flex gap-2 flex-wrap pt-2">
              {scenario.official_site_url && (
                <button
                  className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors"
                  onClick={() => window.open(scenario.official_site_url, '_blank')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  公式サイト
                </button>
              )}
              <button
                className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors"
                onClick={() => {
                  const url = window.location.href
                  const text = `${scenario.scenario_title} - マーダーミステリークエスト`
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'width=550,height=420')
                }}
              >
                <Share2 className="w-3.5 h-3.5" />
                シェア
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})


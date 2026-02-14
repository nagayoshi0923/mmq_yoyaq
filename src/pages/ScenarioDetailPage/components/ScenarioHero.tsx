import { memo } from 'react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Clock, Users, Star, Heart, Share2, ExternalLink, Sparkles } from 'lucide-react'
import { useFavorites } from '@/hooks/useFavorites'
import type { ScenarioDetail } from '../utils/types'
import { formatDuration, formatPlayerCount } from '../utils/formatters'

const DIFFICULTY_LABELS: Record<number, string> = {
  1: '★',
  2: '★★',
  3: '★★★',
  4: '★★★★',
  5: '★★★★★',
}

interface ScenarioHeroProps {
  scenario: ScenarioDetail
}

/**
 * シナリオヒーローセクション
 * コンパクトに KV + タイトル + スペックを横並び表示
 * 公演日程の邪魔にならないよう最小限の高さに抑える
 */
export const ScenarioHero = memo(function ScenarioHero({ scenario }: ScenarioHeroProps) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const scenarioIsFavorite = isFavorite(scenario.scenario_id)
  const difficultyLabel = scenario.difficulty ? DIFFICULTY_LABELS[scenario.difficulty] : null

  return (
    <div className="bg-gray-900 text-white">
      <div className="container mx-auto max-w-7xl px-4 py-4">
        {/* KV + 情報を横並び */}
        <div className="flex gap-4">
          {/* キービジュアル（コンパクト） */}
          <div className="flex-shrink-0 w-[120px] sm:w-[160px] md:w-[180px]">
            <div className="relative aspect-[3/4] bg-black/30 overflow-hidden rounded-lg shadow-lg">
              <OptimizedImage
                src={scenario.key_visual_url}
                alt={scenario.scenario_title}
                className="w-full h-full object-cover"
                responsive={true}
                srcSetSizes={[200, 400]}
                breakpoints={{ mobile: 200, tablet: 300, desktop: 400 }}
                useWebP={true}
                quality={85}
                fallback={
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    <Sparkles className="w-8 h-8 opacity-50" />
                  </div>
                }
              />
              {/* ジャンルバッジ */}
              {scenario.genre.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent">
                  <div className="flex flex-wrap gap-1">
                    {scenario.genre.slice(0, 3).map((g, i) => (
                      <span key={i} className="text-[9px] font-bold px-1.5 py-0.5 bg-white/20 backdrop-blur-sm text-white rounded-sm">
                        {g}
                      </span>
                    ))}
                    {scenario.genre.length > 3 && (
                      <span className="text-[9px] text-white/60">+{scenario.genre.length - 3}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右側：タイトル + スペック + アクション */}
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            {/* タイトルエリア */}
            <div>
              <p className="text-xs text-white/50 mb-0.5">作者　{scenario.author}</p>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 line-clamp-2">
                {scenario.scenario_title}
              </h1>

              {/* タグ行 */}
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                {scenario.has_pre_reading && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    事前読解あり
                  </span>
                )}
              </div>
            </div>

            {/* スペック（横並び、コンパクト） */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-3">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-white/50" />
                <span className="text-white/70 text-xs">人数</span>
                <span className="font-semibold">{formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-white/50" />
                <span className="text-white/70 text-xs">時間</span>
                <span className="font-semibold">{formatDuration(scenario.duration, 'hours')}</span>
              </div>
              {difficultyLabel && (
                <div className="flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-white/50" />
                  <span className="text-white/70 text-xs">難易度</span>
                  <span className="font-semibold text-amber-300">{difficultyLabel}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-white/50 text-xs font-bold">¥</span>
                <span className="text-white/70 text-xs">参加費</span>
                <span className="font-semibold">
                  {scenario.participation_fee ? `¥${scenario.participation_fee.toLocaleString()}〜` : '要確認'}
                </span>
              </div>
            </div>

            {/* アクションボタン */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleFavorite(scenario.scenario_id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition-all text-xs ${
                  scenarioIsFavorite
                    ? 'bg-red-500/20 text-red-300 border border-red-400/30'
                    : 'bg-white/10 text-white/60 border border-white/15 hover:bg-white/15'
                }`}
              >
                <Heart className={`w-3 h-3 ${scenarioIsFavorite ? 'fill-current' : ''}`} />
                遊びたい
              </button>
              <button
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-white/10 text-white/60 border border-white/15 hover:bg-white/15 transition-all"
                onClick={() => {
                  const url = window.location.href
                  const text = `${scenario.scenario_title} - マーダーミステリークエスト`
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'width=550,height=420')
                }}
              >
                <Share2 className="w-3 h-3" />
                シェア
              </button>
              {scenario.official_site_url && (
                <button
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-white/10 text-white/60 border border-white/15 hover:bg-white/15 transition-all"
                  onClick={() => window.open(scenario.official_site_url, '_blank')}
                >
                  <ExternalLink className="w-3 h-3" />
                  公式
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

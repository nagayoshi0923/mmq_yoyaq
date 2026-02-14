import { memo } from 'react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Clock, Users, ExternalLink, Star, Share2, Heart, Sparkles, Zap } from 'lucide-react'
import { useFavorites } from '@/hooks/useFavorites'
import type { ScenarioDetail, EventSchedule } from '../utils/types'
import { formatDuration, formatPlayerCount } from '../utils/formatters'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

// 難易度ラベル
const DIFFICULTY_LABELS: Record<number, { label: string; emoji: string }> = {
  1: { label: '初心者向け', emoji: '★' },
  2: { label: 'やや易しい', emoji: '★★' },
  3: { label: '普通', emoji: '★★★' },
  4: { label: 'やや難しい', emoji: '★★★★' },
  5: { label: '上級者向け', emoji: '★★★★★' },
}

interface ScenarioHeroProps {
  scenario: ScenarioDetail
  events?: EventSchedule[]
}

/**
 * シナリオヒーローセクション（キービジュアル + タイトル + 基本情報）
 * リッチで没入感のあるデザイン
 */
export const ScenarioHero = memo(function ScenarioHero({ scenario, events = [] }: ScenarioHeroProps) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const scenarioIsFavorite = isFavorite(scenario.scenario_id)
  
  const handleFavoriteClick = () => {
    toggleFavorite(scenario.scenario_id)
  }

  const difficultyInfo = scenario.difficulty ? DIFFICULTY_LABELS[scenario.difficulty] : null
  const upcomingCount = events.filter(e => e.is_available).length

  return (
    <div className="relative overflow-hidden">
      {/* 背景: KVをぼかして使う */}
      {scenario.key_visual_url && (
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${scenario.key_visual_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(40px) brightness(0.15)',
          }}
        />
      )}
      {!scenario.key_visual_url && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
      )}

      {/* コンテンツ */}
      <div className="relative p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
          {/* キービジュアル - 大きく表示 */}
          <div className="md:col-span-5">
            <div className="relative aspect-[3/4] bg-black/30 overflow-hidden rounded-lg shadow-2xl">
              {scenario.key_visual_url && (
                <div 
                  className="absolute inset-0 scale-110"
                  style={{
                    backgroundImage: `url(${scenario.key_visual_url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(20px) brightness(0.4)',
                  }}
                />
              )}
              <OptimizedImage
                src={scenario.key_visual_url}
                alt={scenario.scenario_title}
                className="relative w-full h-full object-contain"
                responsive={true}
                srcSetSizes={[400, 800, 1200]}
                breakpoints={{ mobile: 400, tablet: 600, desktop: 800 }}
                useWebP={true}
                quality={90}
                fallback={
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <div className="text-center p-8">
                      <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-lg">{scenario.scenario_title}</p>
                    </div>
                  </div>
                }
              />
              
              {/* ジャンルバッジ（画像上に重ねる） */}
              {scenario.genre.length > 0 && (
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                  {scenario.genre.slice(0, 3).map((g, i) => (
                    <span 
                      key={i} 
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 backdrop-blur-md bg-white/20 text-white border border-white/20 rounded-sm"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 右側: タイトル・詳細情報 */}
          <div className="md:col-span-7 flex flex-col justify-between text-white">
            {/* 上部: タイトルエリア */}
            <div>
              {/* 作者名 */}
              <p className="text-sm text-white/60 mb-1">作者　{scenario.author}</p>
              
              {/* タイトル */}
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-3 leading-tight">
                {scenario.scenario_title}
              </h1>

              {/* お気に入り＆シェア */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={handleFavoriteClick}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-sm ${
                    scenarioIsFavorite 
                      ? 'bg-red-500/20 text-red-300 border border-red-400/30' 
                      : 'bg-white/10 text-white/70 border border-white/15 hover:bg-white/15'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${scenarioIsFavorite ? 'fill-current' : ''}`} />
                  {scenarioIsFavorite ? '遊びたい' : '遊びたい'}
                </button>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-white/10 text-white/70 border border-white/15 hover:bg-white/15 transition-all"
                  onClick={() => {
                    const url = window.location.href
                    const text = `${scenario.scenario_title} - マーダーミステリークエスト`
                    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'width=550,height=420')
                  }}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  シェア
                </button>
                {scenario.official_site_url && (
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-white/10 text-white/70 border border-white/15 hover:bg-white/15 transition-all"
                    onClick={() => window.open(scenario.official_site_url, '_blank')}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    公式
                  </button>
                )}
              </div>

              {/* タグ行 */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {scenario.has_pre_reading && (
                  <span className="text-xs font-medium px-2 py-1 rounded-sm bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    事前読解あり
                  </span>
                )}
                {upcomingCount > 0 && (
                  <span className="text-xs font-medium px-2 py-1 rounded-sm bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    <Zap className="w-3 h-3 inline mr-0.5" />
                    {upcomingCount}件の公演予定
                  </span>
                )}
              </div>
            </div>

            {/* 下部: スペックカード */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* プレイ人数 */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-lg p-3 text-center">
                <Users className="w-5 h-5 mx-auto mb-1 text-white/60" />
                <p className="text-xs text-white/50 mb-0.5">プレイ人数</p>
                <p className="text-sm font-bold">{formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}</p>
              </div>

              {/* プレイ時間 */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-lg p-3 text-center">
                <Clock className="w-5 h-5 mx-auto mb-1 text-white/60" />
                <p className="text-xs text-white/50 mb-0.5">プレイ時間</p>
                <p className="text-sm font-bold">{formatDuration(scenario.duration, 'hours')}</p>
              </div>

              {/* 難易度 */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-lg p-3 text-center">
                <Star className="w-5 h-5 mx-auto mb-1 text-white/60" />
                <p className="text-xs text-white/50 mb-0.5">難易度</p>
                <p className="text-sm font-bold">
                  {difficultyInfo ? (
                    <span className="text-amber-300">{difficultyInfo.emoji}</span>
                  ) : (
                    <span className="text-amber-300">★★★</span>
                  )}
                </p>
              </div>

              {/* 参加費 */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-lg p-3 text-center">
                <span className="block text-lg mb-1 text-white/60">¥</span>
                <p className="text-xs text-white/50 mb-0.5">参加費</p>
                <p className="text-sm font-bold">
                  {scenario.participation_fee 
                    ? `¥${scenario.participation_fee.toLocaleString()}〜` 
                    : '¥3,000〜'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

import { memo, type ReactNode } from 'react'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Clock, Users, ExternalLink, Share2, Heart, UserPlus, CheckCheck, Building2, UserCircle } from 'lucide-react'
import type { ScenarioDetail } from '../utils/types'
import { formatDuration, formatPlayerCount } from '../utils/formatters'
import { getOptimizedImageUrl } from '@/utils/imageUtils'

interface ScenarioHeroViewProps {
  scenario: ScenarioDetail
  availableStoreNames: string[]
  showPrivateBookingCta: boolean
  scenarioIsFavorite: boolean
  isPlayed: boolean
  isCheckingPlayed: boolean
  isTogglingPlayed: boolean
  onPlayedClick: () => void
  onFavoriteClick: () => void
  onPrivateBookingClick: () => void
  onOfficialSiteClick: () => void
  onShareClick: () => void
  children?: ReactNode
}

/** 本番と試作が共有する表示部品。認証・API・保存の処理は呼び出し側が持つ。 */
export const ScenarioHeroView = memo(function ScenarioHeroView({ scenario, availableStoreNames,
  showPrivateBookingCta, scenarioIsFavorite, isPlayed, isCheckingPlayed, isTogglingPlayed,
  onPlayedClick, onFavoriteClick, onPrivateBookingClick, onOfficialSiteClick, onShareClick, children,
}: ScenarioHeroViewProps) {
  const hasGenderRatio = scenario.male_count != null || scenario.female_count != null || scenario.other_count != null
  const genderRatioParts: string[] = []
  if (scenario.male_count != null) genderRatioParts.push(`男性${scenario.male_count}人`)
  if (scenario.female_count != null) genderRatioParts.push(`女性${scenario.female_count}人`)
  if (scenario.other_count != null) genderRatioParts.push(`その他${scenario.other_count}人`)
  const genderRatioText = genderRatioParts.join(' / ')
  return (
    <div className="relative bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white overflow-hidden">
      <div className="p-3 md:p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4">
          {/* キービジュアル */}
          <div className="md:col-span-4">
            <div className="relative aspect-[3/4] bg-gray-900 overflow-hidden">
              {/* 背景：ぼかした画像で余白を埋める - 最適化済み */}
              {scenario.key_visual_url && (
                <div
                  className="absolute inset-0 scale-110"
                  style={{
                    backgroundImage: `url(${getOptimizedImageUrl(scenario.key_visual_url, { width: 100, format: 'webp', quality: 50 })})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(20px) brightness(0.5)',
                  }}
                />
              )}
              {/* メイン画像：全体を表示 */}
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
                      <p className="text-lg">{scenario.scenario_title}</p>
                    </div>
                  </div>
                }
              />
            </div>
          </div>

          {/* タイトル・基本情報 */}
          <div className="md:col-span-8 space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs opacity-80">{scenario.author}</p>
                <div className="flex items-center gap-2">
                  {/* 体験済みボタン */}
                  <button
                    onClick={onPlayedClick}
                    disabled={isCheckingPlayed || isTogglingPlayed}
                    className="flex items-center gap-1 px-2 py-1 transition-colors hover:bg-white/10 rounded"
                    title={isPlayed ? '体験済み（クリックで解除）' : '体験済みに登録'}
                  >
                    <CheckCheck className={`w-4 h-4 ${isPlayed ? 'text-green-400' : 'text-white/40 hover:text-white/60'}`} />
                    <span className="text-xs text-white/70">
                      {isPlayed ? '体験済み' : '体験した'}
                    </span>
                  </button>
                  {/* お気に入りボタン */}
                  <button
                    onClick={onFavoriteClick}
                    className="flex items-center gap-1 px-2 py-1 transition-colors hover:bg-white/10 rounded"
                    title={scenarioIsFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
                  >
                    <Heart className={`w-4 h-4 fill-current text-red-400 ${scenarioIsFavorite ? 'opacity-100' : 'opacity-40 hover:opacity-60'}`} />
                    <span className="text-xs text-white/70">
                      {scenarioIsFavorite ? '登録済み' : '遊びたい'}
                    </span>
                  </button>
                </div>
              </div>
              <h1 className="text-lg md:text-xl font-bold mb-2">{scenario.scenario_title}</h1>

              {/* 基本情報（テキストベース） */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
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

              </div>
            </div>

              {/* 公演可能店舗 */}
            {availableStoreNames.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs text-white/70">
                <Building2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  <span className="text-white/50">公演可能店舗</span>
                  <span className="mx-1 text-white/40">:</span>
                  {availableStoreNames.join('・')}
                </span>
              </div>
            )}

            {/* 男女比 */}
            {hasGenderRatio && (
              <div className="flex items-center gap-1.5 text-xs text-white/70">
                <UserCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{genderRatioText}</span>
              </div>
            )}

            {/* ジャンルタグ */}
            <div className="flex flex-wrap items-center gap-1.5">
              {scenario.genre.map((g, i) => (
                <span key={i} className="text-xs text-white/70 border border-white/20 px-1.5 py-0.5">
                  {g}
                </span>
              ))}
            </div>

            {/* アクションボタン */}
            <div className="flex gap-2 flex-wrap">
              {scenario.official_site_url && (
                <button
                  className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors"
                  onClick={onOfficialSiteClick}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  公式サイト
                </button>
              )}
              <button
                className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors"
                onClick={onShareClick}
              >
                <Share2 className="w-3.5 h-3.5" />
                シェア
              </button>
              {showPrivateBookingCta && (
                <button
                  className="flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 transition-colors"
                  onClick={onPrivateBookingClick}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  貸切リクエストを作成
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {children}
    </div>
  )
})

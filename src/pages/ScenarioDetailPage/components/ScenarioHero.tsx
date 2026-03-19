import { memo, useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Label } from '@/components/ui/label'
import { Clock, Users, ExternalLink, Star, Share2, Heart, UserPlus, CheckCheck, Building2, UserCircle } from 'lucide-react'
import { useFavorites } from '@/hooks/useFavorites'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import type { ScenarioDetail, EventSchedule } from '../utils/types'
import { formatDuration, formatPlayerCount } from '../utils/formatters'
import { getOptimizedImageUrl } from '@/utils/imageUtils'

// 難易度ラベル
const DIFFICULTY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: '初心者向け', color: 'bg-green-500' },
  2: { label: 'やや易しい', color: 'bg-lime-500' },
  3: { label: '普通', color: 'bg-yellow-500' },
  4: { label: 'やや難しい', color: 'bg-orange-500' },
  5: { label: '上級者向け', color: 'bg-red-500' },
}

interface Store {
  id: string
  name: string
  short_name?: string
}

interface ScenarioHeroProps {
  scenario: ScenarioDetail
  events?: EventSchedule[]
  organizationSlug?: string
  stores?: Store[]
}

/**
 * シナリオヒーローセクション（キービジュアル + タイトル + 基本情報）
 */
export const ScenarioHero = memo(function ScenarioHero({ scenario, events = [], organizationSlug, stores = [] }: ScenarioHeroProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()

  // 公演可能店舗名
  const availableStoreNames = useMemo(() => {
    if (!scenario.available_stores || scenario.available_stores.length === 0) return []
    const storeMap = new Map(stores.map(s => [s.id, s.short_name || s.name]))
    return scenario.available_stores.map(id => storeMap.get(id)).filter((n): n is string => !!n)
  }, [scenario.available_stores, stores])

  // 男女比
  const hasGenderRatio = scenario.male_count != null || scenario.female_count != null || scenario.other_count != null
  const genderRatioParts: string[] = []
  if (scenario.male_count != null) genderRatioParts.push(`男性${scenario.male_count}人`)
  if (scenario.female_count != null) genderRatioParts.push(`女性${scenario.female_count}人`)
  if (scenario.other_count != null) genderRatioParts.push(`その他${scenario.other_count}人`)
  const genderRatioText = genderRatioParts.join(' / ')
  const scenarioIsFavorite = isFavorite(scenario.scenario_id)
  
  // 体験済み登録用ステート
  const [isPlayed, setIsPlayed] = useState(false)
  const [isPlayedDialogOpen, setIsPlayedDialogOpen] = useState(false)
  const [playedDate, setPlayedDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // 体験済みかどうかチェック
  useEffect(() => {
    const checkPlayed = async () => {
      if (!user?.email) return
      
      try {
        // 顧客IDを取得
        const { data: customer } = await supabase
          .from('customers')
          .select('id')
          .eq('email', user.email)
          .maybeSingle()
        
        if (!customer) return
        
        // 予約から体験済みか確認
        const { data: reservation } = await supabase
          .from('reservations')
          .select('id')
          .eq('customer_id', customer.id)
          .eq('scenario_master_id', scenario.scenario_id)
          .in('status', ['confirmed', 'gm_confirmed'])
          .lte('requested_datetime', new Date().toISOString())
          .limit(1)
          .maybeSingle()
        
        if (reservation) {
          setIsPlayed(true)
          return
        }
        
        // 手動登録から体験済みか確認
        const { data: manual } = await supabase
          .from('manual_play_history')
          .select('id')
          .eq('customer_id', customer.id)
          .eq('scenario_master_id', scenario.scenario_id)
          .limit(1)
          .maybeSingle()
        
        if (manual) {
          setIsPlayed(true)
        }
      } catch (error) {
        logger.error('体験済みチェックエラー:', error)
      }
    }
    
    checkPlayed()
  }, [user, scenario.scenario_id])
  
  const handleFavoriteClick = () => {
    toggleFavorite(scenario.scenario_id)
  }

  const handleCreateGroup = () => {
    const params = new URLSearchParams()
    params.set('scenarioId', scenario.scenario_id)
    if (organizationSlug) params.set('org', organizationSlug)
    navigate(`/group/create?${params.toString()}`)
  }
  
  const handlePlayedClick = () => {
    if (!user) {
      showToast.error('ログインが必要です')
      return
    }
    if (isPlayed) {
      showToast.info('既に体験済みとして登録されています')
      return
    }
    setPlayedDate(new Date().toISOString().split('T')[0])
    setIsPlayedDialogOpen(true)
  }
  
  const handleSubmitPlayed = async () => {
    if (!user?.email) return
    
    setIsSubmitting(true)
    try {
      // 顧客IDを取得
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()
      
      if (!customer) {
        showToast.error('顧客情報が見つかりません')
        return
      }
      
      // manual_play_historyに追加
      const { error } = await supabase
        .from('manual_play_history')
        .insert({
          customer_id: customer.id,
          scenario_title: scenario.scenario_title,
          scenario_master_id: scenario.scenario_id,
          played_at: playedDate || null,
          venue: null,
        })
      
      if (error) throw error
      
      setIsPlayed(true)
      setIsPlayedDialogOpen(false)
      showToast.success('体験済みに登録しました')
    } catch (error) {
      logger.error('体験済み登録エラー:', error)
      showToast.error('登録に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

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
                    onClick={handlePlayedClick}
                    className="flex items-center gap-1 px-2 py-1 transition-colors hover:bg-white/10 rounded"
                    title={isPlayed ? '体験済み' : '体験済みに登録'}
                  >
                    <CheckCheck className={`w-4 h-4 ${isPlayed ? 'text-green-400' : 'text-white/40 hover:text-white/60'}`} />
                    <span className="text-xs text-white/70">
                      {isPlayed ? '体験済み' : '体験した'}
                    </span>
                  </button>
                  {/* お気に入りボタン */}
                  <button
                    onClick={handleFavoriteClick}
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
                {/* 難易度は一旦非表示
                {scenario.difficulty && DIFFICULTY_LABELS[scenario.difficulty] && (
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4" />
                    {DIFFICULTY_LABELS[scenario.difficulty].label}
                  </span>
                )}
                */}
              </div>
            </div>

              {/* 公演可能店舗 */}
            {availableStoreNames.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs text-white/70">
                <Building2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{availableStoreNames.join('・')}</span>
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
              <button
                className="flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 transition-colors"
                onClick={handleCreateGroup}
              >
                <UserPlus className="w-3.5 h-3.5" />
                貸切リクエストを作成
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* 体験済み登録ダイアログ */}
      <Dialog open={isPlayedDialogOpen} onOpenChange={setIsPlayedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>体験済みに登録</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="text-sm text-muted-foreground">
              「{scenario.scenario_title}」を体験済みに登録します。
            </div>
            <div className="space-y-2">
              <Label>体験日（任意）</Label>
              <SingleDatePopover
                date={playedDate}
                onDateChange={(date) => setPlayedDate(date || '')}
                placeholder="日付を選択"
              />
            </div>
            <Button 
              onClick={handleSubmitPlayed} 
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? '登録中...' : '登録する'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})


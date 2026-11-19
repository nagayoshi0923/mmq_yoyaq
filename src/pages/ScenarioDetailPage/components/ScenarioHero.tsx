import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import { referenceMinFee } from '../utils/pricingUtils'
import { registerPlayedScenario } from '@/lib/registerPlayedScenario'
import { memo, useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Label } from '@/components/ui/label'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { useFavorites } from '@/hooks/useFavorites'
import { useAuth } from '@/contexts/AuthContext'
import { scenarioPageReadApi } from '@/lib/api/scenarioPageReadApi'
import { showToast } from '@/utils/toast'
import { logger } from '@/utils/logger'
import type { ScenarioDetail, EventSchedule } from '../utils/types'
import { getOptimizedImageUrl } from '@/utils/imageUtils'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { SERIF_HEADING } from '@/components/renewal/fonts'
import { durationLabel, playersLabel } from '@/components/renewal/labels'

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
export const ScenarioHero = memo(function ScenarioHero({
  scenario,
  stores = [],
  events = [],
}: ScenarioHeroProps) {
  const { user } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()

  // 公演可能店舗名
  // 作品に設定された店舗に、実際に公演がある店舗を足す（設定に無い店舗の回が日程に出ていても名前が欠けないように）
  const availableStoreNames = useMemo(() => {
    const storeMap = new Map(stores.map(s => [s.id, s.short_name || s.name]))
    const names: string[] = []
    const add = (n?: string | null) => { if (n && !names.includes(n)) names.push(n) }
    ;(scenario.available_stores ?? []).forEach(id => add(storeMap.get(id)))
    events.forEach(e => add(storeMap.get(e.store_id) ?? (e.store_short_name || e.store_name)))
    return names
  }, [scenario.available_stores, stores, events])

  // 男女比
  const hasGenderRatio = scenario.male_count != null || scenario.female_count != null || scenario.other_count != null
  const genderRatioParts: string[] = []
  if (scenario.male_count != null) genderRatioParts.push(`男性${scenario.male_count}人`)
  if (scenario.female_count != null) genderRatioParts.push(`女性${scenario.female_count}人`)
  if (scenario.other_count != null) genderRatioParts.push(`その他${scenario.other_count}人`)
  const genderRatioText = genderRatioParts.join(' / ')
  const scenarioIsFavorite = isFavorite(scenario.scenario_master_id)

  // 体験済み登録用ステート
  const { customerId, customerIds, isPlayed: hasPlayed, markAsPlayed, unmarkAsPlayed, loading: isCheckingPlayed } = usePlayedScenarios()
  const isPlayed = hasPlayed(scenario.scenario_master_id)
  const [isPlayedDialogOpen, setIsPlayedDialogOpen] = useState(false)
  const [playedDate, setPlayedDate] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState('')
  const [allStores, setAllStores] = useState<Store[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTogglingPlayed, setIsTogglingPlayed] = useState(false)

  // 全店舗を取得（ダイアログ用）
  useEffect(() => {
    const fetchStores = async () => {
      const { data } = await scenarioPageReadApi.listActiveStoresForHero()
      setAllStores(data || [])
    }
    fetchStores()
  }, [])

  const handleFavoriteClick = () => {
    toggleFavorite(scenario.scenario_master_id)
  }

  const handlePlayedClick = async () => {
    if (!user) {
      showToast.error('ログインが必要です')
      return
    }
    if (isCheckingPlayed) return
    if (isPlayed) {
      if (isTogglingPlayed) return
      if (!customerId) {
        showToast.error('未体験への変更に失敗しました')
        return
      }
      setIsTogglingPlayed(true)
      try {
        await unmarkAsPlayed(scenario.scenario_master_id)

        showToast.success('未体験に戻しました')
      } catch (error) {
        logger.error('未体験変更エラー:', error)
        showToast.error('未体験への変更に失敗しました')
      } finally {
        setIsTogglingPlayed(false)
      }
      return
    }
    setPlayedDate('')
    setSelectedStoreId('')
    setIsPlayedDialogOpen(true)
  }

  const handleSubmitPlayed = async () => {
    if (!user?.id) return

    setIsSubmitting(true)
    try {
      if (!customerId) throw new Error('顧客情報が見つかりません')
      const venueName = allStores.find(store => store.id === selectedStoreId)?.name || null
      const registered = await registerPlayedScenario(customerIds, scenario.scenario_master_id, scenario.scenario_title, playedDate || null, venueName)
      if (!registered) {
        showToast.error(`手動のプレイ履歴は最大${MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER}件まで登録できます`)
        return
      }

      markAsPlayed(scenario.scenario_master_id)
      setIsPlayedDialogOpen(false)
      showToast.success('体験済みに登録しました')
    } catch (error) {
      logger.error('体験済み登録エラー:', error)
      showToast.error('登録に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleShare = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: scenario.scenario_title, url })
      else { await navigator.clipboard.writeText(url); showToast.success('リンクをコピーしました') }
    } catch { /* 共有を閉じたときは何もしない */ }
  }

  return (
    <div className="bg-white">
      {/* キービジュアル（横長。余白はぼかした同じ画像で埋める） */}
      <div className="relative aspect-[13/10] w-full overflow-hidden bg-gray-900 md:aspect-[16/7]">
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
        <OptimizedImage
          src={scenario.key_visual_url}
          alt={scenario.scenario_title}
          className="relative h-full w-full object-contain"
          responsive={true}
          srcSetSizes={[400, 800, 1200]}
          breakpoints={{ mobile: 400, tablet: 600, desktop: 800 }}
          useWebP={true}
          quality={90}
          fallback={
            <div className={`flex h-full w-full items-center justify-center px-6 text-center text-2xl text-white ${SERIF_HEADING}`}>
              {scenario.scenario_title}
            </div>
          }
        />
      </div>

      <div className="mx-auto max-w-4xl px-4 pb-5 pt-4">
        <p className="text-xs text-muted-foreground">{scenario.author}</p>
        <h1 className={`mt-1 text-2xl font-bold leading-snug ${SERIF_HEADING}`}>{scenario.scenario_title}</h1>
        <p className="mt-2 text-sm">
          {[
            playersLabel(scenario.player_count_min, scenario.player_count_max),
            durationLabel(scenario.duration),
            scenario.participation_fee ? `${referenceMinFee(scenario.participation_fee, scenario.participation_costs).toLocaleString()}円〜` : null,
          ].filter(Boolean).join('・')}
        </p>
        {availableStoreNames.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">遊べる店舗：{availableStoreNames.join('・')}</p>
        )}
        {hasGenderRatio && <p className="mt-1 text-xs text-muted-foreground">{genderRatioText}</p>}
        {scenario.genre.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {scenario.genre.map((g) => (
              <li key={g} className="border border-gray-300 px-2 py-0.5 text-xs">{g}</li>
            ))}
            {scenario.has_pre_reading && <li className="border border-gray-300 px-2 py-0.5 text-xs">事前読み込みあり</li>}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <button type="button" onClick={handleFavoriteClick} aria-pressed={scenarioIsFavorite} className={scenarioIsFavorite ? 'font-bold text-red-600' : undefined}>
            {scenarioIsFavorite ? '♥' : '♡'} 遊びたい
          </button>
          <button type="button" onClick={handlePlayedClick} disabled={isCheckingPlayed || isTogglingPlayed} aria-pressed={isPlayed} className={isPlayed ? 'font-bold text-green-700' : undefined}>
            ✓ 遊んだ
          </button>
          <button type="button" onClick={handleShare}>↗ 共有</button>
          {scenario.official_site_url && (
            <a href={scenario.official_site_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">公式サイト</a>
          )}
        </div>
      </div>

      {/* 体験済み登録ダイアログ */}
      <Dialog open={isPlayedDialogOpen} onOpenChange={setIsPlayedDialogOpen}>
        <DialogContent fixedSize="form">
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
            <div className="space-y-2">
              <Label>店舗（任意）</Label>
              <SearchableSelect
                options={allStores.map((s): SearchableSelectOption => ({
                  value: s.id,
                  label: s.name,
                }))}
                value={selectedStoreId}
                onValueChange={setSelectedStoreId}
                placeholder="店舗を選択"
                searchPlaceholder="店舗を検索..."
                emptyText="店舗が見つかりません"
                allowClear={true}
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

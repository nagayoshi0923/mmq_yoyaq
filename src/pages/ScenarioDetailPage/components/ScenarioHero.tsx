import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import { registerPlayedScenario } from '@/lib/registerPlayedScenario'
import { memo, useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
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
import { ScenarioHeroView } from './ScenarioHeroView'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { loginUrlWithIntent } from '@/lib/authReturn'
import { privateGroupCreatePath } from '@/pages/PrivateBookingStart/paths'

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
  showPrivateBookingCta?: boolean
  /** 貸切タブでいま選んでいる希望店舗。グループ作成ページへ同じ店舗で引き継ぐ */
  privateBookingStoreIds?: string[]
}

/**
 * シナリオヒーローセクション（キービジュアル + タイトル + 基本情報）
 */
export const ScenarioHero = memo(function ScenarioHero({
  scenario,
  events = [],
  organizationSlug,
  stores = [],
  showPrivateBookingCta = true,
  privateBookingStoreIds = [],
}: ScenarioHeroProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()

  // 公演可能店舗名
  const availableStoreNames = useMemo(() => {
    if (!scenario.available_stores || scenario.available_stores.length === 0) return []
    const storeMap = new Map(stores.map(s => [s.id, s.short_name || s.name]))
    return scenario.available_stores.map(id => storeMap.get(id)).filter((n): n is string => !!n)
  }, [scenario.available_stores, stores])

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

  const handleCreateGroup = () => {
    const groupCreateUrl = privateGroupCreatePath({ scenarioMasterId: scenario.scenario_master_id, organizationSlug, storeIds: privateBookingStoreIds })
    // 未ログインなら押した時点でログインへ（戻り先付き。行き止まりの画面に送らない。点検 3）
    if (!user) {
      navigate(loginUrlWithIntent('login', groupCreateUrl, `「${scenario.scenario_title}」の貸切リクエスト`))
      return
    }
    navigate(groupCreateUrl)
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

  return (
    <ScenarioHeroView
      scenario={scenario}
      availableStoreNames={availableStoreNames}
      showPrivateBookingCta={showPrivateBookingCta}
      scenarioIsFavorite={scenarioIsFavorite}
      isPlayed={isPlayed}
      isCheckingPlayed={isCheckingPlayed}
      isTogglingPlayed={isTogglingPlayed}
      onPlayedClick={() => { void handlePlayedClick() }}
      onFavoriteClick={handleFavoriteClick}
      onPrivateBookingClick={handleCreateGroup}
      onOfficialSiteClick={() => window.open(scenario.official_site_url, '_blank')}
      onShareClick={() => {
        const url = window.location.href
        const text = scenario.scenario_title
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'width=550,height=420')
      }}
    >
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
    </ScenarioHeroView>
  )
})

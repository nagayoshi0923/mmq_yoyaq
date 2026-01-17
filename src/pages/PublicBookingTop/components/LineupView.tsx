import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScenarioCard } from './ScenarioCard'
import { memo, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import type { ScenarioCard as ScenarioCardType } from '../hooks/useBookingData'

interface LineupViewProps {
  newScenarios: ScenarioCardType[]
  upcomingScenarios: ScenarioCardType[]
  allScenarios: ScenarioCardType[]
  onCardClick: (scenarioId: string) => void
  isFavorite: (scenarioId: string) => boolean
  onToggleFavorite: (scenarioId: string, e: React.MouseEvent) => void
  searchTerm?: string
  organizationSlug?: string
  organizationName?: string | null
  selectedStoreIds?: string[]
  onStoreIdsChange?: (storeIds: string[]) => void
  stores?: any[]
}

/**
 * ラインナップビューコンポーネント
 * 新着・直近公演を表示（全タイトルはカタログページへ）
 * 検索時は全シナリオから検索結果を表示
 */
export const LineupView = memo(function LineupView({
  newScenarios,
  upcomingScenarios,
  allScenarios,
  onCardClick,
  isFavorite,
  onToggleFavorite,
  searchTerm = '',
  organizationSlug,
  organizationName,
  selectedStoreIds = [],
  onStoreIdsChange,
  stores = []
}: LineupViewProps) {
  // 検索中かどうか
  const isSearching = searchTerm.length > 0
  
  // 「もっと見る」の展開状態
  const [isExpanded, setIsExpanded] = useState(false)
  
  // 臨時会場を除外した店舗リスト
  const filteredStores = useMemo(() => stores.filter(store => !store.is_temporary), [stores])
  
  // 店舗フィルターが有効かどうか（選択されていれば適用）
  const hasStoreFilter = selectedStoreIds.length > 0 && selectedStoreIds.length < filteredStores.length
  
  // 選択された店舗IDから店舗名のセットを作成
  const selectedStoreNames = useMemo(() => {
    const names = new Set<string>()
    selectedStoreIds.forEach(id => {
      const store = stores.find(s => s.id === id)
      if (store) {
        if (store.name) names.add(store.name)
        if (store.short_name) names.add(store.short_name)
      }
    })
    return names
  }, [selectedStoreIds, stores])
  
  // 店舗フィルターを適用したシナリオ（イベントの店舗名でフィルタリング）
  const filteredUpcomingScenarios = useMemo(() => {
    if (!hasStoreFilter) return upcomingScenarios
    return upcomingScenarios.filter(scenario => 
      scenario.next_events?.some(event => 
        selectedStoreNames.has(event.store_name || '') || 
        selectedStoreNames.has(event.store_short_name || '')
      )
    ).map(scenario => ({
      ...scenario,
      next_events: scenario.next_events?.filter(event => 
        selectedStoreNames.has(event.store_name || '') || 
        selectedStoreNames.has(event.store_short_name || '')
      )
    }))
  }, [upcomingScenarios, selectedStoreNames, hasStoreFilter])
  
  // 新着は10件まで
  const displayedNewScenarios = newScenarios.slice(0, 10)
  
  // 直近7日以内の公演とそれ以降を分離（フィルタリング済みシナリオを使用）
  const { within7Days, after7Days } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const sevenDaysLater = new Date(today)
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7)
    
    const within: ScenarioCardType[] = []
    const after: ScenarioCardType[] = []
    
    filteredUpcomingScenarios.forEach(scenario => {
      const nextEventDate = scenario.next_events?.[0]?.date
      if (nextEventDate) {
        // YYYY-MM-DD形式の日付を比較
        const eventDate = new Date(nextEventDate + 'T00:00:00')
        if (eventDate < sevenDaysLater) {
          within.push(scenario)
        } else {
          after.push(scenario)
        }
      }
    })
    
    return { within7Days: within, after7Days: after }
  }, [filteredUpcomingScenarios])
  
  const navigate = useNavigate()
  
  const handleCatalogClick = () => {
    const catalogPath = organizationSlug ? `/${organizationSlug}/catalog` : '/catalog'
    navigate(catalogPath)
  }
  
  // 検索中は全シナリオから検索結果を表示
  if (isSearching) {
    return (
      <div className="space-y-6 md:space-y-8">
        <section>
          <h2 className="text-lg mb-3 md:mb-4">
            「{searchTerm}」の検索結果
            <span className="text-xs font-normal text-gray-500 ml-1">
              ({allScenarios.length}件)
            </span>
          </h2>
          {allScenarios.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {allScenarios.map((scenario) => (
                <ScenarioCard 
                  key={scenario.scenario_id} 
                  scenario={scenario} 
                  onClick={onCardClick}
                  isFavorite={isFavorite(scenario.scenario_id)}
                  onToggleFavorite={onToggleFavorite}
                  organizationName={organizationName}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>該当するシナリオが見つかりませんでした</p>
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* 新着公演セクション */}
      {displayedNewScenarios.length > 0 && (
        <section>
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-3 md:mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" style={{ color: THEME.primary }} />
            <span>新着公演</span>
            <Badge 
              className="text-xs px-1.5 md:px-2 py-0.5 flex-shrink-0 border-0"
              style={{ backgroundColor: THEME.accent, color: '#000' }}
            >
              NEW
            </Badge>
            <span 
              className="w-8 h-1 ml-1"
              style={{ backgroundColor: THEME.accent }}
            />
            {newScenarios.length > 10 && (
              <span className="text-xs font-normal text-gray-500 ml-1 flex-shrink-0">
                ({displayedNewScenarios.length} / {newScenarios.length})
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {displayedNewScenarios.map((scenario, index) => (
              <ScenarioCard 
                key={scenario.scenario_id} 
                scenario={scenario} 
                onClick={onCardClick}
                isFavorite={isFavorite(scenario.scenario_id)}
                onToggleFavorite={onToggleFavorite}
                organizationName={organizationName}
                isFirst={index === 0}
              />
            ))}
          </div>
        </section>
      )}

      {/* 直近公演セクション（7日以内を常時表示、それ以降は「もっと見る」） */}
      {upcomingScenarios.length > 0 && (
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 md:mb-4">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5" style={{ color: THEME.primary }} />
              <span>直近公演</span>
              <span 
                className="w-8 h-1 ml-1"
                style={{ backgroundColor: THEME.accent }}
              />
              <span className="text-xs font-normal text-gray-500 ml-1">
                (7日以内: {within7Days.length}件)
              </span>
            </h2>
            
            {/* 店舗フィルター */}
            {filteredStores.length > 0 && onStoreIdsChange && (
              <div className="flex items-center gap-2">
                <label className="text-xs sm:text-sm whitespace-nowrap text-gray-600">店舗:</label>
                <div className="w-48 sm:w-52">
                  <StoreMultiSelect
                    stores={filteredStores}
                    selectedStoreIds={selectedStoreIds}
                    onStoreIdsChange={onStoreIdsChange}
                    hideLabel={true}
                    placeholder="すべて"
                    emptyText=""
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* 7日以内の公演 */}
          {within7Days.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {within7Days.map((scenario, index) => (
                <ScenarioCard 
                  key={scenario.scenario_id} 
                  scenario={scenario} 
                  onClick={onCardClick}
                  isFavorite={isFavorite(scenario.scenario_id)}
                  onToggleFavorite={onToggleFavorite}
                  organizationName={organizationName}
                  isFirst={displayedNewScenarios.length === 0 && index === 0}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground bg-gray-50 rounded-lg">
              <p>7日以内の公演予定はありません</p>
            </div>
          )}
          
          {/* もっと見るボタン（7日以降の公演がある場合） */}
          {after7Days.length > 0 && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full gap-2"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    閉じる
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    8日以降の公演を見る（{after7Days.length}件）
                  </>
                )}
              </Button>
              
              {/* 展開時に表示 */}
              {isExpanded && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                  {after7Days.map((scenario) => (
                    <ScenarioCard 
                      key={scenario.scenario_id} 
                      scenario={scenario} 
                      onClick={onCardClick}
                      isFavorite={isFavorite(scenario.scenario_id)}
                      onToggleFavorite={onToggleFavorite}
                      organizationName={organizationName}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* カタログへのリンク */}
      <section className="text-center py-6 border-t">
        <p className="text-sm text-muted-foreground mb-3">
          全{allScenarios.length}タイトルを検索・フィルター
        </p>
        <Button
          variant="outline"
          onClick={handleCatalogClick}
          className="gap-2 hover:scale-[1.02] transition-transform"
          style={{ 
            borderColor: THEME.primary,
            color: THEME.primary,
            borderWidth: 2,
          }}
        >
          <BookOpen className="w-4 h-4" />
          シナリオカタログを見る
        </Button>
      </section>
    </div>
  )
})


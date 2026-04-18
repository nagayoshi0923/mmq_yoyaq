import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { supabase } from '@/lib/supabase'
import { useFavorites } from '@/hooks/useFavorites'
import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Search, ArrowLeft, Clock, Users, Heart, X, Filter, Sparkles, BookOpen, CheckCheck, ChevronDown } from 'lucide-react'
import { logger } from '@/utils/logger'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'

interface ScenarioData {
  id: string
  slug?: string  // URL用のslug（あればこちらを使用）
  title: string
  author: string
  key_visual_url?: string
  duration: number
  player_count_min: number
  player_count_max: number
  genre: string[]
  participation_fee?: number
  difficulty?: string
  release_date?: string
  is_recommended?: boolean
  available_stores?: string[]
}

interface StoreData {
  id: string
  name: string
  short_name?: string
  ownership_type?: string
  region?: string
  address?: string
  display_order?: number
}

interface CategoryData {
  id: string
  name: string
  sort_order: number
}

// バッジ種類を判定するヘルパー関数
function getScenarioBadge(scenario: ScenarioData): { label: string; bgColor: string; textColor: string } | null {
  // おすすめ（管理者設定）- 最優先
  if (scenario.is_recommended) {
    return { label: 'おすすめ', bgColor: THEME.primary, textColor: '#fff' }
  }
  // ロングセラー（リリースから1年以上）
  if (scenario.release_date) {
    const releaseDate = new Date(scenario.release_date)
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    if (releaseDate <= oneYearAgo) {
      return { label: 'ロングセラー', bgColor: THEME.accent, textColor: '#000' }
    }
  }
  return null
}

interface ScenarioCatalogProps {
  organizationSlug?: string
}

async function fetchScenarioCatalogBundle(): Promise<{
  scenarios: ScenarioData[]
  stores: StoreData[]
  categories: CategoryData[]
}> {
  const { getCurrentOrganizationId } = await import('@/lib/organization')
  const orgId = await getCurrentOrganizationId()
  let scenariosQuery = supabase
    .from('organization_scenarios_with_master')
    .select(
      'id, org_scenario_id, slug, title, author, key_visual_url, duration, player_count_min, player_count_max, genre, participation_fee, difficulty, release_date, status, scenario_master_id, available_stores, is_recommended, scenario_type, organization_id'
    )
    .eq('status', 'available')
    .neq('scenario_type', 'gm_test')
    .order('title', { ascending: true })
  if (orgId) {
    scenariosQuery = scenariosQuery.eq('organization_id', orgId)
  }
  const [scenariosResult, availableKeysResult, storesResult, categoriesResult] = await Promise.all([
    scenariosQuery,
    supabase.rpc('get_public_available_scenario_keys'),
    supabase.from('stores').select('id, name, short_name, ownership_type, region, address, display_order'),
    supabase.rpc('get_all_public_categories'),
  ])

  const stores = (storesResult.data || []) as StoreData[]
  const categories = (categoriesResult.data || []) as CategoryData[]

  const storeMap = new Map<string, string>()
  stores.forEach((store: StoreData) => {
    storeMap.set(store.id, store.short_name || store.name)
  })

  const keysData = availableKeysResult.data || []
  const availableOrgKeys = new Set(keysData.map((k: any) => `${k.organization_id}_${k.scenario_master_id}`))
  const shouldFilter = !availableKeysResult.error && keysData.length > 0

  if (scenariosResult.error) throw scenariosResult.error

  const availableScenarios = (scenariosResult.data || [])
    .filter((s: any) => {
      if (!shouldFilter) return true
      if (!s.scenario_master_id) return true
      return availableOrgKeys.has(`${s.organization_id}_${s.scenario_master_id}`)
    })
    .map((s: any) => ({
      ...s,
      available_stores: (s.available_stores || [])
        .map((storeId: string) => storeMap.get(storeId))
        .filter((name: string | undefined): name is string => !!name),
    })) as ScenarioData[]

  return { scenarios: availableScenarios, stores, categories }
}

export function ScenarioCatalog({ organizationSlug }: ScenarioCatalogProps) {
  const { isStaff } = useAuth()
  const { organization } = useOrganization()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // 予約サイトのベースパス（propsから優先、なければorganizationから）
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : (organization?.slug ? `/${organization.slug}` : '/queens-waltz')
  const catalogQueryScope = organizationSlug ?? organization?.slug ?? 'global'
  const shouldShowNavigation = isStaff

  const {
    data: catalogData,
    isPending,
    isFetching,
    error: catalogQueryError,
  } = useQuery({
    queryKey: ['scenario-catalog', catalogQueryScope],
    queryFn: fetchScenarioCatalogBundle,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const scenarios = catalogData?.scenarios ?? []
  const stores = catalogData?.stores ?? []
  const categories = catalogData?.categories ?? []

  useEffect(() => {
    if (catalogQueryError) logger.error('シナリオ取得エラー:', catalogQueryError)
  }, [catalogQueryError])

  useReportRouteScrollRestoration('scenario-catalog', {
    isLoading: isPending,
    isFetching,
  })
  const [searchTerm, setSearchTerm] = useState('')
  /** カテゴリ複数: URL の繰り返し `genre=` */
  const selectedCategories = useMemo(
    () => [...new Set(searchParams.getAll('genre').filter(Boolean))],
    [searchParams]
  )
  const [selectedDuration, setSelectedDuration] = useState<string>('all')
  const [selectedPlayerCount, setSelectedPlayerCount] = useState<string>('all')
  const [selectedStore, setSelectedStore] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(() => {
    return new URLSearchParams(window.location.search).getAll('genre').length > 0
  })
  
  const { isFavorite, toggleFavorite } = useFavorites()
  const { isPlayed } = usePlayedScenarios()

  const toggleCategory = useCallback(
    (name: string) => {
      const next = new URLSearchParams(searchParams)
      const list = next.getAll('genre').filter(Boolean)
      next.delete('genre')
      const s = new Set(list)
      if (s.has(name)) s.delete(name)
      else s.add(name)
      ;[...s].sort().forEach((g) => next.append('genre', g))
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  const clearCategories = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('genre')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // カテゴリ一覧（シナリオの登録数が多い順にソート）
  const genres = useMemo(() => {
    // シナリオのgenreからカテゴリの出現回数をカウント
    const genreCount = new Map<string, number>()
    scenarios.forEach(scenario => {
      scenario.genre?.forEach(g => {
        genreCount.set(g, (genreCount.get(g) || 0) + 1)
      })
    })
    
    // organization_categoriesに登録されているカテゴリのみ、登録数順でソート
    const categoryNames = new Set(categories.map(c => c.name))
    return Array.from(genreCount.entries())
      .filter(([name]) => categoryNames.has(name))
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
  }, [categories, scenarios])

  // 実際に存在する所要時間の選択肢を動的生成（シナリオのdurationから）
  const availableDurations = useMemo(() => {
    const durationSet = new Set<number>()
    scenarios.forEach(s => { if (s.duration) durationSet.add(s.duration) })
    return Array.from(durationSet).sort((a, b) => a - b)
  }, [scenarios])

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m}分`
    if (m === 0) return `${h}時間`
    return `${h}時間${m}分`
  }

  // オフィスと臨時会場を除外した店舗一覧
  const regularStores = useMemo(() => {
    return stores.filter(s => {
      const name = s.short_name || s.name || ''
      const isOffice = s.ownership_type === 'office' || name.includes('オフィス')
      const isTemporary = s.ownership_type === 'temporary' || name.includes('臨時')
      return !isOffice && !isTemporary
    })
  }, [stores])

  // 地域から抽出するヘルパー関数
  const extractRegionFromAddress = (address?: string): string => {
    if (!address) return 'その他'
    const match = address.match(/^(東京都|大阪府|京都府|北海道|.{2,3}県)/)
    return match ? match[1] : 'その他'
  }

  // 地域ごとにグループ化した店舗（display_orderでソート）
  const storesByRegion = useMemo(() => {
    const groups = new Map<string, StoreData[]>()
    // display_orderでソート
    const sortedStores = [...regularStores].sort((a: any, b: any) => 
      (a.display_order || 999) - (b.display_order || 999)
    )
    sortedStores.forEach(store => {
      const region = store.region || extractRegionFromAddress(store.address) || 'その他'
      if (!groups.has(region)) {
        groups.set(region, [])
      }
      groups.get(region)!.push(store)
    })
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'その他') return 1
      if (b === 'その他') return -1
      return a.localeCompare(b)
    })
  }, [regularStores])

  // フィルタリング
  const filteredScenarios = useMemo(() => {
    return scenarios.filter(scenario => {
      // 検索
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matchTitle = scenario.title.toLowerCase().includes(term)
        const matchAuthor = scenario.author?.toLowerCase().includes(term)
        const matchGenre = scenario.genre?.some(g => g.toLowerCase().includes(term))
        const matchStore = scenario.available_stores?.some(s => s.toLowerCase().includes(term))
        if (!matchTitle && !matchAuthor && !matchGenre && !matchStore) return false
      }
      
      // カテゴリフィルター（複数選択時はいずれかを含む）
      if (selectedCategories.length > 0) {
        const hit = selectedCategories.some((cat) => scenario.genre?.includes(cat))
        if (!hit) return false
      }
      
      // 所要時間フィルター（完全一致）
      if (selectedDuration !== 'all') {
        const duration = scenario.duration
        const exactDuration = parseInt(selectedDuration)
        if (duration !== exactDuration) return false
      }
      
      // プレイ人数フィルター
      if (selectedPlayerCount !== 'all') {
        const count = parseInt(selectedPlayerCount)
        if (count < scenario.player_count_min || count > scenario.player_count_max) return false
      }
      
      // 店舗フィルター
      if (selectedStore !== 'all') {
        const storeName = stores.find(s => s.id === selectedStore)?.short_name || 
                          stores.find(s => s.id === selectedStore)?.name
        if (!storeName || !scenario.available_stores?.includes(storeName)) return false
      }
      
      return true
    })
  }, [scenarios, searchTerm, selectedCategories, selectedDuration, selectedPlayerCount, selectedStore, stores])

  const handleBack = useCallback(() => {
    navigate(bookingBasePath)
  }, [bookingBasePath, navigate])

  const handleCardClick = useCallback((scenarioId: string) => {
    saveScrollPositionForCurrentUrl()
    // 組織slugがあれば予約サイト形式、なければグローバル形式
    if (organizationSlug || organization?.slug) {
      const slug = organizationSlug || organization?.slug
      navigate(`/${slug}/scenario/${scenarioId}`)
    } else {
      navigate(`/scenario-detail/${scenarioId}`)
    }
  }, [organizationSlug, organization?.slug, navigate])

  const handleToggleFavorite = useCallback((scenarioId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }, [toggleFavorite])

  const clearFilters = useCallback(() => {
    setSearchTerm('')
    const next = new URLSearchParams(searchParams)
    next.delete('genre')
    setSearchParams(next, { replace: true })
    setSelectedDuration('all')
    setSelectedPlayerCount('all')
    setSelectedStore('all')
  }, [searchParams, setSearchParams])

  const hasActiveFilters =
    searchTerm ||
    selectedCategories.length > 0 ||
    selectedDuration !== 'all' ||
    selectedPlayerCount !== 'all' ||
    selectedStore !== 'all'

  return (
    <div className="min-h-screen overflow-x-clip" style={{ backgroundColor: THEME.background }}>
      <Header />
      {shouldShowNavigation && (
        <NavigationBar currentPage={bookingBasePath} />
      )}

      {/* ヒーローセクション - シャープデザイン */}
      <section 
        className="relative overflow-hidden"
        style={{ backgroundColor: THEME.primary }}
      >
        {/* アクセント装飾 */}
        <div 
          className="absolute top-0 right-0 w-48 h-48 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div 
          className="absolute bottom-0 left-0 w-1 h-12"
          style={{ backgroundColor: THEME.accent }}
        />
        
        <div className="container mx-auto max-w-7xl px-4 py-4 md:py-6 relative">
          <div className="flex items-center gap-3 text-white">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="text-white hover:bg-white/20 -ml-2"
              style={{ borderRadius: 0 }}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              {/* アクセントバッジ */}
              <div 
                className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium mb-1"
                style={{ backgroundColor: THEME.accent, color: '#000' }}
              >
                <BookOpen className="w-2.5 h-2.5" />
                SCENARIO CATALOG
              </div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight">シナリオカタログ</h1>
              <p className="text-sm text-white/80">全{scenarios.length}タイトル</p>
            </div>
          </div>
        </div>
      </section>

      {/* 検索・フィルター */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-4 py-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="タイトル、作者、カテゴリで検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="h-10 px-3"
              style={showFilters ? { backgroundColor: THEME.primary } : { borderColor: THEME.primary, color: THEME.primary }}
            >
              <Filter className="w-4 h-4" />
            </Button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-10 px-3 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          
          {/* カテゴリークイックフィルター */}
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pb-1 overflow-x-auto">
              <Badge
                variant={selectedCategories.length === 0 ? 'default' : 'outline'}
                className={`cursor-pointer text-xs px-2 py-1 transition-all ${
                  selectedCategories.length === 0
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'hover:bg-gray-100'
                }`}
                onClick={() => clearCategories()}
              >
                すべて
              </Badge>
              {genres.slice(0, 10).map((genre) => (
                <Badge
                  key={genre}
                  variant={selectedCategories.includes(genre) ? 'default' : 'outline'}
                  className={`cursor-pointer text-xs px-2 py-1 transition-all whitespace-nowrap ${
                    selectedCategories.includes(genre)
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'hover:bg-gray-100'
                  }`}
                  onClick={() => toggleCategory(genre)}
                >
                  {genre}
                </Badge>
              ))}
            </div>
          )}
          
          {/* フィルターパネル */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-[#F6F9FB] px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary focus:ring-offset-0"
                  >
                    <span className="truncate text-left">
                      {selectedCategories.length === 0
                        ? 'すべてのカテゴリ'
                        : selectedCategories.length <= 2
                          ? selectedCategories.join('、')
                          : `${selectedCategories.length}件のカテゴリ`}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2 max-h-64 overflow-y-auto" align="start">
                  {genres.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-1.5">カテゴリがありません</p>
                  ) : (
                    <div className="space-y-0.5">
                      {selectedCategories.length > 0 && (
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-primary hover:bg-muted"
                          onClick={() => clearCategories()}
                        >
                          すべてクリア
                        </button>
                      )}
                      {genres.map((g) => (
                        <label
                          key={g}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={selectedCategories.includes(g)}
                            onChange={() => toggleCategory(g)}
                          />
                          <span>{g}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              
              <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="所要時間" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての時間</SelectItem>
                  {availableDurations.map(d => (
                    <SelectItem key={d} value={d.toString()}>{formatDuration(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={selectedPlayerCount} onValueChange={setSelectedPlayerCount}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="プレイ人数" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての人数</SelectItem>
                  {[4, 5, 6, 7, 8, 9, 10].map(count => (
                    <SelectItem key={count} value={count.toString()}>{count}人</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="店舗" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての店舗</SelectItem>
                  {storesByRegion.map(([region, regionStores]) => (
                    <SelectGroup key={region}>
                      <SelectLabel className="text-xs text-muted-foreground">{region}</SelectLabel>
                      {regionStores.map(store => (
                        <SelectItem key={store.id} value={store.id}>{store.short_name || store.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* 結果表示 */}
      <div className="container mx-auto max-w-7xl px-4 py-4">
        {hasActiveFilters && (
          <p className="text-sm text-muted-foreground mb-4">
            {filteredScenarios.length}件のシナリオが見つかりました
          </p>
        )}

        {isPending ? (
          <div className="flex justify-center py-12">
            <div 
              className="animate-spin h-8 w-8 border-4 border-t-transparent"
              style={{ borderColor: `${THEME.primary} transparent ${THEME.primary} ${THEME.primary}` }}
            />
          </div>
        ) : filteredScenarios.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">該当するシナリオが見つかりませんでした</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {filteredScenarios.map((scenario, index) => (
              <div
                key={scenario.id}
                className="group cursor-pointer"
                onClick={() => handleCardClick(scenario.slug || scenario.id)}
              >
                {/* カード本体 - シャープデザイン */}
                <div 
                  className="relative bg-white overflow-hidden border border-gray-200 group-hover:border-gray-300 group-hover:shadow-lg transition-all duration-200 flex md:flex-col hover:scale-[1.02]"
                  style={{ borderRadius: 0 }}
                >
                  {/* キービジュアル */}
                  <div className="relative w-32 md:w-full aspect-[3/4] overflow-hidden bg-gray-900 flex-shrink-0">
                    {scenario.key_visual_url ? (
                      <>
                        {/* 背景：ぼかした画像で余白を埋める */}
                        <div 
                          className="absolute inset-0 scale-110"
                          style={{
                            backgroundImage: `url(${scenario.key_visual_url})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            filter: 'blur(20px) brightness(0.7)',
                          }}
                        />
                        {/* メイン画像：全体を表示 */}
                        <img
                          src={scenario.key_visual_url}
                          alt={scenario.title}
                          className="relative w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                    {/* バッジ表示: おすすめ > ロングセラー */}
                    {(() => {
                      const badge = getScenarioBadge(scenario)
                      if (badge) {
                        return (
                          <div 
                            className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold"
                            style={{ backgroundColor: badge.bgColor, color: badge.textColor }}
                          >
                            {badge.label}
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>

                  {/* コンテンツ */}
                  <div className="p-2 sm:p-3 flex-1 min-w-0">
                    {/* 著者 + 体験済み・お気に入りボタン */}
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-gray-500">{scenario.author}</p>
                      <div className="flex items-center gap-0.5">
                        {/* 体験済みマーク */}
                        <button 
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => e.stopPropagation()}
                          className="flex-shrink-0 p-1 cursor-default"
                          title={isPlayed(scenario.id) ? '体験済み' : '未体験'}
                        >
                          <CheckCheck className={`h-4 w-4 ${isPlayed(scenario.id) ? 'text-green-500' : 'text-gray-300'}`} />
                        </button>
                        {/* お気に入りボタン */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            toggleFavorite(scenario.id)
                          }}
                          onTouchEnd={(e) => e.stopPropagation()}
                          className="flex-shrink-0 p-1 transition-colors hover:bg-red-50 rounded"
                        >
                          <Heart className={`h-4 w-4 fill-current text-red-500 ${
                            isFavorite(scenario.id) ? 'opacity-100' : 'opacity-30 hover:opacity-50'
                          }`} />
                        </button>
                      </div>
                    </div>
                    
                    {/* タイトル */}
                    <h3 className="text-sm font-bold text-gray-900 leading-snug mb-2 line-clamp-2">
                      {scenario.title}
                    </h3>

                    {/* 人数・時間・参加費 */}
                    <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {scenario.player_count_min === scenario.player_count_max
                          ? `${scenario.player_count_max}人`
                          : `${scenario.player_count_min}-${scenario.player_count_max}人`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {scenario.duration >= 60 
                          ? `${Math.floor(scenario.duration / 60)}h${scenario.duration % 60 > 0 ? `${scenario.duration % 60}m` : ''}`
                          : `${scenario.duration}分`}
                      </span>
                      {scenario.participation_fee && (
                        <span>¥{scenario.participation_fee.toLocaleString()}〜</span>
                      )}
                    </div>

                    {/* カテゴリ - クリックでフィルタリング */}
                    {scenario.genre && scenario.genre.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {scenario.genre.slice(0, 3).map((genre, idx) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="text-xs px-1.5 py-0.5 h-5 font-normal bg-gray-100 border-0 cursor-pointer hover:bg-gray-200 hover:scale-105 transition-all"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleCategory(genre)
                              setShowFilters(true)
                            }}
                          >
                            {genre}
                          </Badge>
                        ))}
                        {scenario.genre.length > 3 && (
                          <Badge
                            variant="secondary"
                            className="text-xs px-1.5 py-0.5 h-5 font-normal bg-gray-100 border-0"
                          >
                            +{scenario.genre.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

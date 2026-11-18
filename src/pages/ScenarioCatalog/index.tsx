import { useState, useEffect, useMemo, useCallback } from 'react'
import { referenceMinFee, type ParticipationCost } from '@/pages/ScenarioDetailPage/utils/pricingUtils'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { useOrgThemePreset } from '@/hooks/useOrgThemePreset'
import { scenarioCatalogReadApi } from '@/lib/api/scenarioPageReadApi'
import { platformPageReadApi } from '@/lib/api/platformPageReadApi'
import { scenarioPageReadApi } from '@/lib/api/scenarioPageReadApi'
import { useFavorites } from '@/hooks/useFavorites'
import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import { logger } from '@/utils/logger'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { NEW_ARRIVAL_CHIP, isNewArrivalTarget, matchesCategoryChips, newArrivalDateIfTarget, newArrivalPublicKeys, sortCatalogForNewArrivals } from '@/components/public-top/newArrivals'
import { todayJst } from '@/lib/publicPerformanceSearch'
import { CatalogView, type CatalogItem } from '@/components/renewal/CatalogView'

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
  /** この組織が一覧に登録した日時（組織トップの新作と同じ。「新作」のチップの判定に使う） */
  created_at?: string | null
  /** 新作の対象か（組織トップの新作と同じ isNewArrivalTarget。一般のカタログの絞り込みには使わない） */
  new_arrival_target?: boolean
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

// バッジ種類を判定するヘルパー関数 (色は呼び出し側のテーマに合わせて差し替えるため引数で受ける)
function getScenarioBadge(
  scenario: ScenarioData,
  themeColors: { primary: string; accent: string },
): { label: string; bgColor: string; textColor: string } | null {
  // おすすめ（管理者設定）- 最優先
  if (scenario.is_recommended) {
    return { label: 'おすすめ', bgColor: themeColors.primary, textColor: '#fff' }
  }
  // ロングセラー（リリースから1年以上）
  if (scenario.release_date) {
    const releaseDate = new Date(scenario.release_date)
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    if (releaseDate <= oneYearAgo) {
      return { label: 'ロングセラー', bgColor: themeColors.accent, textColor: '#fff' }
    }
  }
  return null
}

interface ScenarioCatalogProps {
  organizationSlug?: string
}

async function fetchScenarioCatalogBundle(organizationSlug?: string): Promise<{
  scenarios: ScenarioData[]
  stores: StoreData[]
  categories: CategoryData[]
}> {
  const { getCurrentOrganizationId, resolveOrganizationFromPathSegment } = await import('@/lib/organization')
  // 予約サイト（/{組織}/catalog）では URL の組織で絞る。ログイン利用者の所属で絞ると、お客様は全組織分が混ざり
  // トップの「○タイトル」と件数が合わなくなる
  const pathOrg = organizationSlug ? await resolveOrganizationFromPathSegment(organizationSlug, { requireActive: true }) : null
  const orgId = pathOrg?.id ?? (organizationSlug ? null : await getCurrentOrganizationId())
  const [scenariosResult, availableKeysResult, storesResult, categoriesResult] = await Promise.all([
    scenarioCatalogReadApi.listAvailableScenarios(orgId),
    platformPageReadApi.getPublicAvailableScenarioKeys(),
    scenarioPageReadApi.listStoresForCatalog(),
    platformPageReadApi.getAllPublicCategories(),
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

  // 「新作」チップの対象（組織トップと同じ isNewArrivalTarget。URL の組織の、稼働中・公開キーに含まれる行）
  const newArrivalScope = {
    publicKeys: newArrivalPublicKeys(keysData, !!availableKeysResult.error),
    activeOrganizationIds: new Set(pathOrg?.id ? [pathOrg.id] : orgId ? [orgId] : []),
    organizationId: orgId,
  }
  const availableScenarios = (scenariosResult.data || [])
    .filter((s) => {
      if (!shouldFilter) return true
      if (!s.scenario_master_id) return true
      return availableOrgKeys.has(`${s.organization_id}_${s.scenario_master_id}`)
    })
    .map((s) => ({
      ...s,
      // 「¥N〜」は日付・時間帯の料金の最安（作品ページ・トップと同じ。点検 F05）
      participation_fee: s.participation_fee != null ? referenceMinFee(s.participation_fee, s.participation_costs as ParticipationCost[] | null) : s.participation_fee,
      new_arrival_target: isNewArrivalTarget(s, newArrivalScope),
      available_stores: (s.available_stores || [])
        .map((storeId: string) => storeMap.get(storeId))
        .filter((name: string | undefined): name is string => !!name),
    })) as ScenarioData[]

  return { scenarios: availableScenarios, stores, categories }
}

export function ScenarioCatalog({ organizationSlug }: ScenarioCatalogProps) {
  const { isStaff, user } = useAuth()
  const { organization } = useOrganization()
  const preset = useOrgThemePreset(organizationSlug)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // 予約サイトのベースパス（propsから優先、なければorganizationから）
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : (organization?.slug ? `/${organization.slug}` : '')
  const catalogQueryScope = organizationSlug ?? organization?.slug ?? 'global'
  const shouldShowNavigation = isStaff

  const {
    data: catalogData,
    isPending,
    isFetching,
    error: catalogQueryError,
  } = useQuery({
    queryKey: ['scenario-catalog', catalogQueryScope],
    queryFn: () => fetchScenarioCatalogBundle(organizationSlug ?? organization?.slug),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const scenarios = useMemo(() => catalogData?.scenarios ?? [], [catalogData])
  const stores = useMemo(() => catalogData?.stores ?? [], [catalogData])
  const categories = useMemo(() => catalogData?.categories ?? [], [catalogData])

  useEffect(() => {
    if (catalogQueryError) logger.error('シナリオ取得エラー:', catalogQueryError)
  }, [catalogQueryError])

  useReportRouteScrollRestoration('scenario-catalog', {
    isLoading: isPending,
    isFetching,
  })
  // トップの「作品から探す」から ?q= で来たらその言葉で検索した状態で開く
  const [searchTerm, setSearchTerm] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
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
  // チップ・カテゴリの選択肢: 先頭に「新作」（90 日の判定。ジャンルの「新作」とは重ねない）、続けて既存のカテゴリ
  const chipGenres = useMemo(() => [NEW_ARRIVAL_CHIP, ...genres.filter((g) => g !== NEW_ARRIVAL_CHIP)], [genres])
  // 新作の判定（トップの新作一覧と同じ関数）。今日は JST
  const today = todayJst(new Date())
  const newDateById = useMemo(() => new Map(scenarios.map((s) => [s.id, newArrivalDateIfTarget({ new_arrival_target: s.new_arrival_target, release_date: s.release_date ?? null, listed_at: s.created_at ?? null }, today)])), [scenarios, today])

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
    const sortedStores = [...regularStores].sort((a, b) => 
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
        const matchTitle = (scenario.title ?? '').toLowerCase().includes(term)
        const matchAuthor = scenario.author?.toLowerCase().includes(term)
        const matchGenre = scenario.genre?.some(g => g.toLowerCase().includes(term))
        const matchStore = scenario.available_stores?.some(s => s.toLowerCase().includes(term))
        if (!matchTitle && !matchAuthor && !matchGenre && !matchStore) return false
      }
      
      // カテゴリフィルター（複数選択時はいずれかを含む）。「新作」のチップは 90 日の判定
      if (!matchesCategoryChips(scenario.genre, selectedCategories, !!newDateById.get(scenario.id))) return false
      
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
  }, [scenarios, searchTerm, selectedCategories, selectedDuration, selectedPlayerCount, selectedStore, stores, newDateById])
  // 「新作」を選んでいるときは、新作をトップと同じ並び（基準日の新しい順）で先に
  const sortedScenarios = useMemo(
    () => sortCatalogForNewArrivals(filteredScenarios, selectedCategories, (s) => newDateById.get(s.id) ?? null),
    [filteredScenarios, selectedCategories, newDateById],
  )

  // 「‹」は前の画面へ（履歴が無いときは組織トップ）
  const handleBack = useCallback(() => {
    if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1)
    else navigate(bookingBasePath || '/')
  }, [bookingBasePath, navigate])

  const handleCardClick = useCallback((scenarioId: string) => {
    saveScrollPositionForCurrentUrl()
    // 組織slugがあれば予約サイト形式、なければグローバル形式
    if (organizationSlug || organization?.slug) {
      const slug = organizationSlug || organization?.slug
      navigate(`/${slug}/scenario/${scenarioId}`)
    } else {
      // 全体のカタログは MMQ 全体の作品紹介へ
      navigate(`/scenario/${scenarioId}`)
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

  const setCategories = useCallback((list: string[]) => {
    const next = new URLSearchParams(searchParams)
    next.delete('genre')
    ;[...new Set(list)].sort().forEach((g) => next.append('genre', g))
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])
  const items = useMemo<CatalogItem[]>(() => sortedScenarios.map((sc) => ({
    id: sc.id,
    key: sc.slug || sc.id,
    title: sc.title ?? '',
    key_visual_url: sc.key_visual_url,
    player_count_min: sc.player_count_min,
    player_count_max: sc.player_count_max,
    duration: sc.duration,
    sortDate: newDateById.get(sc.id)?.date ?? sc.release_date ?? sc.created_at ?? null,
  })), [sortedScenarios, newDateById])

  // 刷新（QW-20261114-001）: 見た目は全体カタログと共通の CatalogView
  return (
    <div className="booking-shell min-h-screen overflow-x-clip bg-[#f7f6f3]">
      <Header />
      {shouldShowNavigation && <NavigationBar currentPage={bookingBasePath} />}
      <CatalogView
        scopeLabel="この組織の"
        items={items}
        isPending={isPending}
        genres={chipGenres}
        selectedCategories={selectedCategories}
        onCategoriesChange={setCategories}
        searchTerm={searchTerm}
        onClearSearch={() => setSearchTerm('')}
        loggedIn={!!user}
        isNew={(id) => !!newDateById.get(id)}
        isPlayed={isPlayed}
        isFavorite={isFavorite}
        onToggleFavorite={handleToggleFavorite}
        onOpen={(it) => handleCardClick(it.key)}
        onBack={handleBack}
      />
    </div>
  )
}

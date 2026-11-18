/**
 * MMQ シナリオ検索ページ
 * @path /scenario
 * @purpose 全組織のシナリオを検索・フィルター
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { CatalogView, type CatalogItem } from '@/components/renewal/CatalogView'
import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import { referenceMinFee, type ParticipationCost } from '@/pages/ScenarioDetailPage/utils/pricingUtils'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { platformPageReadApi } from '@/lib/api/platformPageReadApi'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { NEW_ARRIVAL_CHIP, matchesCategoryChips, newArrivalBasis, newArrivalDateIfTarget, newArrivalPublicKeys, sortCatalogForNewArrivals } from '@/components/public-top/newArrivals'
import { todayJst } from '@/lib/publicPerformanceSearch'
import { X } from 'lucide-react'

interface ScenarioData {
  id: string
  slug?: string
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
  organization_id: string
  organization_slug?: string
  organization_name?: string
  scenario_master_id?: string | null
  org_scenario_id?: string | null
  available_stores?: string[] // 公演可能店舗名リスト
  available_store_ids?: string[] // 公演可能店舗IDリスト（フィルタ用）
  is_recommended?: boolean
  /** 新作の基準の掲載登録日時（newArrivals.ts の newArrivalBasis。全体トップの新作と同じ） */
  listed_at?: string | null
  /** 新作の対象か（全体トップの新作と同じ isNewArrivalTarget。一般のカタログの絞り込みには使わない） */
  new_arrival_target?: boolean
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

interface StoreData {
  id: string
  name: string
  short_name?: string
  ownership_type?: string
  region?: string
  address?: string
  display_order?: number
  organization_id?: string
  organization_name?: string
}

interface ScenarioSearchResult {
  scenarios: ScenarioData[]
  categories: CategoryData[]
  stores: StoreData[]
}

/**
 * シナリオ検索データを取得する関数
 * React Queryでキャッシュされる
 */
async function fetchScenarioSearchData(): Promise<ScenarioSearchResult> {
  // 🚀 並列取得: RPC、シナリオ、店舗データ、カテゴリを同時に取得
  const [keysResult, scenariosResult, storesResult, categoriesResult] = await Promise.all([
    platformPageReadApi.getPublicAvailableScenarioKeys(),
    platformPageReadApi.listAvailableScenarioViews(),
    // 店舗データを取得（available_storesのIDを名前に変換するため + フィルター用）
    // RPC経由で取得（anon権限でも安全に取得可能）
    platformPageReadApi.getAllPublicStores(),
    // カテゴリを取得（RPC経由で匿名ユーザーにも安全に返す）
    platformPageReadApi.getAllPublicCategories()
  ])

  const availableKeys = keysResult.data || []
  const keysError = keysResult.error
  
  // 公開中の組織シナリオのキーセット
  const availableOrgKeys = new Set(
    availableKeys.map((k: any) => `${k.organization_id}_${k.scenario_master_id}`)
  )
  
  const shouldFilterByOrgStatus = !keysError && availableKeys.length > 0

  if (scenariosResult.error) throw scenariosResult.error
  
  // 店舗IDから名前へのマップ、および組織IDから店舗ID一覧へのマップを作成
  const storeMap = new Map<string, string>()
  const orgToStoreIdsMap = new Map<string, string[]>()
  ;(storesResult.data || []).forEach((store: any) => {
    storeMap.set(store.id, store.short_name || store.name)
    if (store.organization_id) {
      const ids = orgToStoreIdsMap.get(store.organization_id) || []
      ids.push(store.id)
      orgToStoreIdsMap.set(store.organization_id, ids)
    }
  })
  
  // 組織IDから組織名へのマップを作成（シナリオデータから）
  const orgNameMap = new Map<string, string>()
  ;(scenariosResult.data || []).forEach((s) => {
    const org = s.organizations as { slug?: string; name?: string } | null
    if (s.organization_id && org?.name) {
      orgNameMap.set(s.organization_id, org.name)
    }
  })

  // 組織の公開ステータスで絞り込み
  const mapped = (scenariosResult.data || [])
    // 稼働中の組織の作品だけ（組織が読めない＝休止中の組織。全体トップの「全国 N」と数を合わせる）
    .filter(s => !!(s.organizations as { slug?: string } | null)?.slug)
    .filter(s => {
      if (!shouldFilterByOrgStatus) {
        return s.status === 'available'
      }
      if (!s.scenario_master_id) return s.status === 'available'
      return availableOrgKeys.has(`${s.organization_id}_${s.scenario_master_id}`)
    })
    .map(s => {
      const org = s.organizations as { slug?: string; name?: string } | null
      const rawStoreIds: string[] = s.available_stores || []
      // available_stores が空 = その組織の全店舗対応
      const storeIds = rawStoreIds.length > 0
        ? rawStoreIds
        : (orgToStoreIdsMap.get(s.organization_id) || [])
      const storeNames = storeIds
        .map((storeId: string) => storeMap.get(storeId))
        .filter((name: string | undefined): name is string => !!name)
      return {
        ...s,
        // 「¥N〜」は日付・時間帯の料金の最安（作品ページ・トップと同じ。点検 F05）
        participation_fee: s.participation_fee != null ? referenceMinFee(s.participation_fee, s.participation_costs as ParticipationCost[] | null) : s.participation_fee,
        genre: s.genre || [],
        organization_slug: org?.slug || '',
        organization_name: org?.name || '',
        available_stores: storeNames,
        available_store_ids: storeIds,
      }
    })

  // scenario_master_id で重複排除（同シナリオが複数組織にある場合は1件に統合）
  const seenMasterIds = new Map<string, typeof mapped[number]>()
  const filteredScenarios = mapped.filter(s => {
    const key = s.scenario_master_id || s.id
    if (seenMasterIds.has(key)) {
      // 既存エントリに店舗を追加・最安値価格に更新
      const existing = seenMasterIds.get(key)!
      const mergedStores = [...new Set([...existing.available_stores, ...s.available_stores])]
      const minPrice = Math.min(
        existing.participation_fee ?? Infinity,
        s.participation_fee ?? Infinity
      )
      seenMasterIds.set(key, {
        ...existing,
        available_stores: mergedStores,
        participation_fee: isFinite(minPrice) ? minPrice : existing.participation_fee,
        // key_visual_urlは最初の非nullを優先（既存が既に入っている）
      })
      return false
    }
    seenMasterIds.set(key, s)
    return true
  }).map(s => seenMasterIds.get(s.scenario_master_id || s.id) ?? s)

  // 「新作」チップの対象と基準日（全体トップと同じ newArrivalBasis。一般のカタログの対象とは別に、取得したすべての行から決める）
  const newArrivalScope = {
    publicKeys: newArrivalPublicKeys(availableKeys, !!keysError),
    activeOrganizationIds: new Set((scenariosResult.data || [])
      .filter((s) => !!(s.organizations as { slug?: string } | null)?.slug && !!s.organization_id)
      .map((s) => s.organization_id as string)),
    organizationId: null,
  }
  const rowsByMaster = new Map<string, NonNullable<typeof scenariosResult.data>>()
  for (const s of scenariosResult.data || []) {
    const key = s.scenario_master_id || s.id
    rowsByMaster.set(key, [...(rowsByMaster.get(key) ?? []), s])
  }
  const scenariosWithNewArrival = filteredScenarios.map((s) => {
    const basis = newArrivalBasis(rowsByMaster.get(s.scenario_master_id || s.id) ?? [], newArrivalScope)
    return { ...s, listed_at: basis.listed_at, new_arrival_target: basis.target }
  })
  
  // 店舗データに組織名を補完（RPCから取得できない場合のフォールバック）
  const storesWithOrgName = (storesResult.data || []).map((store: any) => ({
    ...store,
    organization_name: store.organization_name || orgNameMap.get(store.organization_id) || ''
  }))
  
  return {
    scenarios: scenariosWithNewArrival,
    categories: categoriesResult.data || [],
    stores: storesWithOrgName
  }
}

export function PlatformScenarioSearch() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  // React Queryでデータ取得（キャッシュ活用）
  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ['scenario-search'],
    queryFn: fetchScenarioSearchData,
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
    gcTime: 10 * 60 * 1000, // 10分間メモリ保持
  })
  
  const scenarios = useMemo(() => data?.scenarios || [], [data])
  const categories = useMemo(() => data?.categories || [], [data])
  const allStores = useMemo(() => data?.stores || [], [data])

  // isPending: 初回未取得のみ。キャッシュ再利用時はグリッドを消さず isFetching でスクロール保存を抑制する
  useReportRouteScrollRestoration('platform-scenario-search', {
    isLoading: isPending,
    isFetching,
  })

  // フィルター状態（URLパラメータと同期）
  const searchTerm = searchParams.get('q') || ''
  /** カテゴリ複数: `genre=A&genre=B`（単一 `genre=X` も getAll で配列になる） */
  const selectedCategories = useMemo(
    () => [...new Set(searchParams.getAll('genre').filter(Boolean))],
    [searchParams]
  )
  const selectedDuration = searchParams.get('duration') || 'all'
  const selectedPlayerCount = searchParams.get('players') || 'all'
  const selectedStore = searchParams.get('store') || 'all'
  
  // フィルターパネルの表示状態（URLパラメータがあれば初期表示）
  const [showFilters, setShowFilters] = useState(() => {
    const sp = new URLSearchParams(window.location.search)
    return (
      sp.getAll('genre').length > 0 ||
      sp.has('duration') ||
      sp.has('players') ||
      sp.has('store')
    )
  })
  
  // 検索入力用ローカルstate（IME対応）
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm)
  // IME composing 中かどうか
  const [isComposing, setIsComposing] = useState(false)
  
  // URLパラメータが外部から変更された場合に同期
  useEffect(() => {
    setLocalSearchTerm(searchTerm)
  }, [searchTerm])
  
  const { isFavorite, toggleFavorite } = useFavorites()

  // フィルター更新関数
  const updateFilter = useCallback((key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (value === 'all' || value === '') {
      newParams.delete(key)
    } else {
      newParams.set(key, value)
    }
    setSearchParams(newParams, { replace: true })
  }, [searchParams, setSearchParams])

  const setSearchTerm = useCallback((value: string) => updateFilter('q', value), [updateFilter])
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
  const setSelectedDuration = useCallback((value: string) => updateFilter('duration', value), [updateFilter])
  const setSelectedPlayerCount = useCallback((value: string) => updateFilter('players', value), [updateFilter])
  const setSelectedStore = useCallback((value: string) => updateFilter('store', value), [updateFilter])

  // カテゴリ一覧（organization_categoriesから取得）
  const genres = useMemo(() => {
    return categories.map(c => c.name)
  }, [categories])
  // チップ・カテゴリの選択肢: 先頭に「新作」（90 日の判定。ジャンルの「新作」とは重ねない）、続けて既存のカテゴリ
  const chipGenres = useMemo(() => [NEW_ARRIVAL_CHIP, ...genres.filter((g) => g !== NEW_ARRIVAL_CHIP)], [genres])
  // 新作の判定（トップの新作一覧と同じ関数）。今日は JST
  const today = todayJst(new Date())
  const newDateById = useMemo(() => new Map(scenarios.map((s) => [s.id, newArrivalDateIfTarget({ new_arrival_target: s.new_arrival_target, release_date: s.release_date ?? null, listed_at: s.listed_at ?? null }, today)])), [scenarios, today])

  // 地域から抽出するヘルパー関数
  const extractRegionFromAddress = (address?: string): string => {
    if (!address) return 'その他'
    const match = address.match(/^(東京都|大阪府|京都府|北海道|.{2,3}県)/)
    return match ? match[1] : 'その他'
  }

  // オフィスと臨時会場を除外した店舗一覧
  const filteredStores = useMemo(() => {
    return allStores.filter((s: StoreData) => {
      const name = s.short_name || s.name || ''
      const isOffice = s.ownership_type === 'office' || name.includes('オフィス')
      const isTemporary = s.ownership_type === 'temporary' || name.includes('臨時')
      return !isOffice && !isTemporary
    })
  }, [allStores])

  // 地域ごとにグループ化した店舗（display_orderでソート）
  const storesByRegion = useMemo(() => {
    const groups = new Map<string, StoreData[]>()
    // display_orderでソート
    const sortedStores = [...filteredStores].sort((a, b) => 
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
  }, [filteredStores])

  // 実際に存在する所要時間の選択肢を動的生成
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

  // フィルタリング
  const filteredScenarios = useMemo(() => {
    return scenarios.filter(scenario => {
      // 検索
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matchTitle = (scenario.title ?? '').toLowerCase().includes(term)
        const matchAuthor = scenario.author?.toLowerCase().includes(term)
        const matchGenre = scenario.genre?.some(g => g.toLowerCase().includes(term))
        const matchOrg = scenario.organization_name?.toLowerCase().includes(term)
        if (!matchTitle && !matchAuthor && !matchGenre && !matchOrg) return false
      }
      
      // カテゴリフィルター（複数選択時はいずれかを含む）。「新作」のチップは 90 日の判定
      if (!matchesCategoryChips(scenario.genre, selectedCategories, !!newDateById.get(scenario.id))) return false
      
      // 所要時間フィルター（完全一致）
      if (selectedDuration !== 'all') {
        if (scenario.duration !== parseInt(selectedDuration)) return false
      }
      
      // プレイ人数フィルター
      if (selectedPlayerCount !== 'all') {
        const count = parseInt(selectedPlayerCount)
        if (count < scenario.player_count_min || count > scenario.player_count_max) return false
      }
      
      // 店舗フィルター
      // available_store_ids が空 = その組織の全店舗対応 → どの店舗でもマッチ
      if (selectedStore !== 'all') {
        const ids = scenario.available_store_ids
        if (ids && ids.length > 0 && !ids.includes(selectedStore)) return false
      }
      
      return true
    })
  }, [scenarios, searchTerm, selectedCategories, selectedDuration, selectedPlayerCount, selectedStore, newDateById])
  // 「新作」を選んでいるときは、新作をトップと同じ並び（基準日の新しい順）で先に
  const sortedScenarios = useMemo(
    () => sortCatalogForNewArrivals(filteredScenarios, selectedCategories, (s) => newDateById.get(s.id) ?? null),
    [filteredScenarios, selectedCategories, newDateById],
  )

  // 「‹」は前の画面へ（履歴が無いときはトップ）
  const handleBack = useCallback(() => {
    if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1)
    else navigate('/')
  }, [navigate])

  const handleCardClick = useCallback((scenarioSlug: string) => {
    saveScrollPositionForCurrentUrl()
    navigate(`/scenario/${scenarioSlug}`)
  }, [navigate])

  const handleToggleFavorite = useCallback((scenarioId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }, [toggleFavorite])

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('q')
    next.delete('genre')
    next.delete('duration')
    next.delete('players')
    next.delete('store')
    setSearchParams(next, { replace: true })
    setLocalSearchTerm('')
  }, [searchParams, setSearchParams])

  const hasActiveFilters =
    searchTerm ||
    selectedCategories.length > 0 ||
    selectedDuration !== 'all' ||
    selectedPlayerCount !== 'all' ||
    selectedStore !== 'all'

  const { isPlayed } = usePlayedScenarios()
  const setCategories = useCallback((list: string[]) => {
    const next = new URLSearchParams(searchParams)
    next.delete('genre')
    ;[...new Set(list)].sort().forEach((g) => next.append('genre', g))
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])
  const items = useMemo<CatalogItem[]>(() => sortedScenarios.map((sc) => ({
    id: sc.id,
    key: sc.slug || sc.org_scenario_id || sc.id,
    title: sc.title ?? '',
    key_visual_url: sc.key_visual_url,
    player_count_min: sc.player_count_min,
    player_count_max: sc.player_count_max,
    duration: sc.duration,
    sortDate: newDateById.get(sc.id)?.date ?? sc.release_date ?? sc.listed_at ?? null,
  })), [sortedScenarios, newDateById])

  // 刷新（QW-20261114-001、Figma プロトタイプ「作品一覧（MMQ全国）」）: 見た目は組織カタログと共通の CatalogView
  return (
    <div className="booking-shell min-h-screen overflow-x-clip bg-[#f7f6f3]">
      <Header />
      <CatalogView
        scopeLabel="全国の"
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

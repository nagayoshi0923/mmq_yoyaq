import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { scenarioApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useFavorites } from '@/hooks/useFavorites'
import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Search, ArrowLeft, Clock, Users, Heart, X, Filter, Sparkles, BookOpen, Check } from 'lucide-react'
import { logger } from '@/utils/logger'

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

export function ScenarioCatalog({ organizationSlug }: ScenarioCatalogProps) {
  const { user } = useAuth()
  const { organization } = useOrganization()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  // 予約サイトのベースパス（propsから優先、なければorganizationから）
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : (organization?.slug ? `/${organization.slug}` : '/queens-waltz')
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined
  
  const [scenarios, setScenarios] = useState<ScenarioData[]>([])
  const [stores, setStores] = useState<StoreData[]>([])
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  // URLパラメータからジャンルを読み取り
  const [selectedGenre, setSelectedGenre] = useState<string>(() => {
    const genreParam = searchParams.get('genre')
    return genreParam || 'all'
  })
  const [selectedDuration, setSelectedDuration] = useState<string>('all')
  const [selectedPlayerCount, setSelectedPlayerCount] = useState<string>('all')
  const [selectedStore, setSelectedStore] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(() => {
    // URLにジャンルパラメータがあればフィルターを表示
    return !!searchParams.get('genre')
  })
  
  const { isFavorite, toggleFavorite } = useFavorites()
  const { isPlayed } = usePlayedScenarios()

  // ジャンル変更時にURLを更新
  useEffect(() => {
    if (selectedGenre === 'all') {
      searchParams.delete('genre')
    } else {
      searchParams.set('genre', selectedGenre)
    }
    setSearchParams(searchParams, { replace: true })
  }, [selectedGenre, searchParams, setSearchParams])

  // データ取得
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        setIsLoading(true)
        
        // シナリオ、公開リスト、店舗、カテゴリを並列取得
        const [data, availableKeysResult, storesResult, categoriesResult] = await Promise.all([
          scenarioApi.getAll(),
          // 🔐 公開中かつ承認済みのシナリオキーを取得（RPC: RLSバイパス、匿名OK）
          supabase.rpc('get_public_available_scenario_keys'),
          // 店舗データを取得
          supabase.from('stores').select('id, name, short_name'),
          // カテゴリ（ジャンル）を取得
          supabase.from('organization_categories').select('id, name, sort_order').order('sort_order')
        ])
        
        // 店舗データをセット
        if (storesResult.data) {
          setStores(storesResult.data)
        }
        
        // カテゴリデータをセット
        if (categoriesResult.data) {
          setCategories(categoriesResult.data)
        }
        
        // 店舗IDから名前へのマップを作成
        const storeMap = new Map<string, string>()
        ;(storesResult.data || []).forEach((store: StoreData) => {
          storeMap.set(store.id, store.short_name || store.name)
        })
        
        // 公開中の組織シナリオのキーセット
        const keysData = availableKeysResult.data || []
        const availableOrgKeys = new Set(
          keysData.map((k: any) => `${k.organization_id}_${k.scenario_master_id}`)
        )
        
        // RPCエラーまたはデータ0件の場合はフィルタをスキップ
        const shouldFilter = !availableKeysResult.error && keysData.length > 0
        
        // 組織で公開されているシナリオのみ表示（available + coming_soon）
        const availableScenarios = data.filter((s: any) => {
          if (!shouldFilter) {
            // RPC失敗時のフォールバック: status='available' のみ
            return s.status === 'available'
          }
          // scenario_master_idがない場合はstatus='available'のみ通す
          if (!s.scenario_master_id) return s.status === 'available'
          // 公開中・近日公開の組織シナリオに含まれているもののみ表示
          return availableOrgKeys.has(`${s.organization_id}_${s.scenario_master_id}`)
        }).map((s: any) => ({
          ...s,
          // available_storesのIDを店舗名に変換
          available_stores: (s.available_stores || [])
            .map((storeId: string) => storeMap.get(storeId))
            .filter((name: string | undefined): name is string => !!name)
        }))
        setScenarios(availableScenarios as unknown as ScenarioData[])
      } catch (error) {
        logger.error('シナリオ取得エラー:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadScenarios()
  }, [])

  // ジャンル一覧（organization_categoriesから取得）
  const genres = useMemo(() => {
    return categories.map(c => c.name)
  }, [categories])

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
      
      // ジャンルフィルター
      if (selectedGenre !== 'all') {
        if (!scenario.genre?.includes(selectedGenre)) return false
      }
      
      // 所要時間フィルター
      if (selectedDuration !== 'all') {
        const duration = scenario.duration
        const maxDuration = parseInt(selectedDuration)
        if (selectedDuration === '901') {
          // 15時間以上
          if (duration < 900) return false
        } else {
          // 指定時間以下
          if (duration > maxDuration) return false
        }
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
  }, [scenarios, searchTerm, selectedGenre, selectedDuration, selectedPlayerCount, selectedStore, stores])

  const handleBack = useCallback(() => {
    window.location.href = bookingBasePath
  }, [bookingBasePath])

  const handleCardClick = useCallback((scenarioId: string) => {
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
    setSelectedGenre('all')
    setSelectedDuration('all')
    setSelectedPlayerCount('all')
    setSelectedStore('all')
  }, [])

  const hasActiveFilters = searchTerm || selectedGenre !== 'all' || selectedDuration !== 'all' || selectedPlayerCount !== 'all' || selectedStore !== 'all'

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
                placeholder="タイトル、作者、ジャンルで検索..."
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
                variant={selectedGenre === 'all' ? "default" : "outline"}
                className={`cursor-pointer text-xs px-2 py-1 transition-all ${
                  selectedGenre === 'all' 
                    ? 'bg-gray-900 text-white hover:bg-gray-800' 
                    : 'hover:bg-gray-100'
                }`}
                onClick={() => setSelectedGenre('all')}
              >
                すべて
              </Badge>
              {genres.slice(0, 10).map((genre) => (
                <Badge
                  key={genre}
                  variant={selectedGenre === genre ? "default" : "outline"}
                  className={`cursor-pointer text-xs px-2 py-1 transition-all whitespace-nowrap ${
                    selectedGenre === genre 
                      ? 'bg-gray-900 text-white hover:bg-gray-800' 
                      : 'hover:bg-gray-100'
                  }`}
                  onClick={() => setSelectedGenre(genre)}
                >
                  {genre}
                </Badge>
              ))}
            </div>
          )}
          
          {/* フィルターパネル */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="ジャンル" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべてのジャンル</SelectItem>
                  {genres.map(genre => (
                    <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="所要時間" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての時間</SelectItem>
                  <SelectItem value="60">〜1時間</SelectItem>
                  <SelectItem value="90">〜1.5時間</SelectItem>
                  <SelectItem value="120">〜2時間</SelectItem>
                  <SelectItem value="150">〜2.5時間</SelectItem>
                  <SelectItem value="180">〜3時間</SelectItem>
                  <SelectItem value="210">〜3.5時間</SelectItem>
                  <SelectItem value="240">〜4時間</SelectItem>
                  <SelectItem value="270">〜4.5時間</SelectItem>
                  <SelectItem value="300">〜5時間</SelectItem>
                  <SelectItem value="360">〜6時間</SelectItem>
                  <SelectItem value="420">〜7時間</SelectItem>
                  <SelectItem value="480">〜8時間</SelectItem>
                  <SelectItem value="540">〜9時間</SelectItem>
                  <SelectItem value="600">〜10時間</SelectItem>
                  <SelectItem value="720">〜12時間</SelectItem>
                  <SelectItem value="900">〜15時間</SelectItem>
                  <SelectItem value="901">15時間〜</SelectItem>
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
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id}>{store.short_name || store.name}</SelectItem>
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

        {isLoading ? (
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
                    {/* 体験済みマーク */}
                    {isPlayed(scenario.id) && (
                      <div className="absolute top-1 right-1 bg-green-500 rounded-full p-1 shadow-md" title="体験済み">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>

                  {/* コンテンツ */}
                  <div className="p-2 sm:p-3 flex-1 min-w-0">
                    {/* 著者 + お気に入りボタン */}
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-gray-500">{scenario.author}</p>
                      <button
                        onClick={(e) => handleToggleFavorite(scenario.id, e)}
                        className="flex-shrink-0 p-1 transition-colors hover:bg-red-50 rounded"
                      >
                        <Heart className={`h-4 w-4 fill-current text-red-500 ${
                          isFavorite(scenario.id) ? 'opacity-100' : 'opacity-30 hover:opacity-50'
                        }`} />
                      </button>
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

                    {/* ジャンル - クリックでフィルタリング */}
                    {scenario.genre && scenario.genre.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {scenario.genre.slice(0, 3).map((genre, idx) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="text-xs px-1.5 py-0.5 h-5 font-normal bg-gray-100 border-0 cursor-pointer hover:bg-gray-200 hover:scale-105 transition-all"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedGenre(genre)
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

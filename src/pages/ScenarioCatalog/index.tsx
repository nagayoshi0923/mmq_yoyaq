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
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Search, ArrowLeft, Clock, Users, Heart, X, Filter, Sparkles, BookOpen } from 'lucide-react'
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
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  // URLパラメータからジャンルを読み取り
  const [selectedGenre, setSelectedGenre] = useState<string>(() => {
    const genreParam = searchParams.get('genre')
    return genreParam || 'all'
  })
  const [selectedDuration, setSelectedDuration] = useState<string>('all')
  const [selectedPlayerCount, setSelectedPlayerCount] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(() => {
    // URLにジャンルパラメータがあればフィルターを表示
    return !!searchParams.get('genre')
  })
  
  const { isFavorite, toggleFavorite } = useFavorites()

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
        
        // シナリオと公開リストを並列取得
        const [data, availableKeysResult] = await Promise.all([
          scenarioApi.getAll(),
          // 🔐 公開中かつ承認済みのシナリオキーを取得（RPC: RLSバイパス、匿名OK）
          supabase.rpc('get_public_available_scenario_keys')
        ])
        
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
        })
        setScenarios(availableScenarios as unknown as ScenarioData[])
      } catch (error) {
        logger.error('シナリオ取得エラー:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadScenarios()
  }, [])

  // ジャンル一覧を取得
  const genres = useMemo(() => {
    const genreSet = new Set<string>()
    scenarios.forEach(s => {
      if (s.genre) {
        s.genre.forEach(g => genreSet.add(g))
      }
    })
    return Array.from(genreSet).sort()
  }, [scenarios])

  // フィルタリング
  const filteredScenarios = useMemo(() => {
    return scenarios.filter(scenario => {
      // 検索
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matchTitle = scenario.title.toLowerCase().includes(term)
        const matchAuthor = scenario.author?.toLowerCase().includes(term)
        const matchGenre = scenario.genre?.some(g => g.toLowerCase().includes(term))
        if (!matchTitle && !matchAuthor && !matchGenre) return false
      }
      
      // ジャンルフィルター
      if (selectedGenre !== 'all') {
        if (!scenario.genre?.includes(selectedGenre)) return false
      }
      
      // 所要時間フィルター
      if (selectedDuration !== 'all') {
        const duration = scenario.duration
        if (selectedDuration === 'short' && duration > 120) return false
        if (selectedDuration === 'medium' && (duration <= 120 || duration > 180)) return false
        if (selectedDuration === 'long' && duration <= 180) return false
      }
      
      // プレイ人数フィルター
      if (selectedPlayerCount !== 'all') {
        const count = parseInt(selectedPlayerCount)
        if (count < scenario.player_count_min || count > scenario.player_count_max) return false
      }
      
      return true
    })
  }, [scenarios, searchTerm, selectedGenre, selectedDuration, selectedPlayerCount])

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
  }, [])

  const hasActiveFilters = searchTerm || selectedGenre !== 'all' || selectedDuration !== 'all' || selectedPlayerCount !== 'all'

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
          
          {/* フィルターパネル（所要時間・プレイ人数のみ。ジャンルは上のバッジで選択） */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="所要時間" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての時間</SelectItem>
                  <SelectItem value="short">〜2時間</SelectItem>
                  <SelectItem value="medium">2〜3時間</SelectItem>
                  <SelectItem value="long">3時間〜</SelectItem>
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
                  <div className="relative w-32 md:w-full aspect-[3/4] overflow-hidden bg-gray-100 flex-shrink-0">
                    {scenario.key_visual_url ? (
                      <img
                        src={scenario.key_visual_url}
                        alt={scenario.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                    {/* 人気タグ（最初のカードのみ） */}
                    {index === 0 && (
                      <div 
                        className="absolute bottom-0 left-0 px-3 py-1 text-xs font-bold text-black"
                        style={{ backgroundColor: THEME.accent }}
                      >
                        人気
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

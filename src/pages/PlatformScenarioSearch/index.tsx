/**
 * MMQ シナリオ検索ページ
 * @path /scenario
 * @purpose 全組織のシナリオを検索・フィルター
 */
import { useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { supabase } from '@/lib/supabase'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Search, ArrowLeft, Clock, Users, Heart, X, Filter, Sparkles, BookOpen, Building2 } from 'lucide-react'

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
}

/**
 * シナリオ検索データを取得する関数
 * React Queryでキャッシュされる
 */
async function fetchScenarioSearchData(): Promise<ScenarioData[]> {
  // 🚀 並列取得: RPCとシナリオデータを同時に取得
  const [keysResult, scenariosResult] = await Promise.all([
    supabase.rpc('get_public_available_scenario_keys'),
    supabase
      .from('scenarios')
      .select(`
        id, slug, title, author, key_visual_url,
        duration, player_count_min, player_count_max,
        genre, participation_fee, difficulty, release_date,
        organization_id, status, scenario_master_id,
        organizations:organization_id (slug, name)
      `)
      .in('status', ['available', 'unavailable'])
      .order('title')
  ])

  const availableKeys = keysResult.data || []
  const keysError = keysResult.error
  
  // 公開中の組織シナリオのキーセット
  const availableOrgKeys = new Set(
    availableKeys.map((k: any) => `${k.organization_id}_${k.scenario_master_id}`)
  )
  
  const shouldFilterByOrgStatus = !keysError && availableKeys.length > 0

  if (scenariosResult.error) throw scenariosResult.error

  // 組織の公開ステータスで絞り込み
  return (scenariosResult.data || [])
    .filter(s => {
      if (!shouldFilterByOrgStatus) {
        return s.status === 'available'
      }
      if (!s.scenario_master_id) return s.status === 'available'
      return availableOrgKeys.has(`${s.organization_id}_${s.scenario_master_id}`)
    })
    .map(s => {
      const org = s.organizations as { slug?: string; name?: string } | null
      return {
        ...s,
        genre: s.genre || [],
        organization_slug: org?.slug || '',
        organization_name: org?.name || '',
      }
    })
}

export function PlatformScenarioSearch() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  // React Queryでデータ取得（キャッシュ活用）
  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ['scenario-search'],
    queryFn: fetchScenarioSearchData,
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
    gcTime: 10 * 60 * 1000, // 10分間メモリ保持
  })

  // フィルター状態（URLパラメータと同期）
  const searchTerm = searchParams.get('q') || ''
  const selectedGenre = searchParams.get('genre') || 'all'
  const selectedDuration = searchParams.get('duration') || 'all'
  const selectedPlayerCount = searchParams.get('players') || 'all'
  const selectedOrganization = searchParams.get('org') || 'all'
  
  // フィルターパネルの表示状態（URLパラメータがあれば初期表示）
  const [showFilters, setShowFilters] = useState(() => {
    return searchParams.has('genre') || searchParams.has('duration') || searchParams.has('players') || searchParams.has('org')
  })
  
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
  const setSelectedGenre = useCallback((value: string) => updateFilter('genre', value), [updateFilter])
  const setSelectedDuration = useCallback((value: string) => updateFilter('duration', value), [updateFilter])
  const setSelectedPlayerCount = useCallback((value: string) => updateFilter('players', value), [updateFilter])
  const setSelectedOrganization = useCallback((value: string) => updateFilter('org', value), [updateFilter])

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

  // 組織一覧を取得
  const organizations = useMemo(() => {
    const orgMap = new Map<string, string>()
    scenarios.forEach(s => {
      if (s.organization_id && s.organization_name) {
        orgMap.set(s.organization_id, s.organization_name)
      }
    })
    return Array.from(orgMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
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
        const matchOrg = scenario.organization_name?.toLowerCase().includes(term)
        if (!matchTitle && !matchAuthor && !matchGenre && !matchOrg) return false
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
      
      // 組織フィルター
      if (selectedOrganization !== 'all') {
        if (scenario.organization_id !== selectedOrganization) return false
      }
      
      return true
    })
  }, [scenarios, searchTerm, selectedGenre, selectedDuration, selectedPlayerCount, selectedOrganization])

  const handleBack = useCallback(() => {
    navigate('/')
  }, [navigate])

  const handleCardClick = useCallback((scenarioSlug: string) => {
    navigate(`/scenario/${scenarioSlug}`)
  }, [navigate])

  const handleToggleFavorite = useCallback((scenarioId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }, [toggleFavorite])

  const clearFilters = useCallback(() => {
    setSearchTerm('')
    setSelectedGenre('all')
    setSelectedDuration('all')
    setSelectedPlayerCount('all')
    setSelectedOrganization('all')
  }, [])

  const hasActiveFilters = searchTerm || selectedGenre !== 'all' || selectedDuration !== 'all' || selectedPlayerCount !== 'all' || selectedOrganization !== 'all'

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: THEME.background }}>
      <Header />

      {/* ヒーローセクション */}
      <section 
        className="relative overflow-hidden"
        style={{ backgroundColor: THEME.primary }}
      >
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
              <div 
                className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium mb-1"
                style={{ backgroundColor: THEME.accent, color: '#000' }}
              >
                <BookOpen className="w-2.5 h-2.5" />
                SCENARIO SEARCH
              </div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight">シナリオを探す</h1>
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
                placeholder="タイトル、作者、ジャンル、店舗名で検索..."
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
              
              <Select value={selectedOrganization} onValueChange={setSelectedOrganization}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="店舗" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての店舗</SelectItem>
                  {organizations.map(org => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* 結果表示 */}
      <div className="container mx-auto max-w-7xl px-4 py-4 flex-1">
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
                    {/* 店舗名 + お気に入りボタン */}
                    <div className="flex items-center justify-between mb-1">
                      {scenario.organization_name && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span className="truncate">{scenario.organization_name}</span>
                        </div>
                      )}
                      {user && (
                        <button
                          onClick={(e) => handleToggleFavorite(scenario.id, e)}
                          className="flex-shrink-0 p-1 transition-colors hover:bg-red-50 rounded"
                        >
                          <Heart className={`h-4 w-4 fill-current text-red-500 ${
                            isFavorite(scenario.id) ? 'opacity-100' : 'opacity-30 hover:opacity-50'
                          }`} />
                        </button>
                      )}
                    </div>
                    
                    {/* 著者 */}
                    <p className="text-xs text-gray-500 mb-1">{scenario.author}</p>
                    
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

                    {/* ジャンル */}
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

      <Footer />
    </div>
  )
}

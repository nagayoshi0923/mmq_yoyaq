import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { scenarioApi } from '@/lib/api'
import { useFavorites } from '@/hooks/useFavorites'
import { Search, ArrowLeft, Clock, Users, Heart, X, Filter } from 'lucide-react'
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
  
  // 予約サイトのベースパス（propsから優先、なければorganizationから）
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : (organization?.slug ? `/${organization.slug}` : '/queens-waltz')
  const shouldShowNavigation = user && user.role !== 'customer' && user.role !== undefined
  
  const [scenarios, setScenarios] = useState<ScenarioData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedGenre, setSelectedGenre] = useState<string>('all')
  const [selectedDuration, setSelectedDuration] = useState<string>('all')
  const [selectedPlayerCount, setSelectedPlayerCount] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  
  const { isFavorite, toggleFavorite } = useFavorites()

  // データ取得
  useEffect(() => {
    const loadScenarios = async () => {
      try {
        setIsLoading(true)
        const data = await scenarioApi.getAll()
        // status='available'のシナリオのみ表示
        const availableScenarios = data.filter((s: any) => s.status === 'available')
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header />
      {shouldShowNavigation && (
        <NavigationBar currentPage={bookingBasePath} />
      )}

      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white">
        <div className="container mx-auto max-w-7xl px-[10px] py-4 md:py-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="text-white hover:bg-white/20 -ml-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-medium">シナリオカタログ</h1>
              <p className="text-sm text-purple-200">全{scenarios.length}タイトル</p>
            </div>
          </div>
        </div>
      </div>

      {/* 検索・フィルター */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-[10px] py-3">
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
          
          {/* フィルターパネル */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            </div>
          )}
        </div>
      </div>

      {/* 結果表示 */}
      <div className="container mx-auto max-w-7xl px-[10px] py-4">
        {hasActiveFilters && (
          <p className="text-sm text-muted-foreground mb-4">
            {filteredScenarios.length}件のシナリオが見つかりました
          </p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredScenarios.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">該当するシナリオが見つかりませんでした</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3">
            {filteredScenarios.map((scenario) => (
              <Card
                key={scenario.id}
                className="overflow-hidden cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => handleCardClick(scenario.slug || scenario.id)}
              >
                {/* キービジュアル */}
                <div className="relative w-full aspect-[1/1.4] bg-gray-900 overflow-hidden">
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
                        className="relative w-full h-full object-contain"
                        loading="lazy"
                      />
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <span className="text-xs">No Image</span>
                    </div>
                  )}
                  
                  {/* お気に入りボタン */}
                  <button
                    onClick={(e) => handleToggleFavorite(scenario.id, e)}
                    className={`absolute top-2 right-2 transition-all opacity-70 hover:opacity-100 ${
                      isFavorite(scenario.id) ? 'text-green-500' : 'text-gray-400 hover:text-green-500'
                    }`}
                  >
                    <Heart className={`h-5 w-5 ${isFavorite(scenario.id) ? 'fill-current' : ''}`} />
                  </button>
                </div>

                <CardContent className="p-2 sm:p-2.5 md:p-3 space-y-0.5 sm:space-y-1 bg-white">
                  {/* 著者 */}
                  <p className="text-xs text-gray-500">{scenario.author}</p>
                  
                  {/* タイトル */}
                  <h3 className="text-sm sm:text-base truncate mt-0.5 sm:mt-1">{scenario.title}</h3>
                  
                  {/* 人数・時間・参加費 */}
                  <div className="flex items-center gap-1 sm:gap-1 text-xs text-gray-600 mt-0.5 sm:mt-0.5">
                    <div className="flex items-center gap-0.5">
                      <Users className="h-3 w-3" />
                      <span>
                        {scenario.player_count_min === scenario.player_count_max
                          ? `${scenario.player_count_max}人`
                          : `${scenario.player_count_min}~${scenario.player_count_max}人`}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      <span>{scenario.duration}分</span>
                    </div>
                    {scenario.participation_fee && (
                      <div className="flex items-center gap-0.5 sm:gap-1">
                        <span>¥{scenario.participation_fee.toLocaleString()}〜</span>
                      </div>
                    )}
                  </div>

                  {/* ジャンル */}
                  {scenario.genre && scenario.genre.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 sm:mt-1.5">
                      {scenario.genre.slice(0, 3).map((genre, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="text-xs px-1 sm:px-1.5 py-0.5 h-4 sm:h-5 font-normal bg-gray-100 border-0 rounded-[2px]"
                        >
                          {genre}
                        </Badge>
                      ))}
                      {scenario.genre.length > 3 && (
                        <Badge
                          variant="secondary"
                          className="text-xs px-1 sm:px-1.5 py-0.5 h-4 sm:h-5 font-normal bg-gray-100 border-0 rounded-[2px]"
                        >
                          +{scenario.genre.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


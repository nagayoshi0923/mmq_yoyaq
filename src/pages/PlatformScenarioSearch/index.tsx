import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Input } from '@/components/ui/input'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { Search, Users, Clock, ChevronRight, Heart, Building2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'

interface Scenario {
  id: string
  title: string
  slug: string
  key_visual_url: string | null
  player_count_min: number
  player_count_max: number
  duration: number
  difficulty?: number
  price_per_person?: number
  organization_id: string
  organization_slug?: string
  organization_name?: string
}

export function PlatformScenarioSearch() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { favorites, toggleFavorite } = useFavorites()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchScenarios()
  }, [])

  const fetchScenarios = async () => {
    try {
      setLoading(true)
      
      // 全組織の公開シナリオを取得
      const { data, error } = await supabase
        .from('scenarios')
        .select(`
          id, title, slug, key_visual_url,
          player_count_min, player_count_max, duration, difficulty, price_per_person,
          organization_id,
          organizations:organization_id (slug, display_name)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedScenarios = (data || []).map(s => {
         
        const org = s.organizations as any
        return {
          ...s,
          organization_slug: org?.slug || '',
          organization_name: org?.display_name || '',
        }
      })

      setScenarios(formattedScenarios)
    } catch (error) {
      logger.error('シナリオ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 検索フィルター
  const filteredScenarios = useMemo(() => {
    if (!searchQuery.trim()) return scenarios
    const query = searchQuery.toLowerCase()
    return scenarios.filter(s => 
      s.title.toLowerCase().includes(query) ||
      s.organization_name?.toLowerCase().includes(query)
    )
  }, [scenarios, searchQuery])

  // 組織ごとにグループ化
  const scenariosByOrg = useMemo(() => {
    const grouped: Record<string, { orgName: string, orgSlug: string, scenarios: Scenario[] }> = {}
    filteredScenarios.forEach(s => {
      const key = s.organization_slug || 'unknown'
      if (!grouped[key]) {
        grouped[key] = {
          orgName: s.organization_name || '不明な組織',
          orgSlug: s.organization_slug || '',
          scenarios: []
        }
      }
      grouped[key].scenarios.push(s)
    })
    return Object.values(grouped)
  }, [filteredScenarios])

  const handleScenarioClick = (scenario: Scenario) => {
    if (scenario.organization_slug && scenario.slug) {
      navigate(`/${scenario.organization_slug}/scenario/${scenario.slug}`)
    }
  }

  const handleFavoriteClick = (e: React.MouseEvent, scenarioId: string) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* ページヘッダー */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            シナリオを探す
          </h1>
          <p className="text-gray-600">
            全店舗で遊べるマーダーミステリーを検索
          </p>
        </div>

        {/* 検索バー */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder="シナリオ名や店舗名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 text-base rounded-full border-gray-200 focus:border-primary focus:ring-primary"
          />
        </div>

        {/* ローディング */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* シナリオ一覧 */}
        {!loading && scenariosByOrg.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            シナリオが見つかりませんでした
          </div>
        )}

        {!loading && scenariosByOrg.map(group => (
          <div key={group.orgSlug} className="mb-10">
            {/* 組織ヘッダー */}
            <div 
              className="flex items-center gap-2 mb-4 cursor-pointer hover:opacity-80"
              onClick={() => group.orgSlug && navigate(`/${group.orgSlug}`)}
            >
              <Building2 className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-800">{group.orgName}</h2>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>

            {/* シナリオカード */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {group.scenarios.map(scenario => (
                <div
                  key={scenario.id}
                  className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer group"
                  onClick={() => handleScenarioClick(scenario)}
                >
                  {/* 画像 */}
                  <div className="relative aspect-[3/4] bg-gray-100">
                    {scenario.key_visual_url ? (
                      <OptimizedImage
                        src={scenario.key_visual_url}
                        alt={scenario.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
                        <span className="text-4xl opacity-30">🎭</span>
                      </div>
                    )}
                    
                    {/* お気に入りボタン */}
                    {user && (
                      <button
                        onClick={(e) => handleFavoriteClick(e, scenario.id)}
                        className={`absolute top-2 right-2 p-2 rounded-full backdrop-blur-sm transition-colors ${
                          favorites.has(scenario.id) 
                            ? 'bg-red-500 text-white' 
                            : 'bg-white/80 text-gray-400 hover:text-red-500'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${favorites.has(scenario.id) ? 'fill-current' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* 情報 */}
                  <div className="p-3">
                    <h3 className="font-medium text-gray-900 text-sm line-clamp-2 mb-2">
                      {scenario.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {scenario.player_count_min}〜{scenario.player_count_max}人
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {Math.floor(scenario.duration / 60)}h
                      </span>
                    </div>
                    {scenario.price_per_person && (
                      <div className="mt-2 text-sm font-semibold text-primary">
                        ¥{scenario.price_per_person.toLocaleString()}/人
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}


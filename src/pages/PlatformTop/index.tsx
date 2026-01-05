/**
 * MMQ プラットフォームトップページ
 * @path /
 * @purpose 顧客向けトップページ - 任天堂風デザイン
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { OptimizedImage } from '@/components/ui/optimized-image'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { Search, ChevronRight, Users, Clock, Sparkles, Building2, Calendar, MapPin, Heart } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

interface Scenario {
  id: string
  title: string
  slug: string
  key_visual_url: string | null
  player_count_min: number
  player_count_max: number
  duration: number
  organization_slug?: string
  organization_name?: string
}

interface UpcomingEvent {
  id: string
  date: string
  time_slot: string
  scenario_id: string
  scenario_title: string
  scenario_slug: string
  scenario_key_visual: string | null
  store_name: string
  store_short_name: string
  organization_slug: string
  organization_name: string
  remaining_slots: number
  player_count_max: number
}

interface Organization {
  id: string
  slug: string
  display_name: string  // nameから変換
  logo_url?: string
}

export function PlatformTop() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { favorites, toggleFavorite } = useFavorites()
  const [featuredScenarios, setFeaturedScenarios] = useState<Scenario[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)

      // 組織一覧を先に取得（直近公演の組織情報に使用）
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, slug, name')
        .eq('is_active', true)
        .order('name')
      
      if (orgError) {
        console.error('組織取得エラー:', orgError)
      }

      const orgMap: Record<string, { slug: string, name: string }> = {}
      if (orgData) {
        orgData.forEach(o => {
          orgMap[o.id] = { slug: o.slug, name: o.name }
        })
        setOrganizations(orgData.map(o => ({ ...o, display_name: o.name })))
        console.log('🏢 組織データ:', orgData.length, '件', orgMap)
      } else {
        console.log('⚠️ 組織データなし')
      }

      // 直近公演を取得（今日以降、有効なシナリオのイベント）
      const today = new Date().toISOString().split('T')[0]
      console.log('📅 今日の日付:', today)
      const { data: eventData, error: eventError } = await supabase
        .from('schedule_events')
        .select(`
          id, date, time_slot, remaining_slots, current_participants,
          scenarios:scenario_id!inner (id, title, slug, key_visual_url, player_count_max, organization_id, status),
          stores:store_id (name, short_name)
        `)
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(30)

      console.log('📆 イベントデータ:', eventData?.length, '件', eventError ? `エラー: ${eventError.message}` : '')
      if (eventData && eventData.length > 0) {
        console.log('📆 最初のイベント:', eventData[0])
      }

      if (eventData) {
        const formatted: UpcomingEvent[] = eventData
          .filter(e => {
            const scenario = e.scenarios as any
            const store = e.stores as any
            // シナリオと店舗が存在し、組織に所属しているもののみ
            // status = 'available' のシナリオのみ（予約サイトと同じ条件）
            return scenario && store && 
                   scenario.organization_id && 
                   orgMap[scenario.organization_id] &&
                   scenario.status === 'available'
          })
          .slice(0, 12)
          .map(e => {
            const scenario = e.scenarios as any
            const store = e.stores as any
            const org = orgMap[scenario.organization_id] || { slug: '', name: '' }
            return {
              id: e.id,
              date: e.date,
              time_slot: e.time_slot,
              scenario_id: scenario.id,
              scenario_title: scenario.title,
              scenario_slug: scenario.slug,
              scenario_key_visual: scenario.key_visual_url,
              store_name: store.name,
              store_short_name: store.short_name || store.name,
              organization_slug: org.slug,
              organization_name: org.name,
              remaining_slots: e.remaining_slots || (scenario.player_count_max - (e.current_participants || 0)),
              player_count_max: scenario.player_count_max || 0,
            }
          })
        setUpcomingEvents(formatted)
      }

      // 新着シナリオ（最新8件、有効なシナリオのみ）
      // 予約サイトと同じ条件: status = 'available'
      const { data: scenarioData } = await supabase
        .from('scenarios')
        .select(`
          id, title, slug, key_visual_url,
          player_count_min, player_count_max, duration,
          organization_id
        `)
        .eq('status', 'available')
        .not('organization_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20)

      console.log('🎭 シナリオデータ:', scenarioData?.length, '件')
      if (scenarioData && scenarioData.length > 0) {
        console.log('🎭 最初のシナリオ:', scenarioData[0])
      }

      if (scenarioData) {
        // 組織に所属しているシナリオのみフィルター
        const formatted = scenarioData
          .filter(s => s.organization_id && orgMap[s.organization_id])
          .slice(0, 8)
          .map(s => {
            const org = orgMap[s.organization_id!] || { slug: '', name: '' }
            return {
              ...s,
              organization_slug: org.slug,
              organization_name: org.name,
            }
          })
        setFeaturedScenarios(formatted)
      }

    } catch (error) {
      logger.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 日付フォーマット
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`
  }

  const handleFavoriteClick = (e: React.MouseEvent, scenarioId: string) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: THEME.background }}>
      <Header />

      {/* ヒーローセクション - 任天堂風 */}
      <section 
        className="relative overflow-hidden"
        style={{ 
          background: `linear-gradient(135deg, ${THEME.gradientFrom} 0%, ${THEME.gradientTo} 100%)` 
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-12 md:py-20">
          <div className="text-center text-white">
            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              マーダーミステリーを<br className="md:hidden" />探そう
            </h1>
            <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
              様々な店舗のマーダーミステリーを検索・予約
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-white hover:bg-gray-100 rounded-full px-8 h-14 text-lg font-semibold shadow-lg"
                style={{ color: THEME.primary }}
                onClick={() => navigate('/scenario')}
              >
                <Search className="w-5 h-5 mr-2" />
                シナリオを探す
              </Button>
              {user ? (
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/50 text-white hover:bg-white/10 rounded-full px-8 h-14 text-lg"
                  onClick={() => navigate('/mypage')}
                >
                  マイページ
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/50 text-white hover:bg-white/10 rounded-full px-8 h-14 text-lg"
                  onClick={() => navigate('/login')}
                >
                  ログイン / 新規登録
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 直近公演 */}
      {upcomingEvents.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-6 h-6" style={{ color: THEME.primary }} />
              直近の公演
            </h2>
            <Button
              variant="ghost"
              className="text-gray-600 hover:text-gray-900"
              onClick={() => navigate('/scenario')}
            >
              もっと見る
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingEvents.slice(0, 6).map(event => (
              <div
                key={event.id}
                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer group"
                onClick={() => {
                  if (event.organization_slug && event.scenario_slug) {
                    navigate(`/${event.organization_slug}/scenario/${event.scenario_slug}`)
                  }
                }}
              >
                <div className="flex">
                  {/* 画像 */}
                  <div className="w-24 h-32 flex-shrink-0 bg-gray-100 relative overflow-hidden">
                    {event.scenario_key_visual ? (
                      <OptimizedImage
                        src={event.scenario_key_visual}
                        alt={event.scenario_title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
                        <span className="text-2xl opacity-30">🎭</span>
                      </div>
                    )}
                  </div>

                  {/* 情報 */}
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          className="text-xs px-2 py-0.5"
                          style={{ 
                            backgroundColor: THEME.primaryLight, 
                            color: THEME.primary 
                          }}
                        >
                          {formatDate(event.date)}
                        </Badge>
                        <span className="text-xs text-gray-500">{event.time_slot}</span>
                      </div>
                      <h3 className="font-medium text-gray-900 text-sm line-clamp-2 mb-1">
                        {event.scenario_title}
                      </h3>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {event.store_short_name}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500">
                        {event.organization_name}
                      </span>
                      {event.remaining_slots > 0 && (
                        <Badge variant="outline" className="text-xs">
                          残り{event.remaining_slots}席
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 新着シナリオ */}
      <section className="bg-white py-8 md:py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-6 h-6" style={{ color: THEME.primary }} />
              新着シナリオ
            </h2>
            <Button
              variant="ghost"
              className="text-gray-600 hover:text-gray-900"
              onClick={() => navigate('/scenario')}
            >
              すべて見る
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div 
                className="animate-spin h-8 w-8 border-4 border-t-transparent rounded-full"
                style={{ borderColor: `${THEME.primary} transparent ${THEME.primary} ${THEME.primary}` }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {featuredScenarios.map(scenario => (
                <div
                  key={scenario.id}
                  className="bg-gray-50 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group"
                  onClick={() => {
                    if (scenario.organization_slug && scenario.slug) {
                      navigate(`/${scenario.organization_slug}/scenario/${scenario.slug}`)
                    }
                  }}
                >
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
                            ? 'text-white' 
                            : 'bg-white/80 text-gray-400 hover:text-red-500'
                        }`}
                        style={favorites.has(scenario.id) ? { backgroundColor: THEME.primary } : {}}
                      >
                        <Heart className={`w-4 h-4 ${favorites.has(scenario.id) ? 'fill-current' : ''}`} />
                      </button>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-gray-500 mb-1">{scenario.organization_name}</p>
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 参加店舗 */}
      {organizations.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Building2 className="w-6 h-6" style={{ color: THEME.primary }} />
            参加店舗
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {organizations.map(org => (
              <div
                key={org.id}
                className="bg-white rounded-xl p-4 hover:shadow-md transition-all cursor-pointer group border border-gray-100"
                onClick={() => navigate(`/${org.slug}`)}
              >
                <div className="flex items-center gap-4">
                  {org.logo_url ? (
                    <img
                      src={org.logo_url}
                      alt={org.display_name}
                      className="w-14 h-14 rounded-xl object-cover"
                    />
                  ) : (
                    <div 
                      className="w-14 h-14 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: THEME.primaryLight }}
                    >
                      <Building2 className="w-7 h-7" style={{ color: THEME.primary }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">
                      {org.display_name}
                    </h3>
                    <p className="text-sm text-gray-500">予約サイトを見る →</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <div 
          className="rounded-2xl p-8 md:p-12 text-center text-white"
          style={{ 
            background: `linear-gradient(135deg, ${THEME.gradientFrom} 0%, ${THEME.gradientTo} 100%)` 
          }}
        >
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            今すぐシナリオを探そう
          </h2>
          <p className="opacity-90 mb-6 max-w-lg mx-auto">
            様々な店舗のマーダーミステリーを検索。<br />
            あなたにぴったりの物語を見つけましょう。
          </p>
          <Button
            size="lg"
            className="bg-white hover:bg-gray-100 rounded-full px-8"
            style={{ color: THEME.primary }}
            onClick={() => navigate('/scenario')}
          >
            シナリオを探す
            <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* フッター */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm">© 2024 MMQ. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

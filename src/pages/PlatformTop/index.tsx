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
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { Search, ChevronRight, Users, Clock, Sparkles, Building2, Calendar, MapPin, Heart, Filter } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { getColorFromName } from '@/lib/utils'

// シナリオカード用の型（直近公演情報を含む）
interface ScenarioWithEvents {
  scenario_id: string
  scenario_title: string
  scenario_slug: string
  key_visual_url: string | null
  author: string
  player_count_min: number
  player_count_max: number
  duration: number
  organization_id: string
  organization_slug: string
  organization_name: string
  next_events: Array<{
    date: string
    time: string
    store_name: string
    store_short_name: string
    store_color?: string
    available_seats: number
    region?: string
  }>
}

interface Organization {
  id: string
  slug: string
  display_name: string
  logo_url?: string
}

// 地域リスト
const REGIONS = [
  { value: 'all', label: '全国' },
  { value: '東京都', label: '東京都' },
  { value: '神奈川県', label: '神奈川県' },
  { value: '埼玉県', label: '埼玉県' },
  { value: '千葉県', label: '千葉県' },
  { value: '大阪府', label: '大阪府' },
  { value: '愛知県', label: '愛知県' },
  { value: '福岡県', label: '福岡県' },
]

export function PlatformTop() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { favorites, toggleFavorite } = useFavorites()
  const [scenariosWithEvents, setScenariosWithEvents] = useState<ScenarioWithEvents[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRegion, setSelectedRegion] = useState('all')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)

      // 組織一覧を取得
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, slug, name, logo_url')
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
        setOrganizations(orgData.map(o => ({ 
          id: o.id,
          slug: o.slug,
          display_name: o.name,
          logo_url: o.logo_url || undefined
        })))
        console.log('🏢 組織データ:', orgData.length, '件')
      }

      // 今日以降のイベントを取得（店舗の地域情報も含む）
      // 貸切公演は除外、オープン公演のみ
      const today = new Date().toISOString().split('T')[0]
      const { data: eventData, error: eventError } = await supabase
        .from('schedule_events')
        .select(`
          id, date, time_slot, current_participants, start_time, category, is_reservation_enabled, is_cancelled,
          scenarios:scenario_id!inner (id, title, slug, key_visual_url, player_count_min, player_count_max, duration, author, organization_id, status, scenario_type),
          stores:store_id (id, name, short_name, color, region)
        `)
        .gte('date', today)
        .eq('category', 'open')  // オープン公演のみ
        .eq('is_cancelled', false)  // キャンセルされていない
        .order('date', { ascending: true })
        .limit(500)

      console.log('📆 イベントデータ:', eventData?.length, '件', eventError ? `エラー: ${JSON.stringify(eventError)}` : '')
      if (eventData && eventData.length > 0) {
        console.log('📆 最初のイベント:', JSON.stringify(eventData[0], null, 2))
      }

      if (eventData) {
        // シナリオごとにイベントを集約
        const scenarioMap: Record<string, ScenarioWithEvents> = {}
        
        eventData.forEach(e => {
          const scenario = e.scenarios as any
          const store = e.stores as any
          
          // 基本チェック
          if (!scenario || !store || scenario.status !== 'available') return
          if (!scenario.organization_id || !orgMap[scenario.organization_id]) return
          
          // GMテストを除外
          if (scenario.scenario_type === 'gm_test') return
          
          // 予約無効のイベントを除外
          if (e.is_reservation_enabled === false) return
          
          const org = orgMap[scenario.organization_id]
          const scenarioKey = scenario.id
          
          if (!scenarioMap[scenarioKey]) {
            scenarioMap[scenarioKey] = {
              scenario_id: scenario.id,
              scenario_title: scenario.title,
              scenario_slug: scenario.slug,
              key_visual_url: scenario.key_visual_url,
              author: scenario.author || '',
              player_count_min: scenario.player_count_min,
              player_count_max: scenario.player_count_max,
              duration: scenario.duration,
              organization_id: scenario.organization_id,
              organization_slug: org.slug,
              organization_name: org.name,
              next_events: []
            }
          }
          
          // 最大10件まで追加
          if (scenarioMap[scenarioKey].next_events.length < 10) {
            const remainingSlots = scenario.player_count_max - (e.current_participants || 0)
            scenarioMap[scenarioKey].next_events.push({
              date: e.date,
              time: e.start_time || e.time_slot || '',
              store_name: store.name,
              store_short_name: store.short_name || store.name,
              store_color: store.color,
              available_seats: remainingSlots,
              region: store.region
            })
          }
        })
        
        // 配列に変換してソート（直近公演日順）
        const scenarioList = Object.values(scenarioMap)
          .sort((a, b) => {
            // 直近公演があるものを優先
            if (a.next_events.length > 0 && b.next_events.length === 0) return -1
            if (a.next_events.length === 0 && b.next_events.length > 0) return 1
            // 両方に公演がある場合は直近公演日順
            if (a.next_events.length > 0 && b.next_events.length > 0) {
              return a.next_events[0].date.localeCompare(b.next_events[0].date)
            }
            // 同じならタイトル順
            return a.scenario_title.localeCompare(b.scenario_title)
          })
        
        setScenariosWithEvents(scenarioList)
        console.log('🎭 シナリオ（イベント付き）:', scenarioList.length, '件')
        // デバッグ: 最初のシナリオのイベントを表示
        if (scenarioList.length > 0) {
          console.log('🎭 最初のシナリオのイベント:', scenarioList[0].scenario_title, scenarioList[0].next_events)
        }
      }

    } catch (error) {
      logger.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 地域フィルター適用
  const filteredScenarios = useMemo(() => {
    if (selectedRegion === 'all') return scenariosWithEvents
    
    return scenariosWithEvents.filter(s => 
      s.next_events.some(e => e.region === selectedRegion)
    ).map(s => ({
      ...s,
      // フィルターに一致するイベントのみ表示
      next_events: s.next_events.filter(e => e.region === selectedRegion)
    }))
  }, [scenariosWithEvents, selectedRegion])

  // 日付フォーマット
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    const dayOfWeek = d.getDay()
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      weekday: weekdays[dayOfWeek],
      isSunday: dayOfWeek === 0,
      isSaturday: dayOfWeek === 6
    }
  }

  const handleFavoriteClick = (e: React.MouseEvent, scenarioId: string) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }

  const handleScenarioClick = (scenario: ScenarioWithEvents) => {
    if (scenario.organization_slug && scenario.scenario_slug) {
      navigate(`/${scenario.organization_slug}/scenario/${scenario.scenario_slug}`)
    }
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
                  variant="ghost"
                  className="border-2 border-white/50 text-white hover:bg-white/10 hover:text-white rounded-full px-8 h-14 text-lg"
                  onClick={() => navigate('/mypage')}
                >
                  マイページ
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="ghost"
                  className="border-2 border-white/50 text-white hover:bg-white/10 hover:text-white rounded-full px-8 h-14 text-lg"
                  onClick={() => navigate('/login')}
                >
                  ログイン / 新規登録
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ラインナップ（公演予定付き） */}
      <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6 h-6" style={{ color: THEME.primary }} />
            公演ラインナップ
          </h2>
          
          {/* 地域フィルター */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="地域" />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div 
              className="animate-spin h-8 w-8 border-4 border-t-transparent rounded-full"
              style={{ borderColor: `${THEME.primary} transparent ${THEME.primary} ${THEME.primary}` }}
            />
          </div>
        ) : filteredScenarios.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            該当する公演がありません
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filteredScenarios.map(scenario => (
              <div 
                key={scenario.scenario_id}
                className="group cursor-pointer"
                onClick={() => handleScenarioClick(scenario)}
              >
                {/* カード本体 - スマホは横並び、タブレット以上は縦 */}
                <div className="relative bg-white rounded-lg overflow-hidden border border-gray-200 group-hover:border-gray-300 group-hover:shadow-lg transition-all duration-200 flex sm:flex-col">
                  {/* お気に入りボタン - カード右上（タップ領域拡大） */}
                  {user && (
                    <button
                      onClick={(e) => handleFavoriteClick(e, scenario.scenario_id)}
                      className={`absolute -top-2 -right-2 z-10 p-5 transition-colors`}
                    >
                      <span className={`flex items-center justify-center w-8 h-8 rounded-md bg-white shadow-sm border border-gray-200 ${
                        favorites.has(scenario.scenario_id) ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
                      }`}>
                        <Heart className={`h-4 w-4 ${favorites.has(scenario.scenario_id) ? 'fill-current' : ''}`} />
                      </span>
                    </button>
                  )}
                  
                  {/* キービジュアル */}
                  <div className="relative w-28 sm:w-full aspect-[3/4] overflow-hidden bg-gray-100 flex-shrink-0">
                    {scenario.key_visual_url ? (
                      <img
                        src={scenario.key_visual_url}
                        alt={scenario.scenario_title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <Sparkles className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* コンテンツ */}
                  <div className="p-3 flex-1 min-w-0">
                    {/* タイトル */}
                    <h3 className="text-sm font-bold text-gray-900 leading-snug mb-2 line-clamp-2 group-hover:text-red-600 transition-colors">
                      {scenario.scenario_title}
                    </h3>

                    {/* 人数・時間 */}
                    <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {scenario.player_count_min === scenario.player_count_max
                          ? `${scenario.player_count_max}人`
                          : `${scenario.player_count_min}-${scenario.player_count_max}人`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {Math.floor(scenario.duration / 60)}h
                      </span>
                    </div>

                    {/* 次回公演 */}
                    {scenario.next_events.length > 0 && (
                      <div className="border-t border-gray-100 pt-2 space-y-1">
                        {scenario.next_events.slice(0, 2).map((event, index) => {
                          const dateInfo = formatDate(event.date)
                          return (
                            <div 
                              key={index} 
                              className="flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span 
                                  className="w-1 h-4 rounded-sm flex-shrink-0"
                                  style={{ backgroundColor: event.store_color ? getColorFromName(event.store_color) : THEME.primary }}
                                />
                                <span className="font-medium text-gray-900">
                                  {dateInfo.date}
                                  <span className={`ml-0.5 font-normal ${dateInfo.isSunday ? 'text-red-500' : dateInfo.isSaturday ? 'text-blue-500' : 'text-gray-400'}`}>
                                    ({dateInfo.weekday})
                                  </span>
                                </span>
                                {event.time && (
                                  <span className="text-gray-500">{event.time.slice(0, 5)}</span>
                                )}
                                <span className="text-gray-400 truncate">{scenario.organization_name}{event.store_short_name}</span>
                              </div>
                              {event.available_seats > 0 && (
                                <span 
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ml-2 ${
                                    event.available_seats <= 2 
                                      ? 'bg-red-100 text-red-600' 
                                      : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  残{event.available_seats}
                                </span>
                              )}
                            </div>
                          )
                        })}
                        {scenario.next_events.length > 2 && (
                          <p className="text-[10px] text-gray-400">
                            +{scenario.next_events.length - 2}件
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </section>

      {/* 参加店舗 */}
      {organizations.length > 0 && (
        <section className="bg-white py-8 md:py-12">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Building2 className="w-6 h-6" style={{ color: THEME.primary }} />
              参加店舗
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {organizations.map(org => (
                <div
                  key={org.id}
                  className="bg-gray-50 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer group border border-gray-100"
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

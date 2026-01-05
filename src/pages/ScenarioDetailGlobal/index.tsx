/**
 * シナリオ共通詳細ページ
 * @path /scenario/:scenarioSlug
 * @purpose 全組織の公演日程を表示（プラットフォーム横断）
 * @access 全員
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { 
  ArrowLeft, Users, Clock, Calendar, MapPin, Building2, ChevronRight
} from 'lucide-react'
import { getColorFromName } from '@/lib/utils'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

interface ScenarioDetailGlobalProps {
  scenarioSlug: string
  onClose?: () => void
}

interface ScenarioMaster {
  id: string
  title: string
  author: string | null
  key_visual_url: string | null
  description: string | null
  player_count_min: number
  player_count_max: number
  official_duration: number
  genre: string[]
  difficulty: string | null
  synopsis: string | null
  master_status: string
}

interface EventWithOrg {
  id: string
  date: string
  start_time: string
  time_slot: string
  current_participants: number
  player_count_max: number
  organization_id: string
  organization_slug: string
  organization_name: string
  store_id: string
  store_name: string
  store_short_name: string
  store_color: string | null
  store_region: string | null
}

export function ScenarioDetailGlobal({ scenarioSlug, onClose }: ScenarioDetailGlobalProps) {
  const navigate = useNavigate()
  const [scenario, setScenario] = useState<ScenarioMaster | null>(null)
  const [events, setEvents] = useState<EventWithOrg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [scenarioSlug])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      // シナリオマスタを取得（slugまたはIDで検索）
      // まずorganization_scenariosからslugで検索し、scenario_master_idを取得
      const { data: orgScenario, error: orgError } = await supabase
        .from('organization_scenarios')
        .select('scenario_master_id')
        .eq('slug', scenarioSlug)
        .limit(1)
        .single()

      let masterId = orgScenario?.scenario_master_id

      // slugで見つからない場合はIDとして検索
      if (!masterId) {
        const { data: masterById } = await supabase
          .from('scenario_masters')
          .select('id')
          .eq('id', scenarioSlug)
          .single()
        
        if (masterById) {
          masterId = masterById.id
        }
      }

      if (!masterId) {
        setError('シナリオが見つかりません')
        setLoading(false)
        return
      }

      // シナリオマスタの詳細を取得
      const { data: masterData, error: masterError } = await supabase
        .from('scenario_masters')
        .select('*')
        .eq('id', masterId)
        .single()

      if (masterError || !masterData) {
        setError('シナリオの読み込みに失敗しました')
        setLoading(false)
        return
      }

      setScenario(masterData)

      // このシナリオの公演を全組織から取得
      // organization_scenariosからこのマスタを使用している組織を取得
      const { data: orgScenarios, error: orgScenariosError } = await supabase
        .from('organization_scenarios')
        .select(`
          id,
          organization_id,
          organizations!inner (id, slug, name)
        `)
        .eq('scenario_master_id', masterId)
        .eq('org_status', 'available')

      if (orgScenariosError) {
        logger.error('Failed to fetch organization scenarios:', orgScenariosError)
      }

      // 組織マップを作成
      const orgMap: Record<string, { slug: string, name: string }> = {}
      orgScenarios?.forEach((os: any) => {
        if (os.organizations) {
          orgMap[os.organization_id] = {
            slug: os.organizations.slug,
            name: os.organizations.name
          }
        }
      })

      // 今日以降の公演を取得（既存のscenariosテーブルから）
      // 注意: 現在はschedule_eventsがscenariosテーブルを参照しているため、
      // scenario_masters.idと一致するscenarios.idを持つイベントを取得
      const today = new Date().toISOString().split('T')[0]
      const { data: eventData, error: eventError } = await supabase
        .from('schedule_events')
        .select(`
          id, date, start_time, time_slot, current_participants, category, is_cancelled,
          scenarios:scenario_id (id, title, player_count_max, organization_id),
          stores:store_id (id, name, short_name, color, region)
        `)
        .eq('scenario_id', masterId)
        .gte('date', today)
        .eq('category', 'open')
        .eq('is_cancelled', false)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(50)

      if (eventError) {
        logger.error('Failed to fetch events:', eventError)
      }

      // イベントデータを整形
      const formattedEvents: EventWithOrg[] = (eventData || []).map((e: any) => {
        const scenario = e.scenarios
        const store = e.stores
        const org = scenario?.organization_id ? orgMap[scenario.organization_id] : null

        return {
          id: e.id,
          date: e.date,
          start_time: e.start_time || '',
          time_slot: e.time_slot || '',
          current_participants: e.current_participants || 0,
          player_count_max: scenario?.player_count_max || masterData.player_count_max,
          organization_id: scenario?.organization_id || '',
          organization_slug: org?.slug || '',
          organization_name: org?.name || '不明',
          store_id: store?.id || '',
          store_name: store?.name || '',
          store_short_name: store?.short_name || store?.name || '',
          store_color: store?.color || null,
          store_region: store?.region || null
        }
      }).filter((e: EventWithOrg) => e.organization_slug)

      setEvents(formattedEvents)
      setLoading(false)

    } catch (err) {
      logger.error('Error fetching scenario data:', err)
      setError('データの読み込みに失敗しました')
      setLoading(false)
    }
  }

  // 日付フォーマット
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    const dayOfWeek = d.getDay()
    return {
      full: `${d.getMonth() + 1}/${d.getDate()}(${weekdays[dayOfWeek]})`,
      isSunday: dayOfWeek === 0,
      isSaturday: dayOfWeek === 6
    }
  }

  // 組織別にイベントをグループ化
  const eventsByOrg = useMemo(() => {
    const grouped: Record<string, { org: { slug: string, name: string }, events: EventWithOrg[] }> = {}
    events.forEach(e => {
      if (!grouped[e.organization_id]) {
        grouped[e.organization_id] = {
          org: { slug: e.organization_slug, name: e.organization_name },
          events: []
        }
      }
      grouped[e.organization_id].events.push(e)
    })
    return Object.values(grouped)
  }, [events])

  const handleEventClick = (event: EventWithOrg) => {
    // 組織のシナリオ詳細ページへ遷移
    navigate(`/${event.organization_slug}/scenario/${scenarioSlug}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: THEME.background }}>
        <Header />
        <div className="flex items-center justify-center py-20">
          <div 
            className="animate-spin h-8 w-8 border-4 border-t-transparent rounded-full"
            style={{ borderColor: `${THEME.primary} transparent ${THEME.primary} ${THEME.primary}` }}
          />
        </div>
      </div>
    )
  }

  if (error || !scenario) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: THEME.background }}>
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{error || 'シナリオが見つかりません'}</h1>
          <Button onClick={() => navigate('/')}>トップへ戻る</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: THEME.background }}>
      <Header />

      {/* ヘッダー部分 */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <button
            onClick={() => onClose ? onClose() : navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>戻る</span>
          </button>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左カラム: キービジュアル */}
          <div className="lg:col-span-1">
            <div className="sticky top-4">
              {scenario.key_visual_url ? (
                <img
                  src={scenario.key_visual_url}
                  alt={scenario.title}
                  className="w-full rounded-lg shadow-lg"
                />
              ) : (
                <div className="w-full aspect-[3/4] bg-gray-200 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400">No Image</span>
                </div>
              )}
            </div>
          </div>

          {/* 右カラム: 情報 */}
          <div className="lg:col-span-2 space-y-6">
            {/* タイトル・基本情報 */}
            <div>
              {scenario.author && (
                <p className="text-sm text-gray-500 mb-1">{scenario.author}</p>
              )}
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                {scenario.title}
              </h1>

              <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {scenario.player_count_min === scenario.player_count_max
                    ? `${scenario.player_count_max}人`
                    : `${scenario.player_count_min}-${scenario.player_count_max}人`}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {Math.floor(scenario.official_duration / 60)}時間
                  {scenario.official_duration % 60 > 0 && `${scenario.official_duration % 60}分`}
                </span>
              </div>

              {/* ジャンル */}
              {scenario.genre && scenario.genre.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {scenario.genre.map((g, i) => (
                    <Badge key={i} variant="secondary">{g}</Badge>
                  ))}
                </div>
              )}
            </div>

            {/* 説明 */}
            {scenario.description && (
              <div className="bg-white rounded-lg p-4 border">
                <h2 className="font-semibold text-gray-900 mb-2">概要</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{scenario.description}</p>
              </div>
            )}

            {/* 公演日程 */}
            <div className="bg-white rounded-lg p-4 border">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5" style={{ color: THEME.primary }} />
                公演日程
              </h2>

              {eventsByOrg.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  現在予定されている公演はありません
                </p>
              ) : (
                <div className="space-y-6">
                  {eventsByOrg.map(({ org, events: orgEvents }) => (
                    <div key={org.slug}>
                      {/* 組織ヘッダー */}
                      <div className="flex items-center gap-2 mb-3">
                        <Building2 className="w-4 h-4 text-gray-500" />
                        <span className="font-medium text-gray-900">{org.name}</span>
                        <button
                          onClick={() => navigate(`/${org.slug}`)}
                          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                        >
                          サイトを見る
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>

                      {/* イベントリスト */}
                      <div className="space-y-2">
                        {orgEvents.slice(0, 5).map(event => {
                          const dateInfo = formatDate(event.date)
                          const available = event.player_count_max - event.current_participants
                          const isFull = available <= 0

                          return (
                            <div
                              key={event.id}
                              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                                isFull ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'
                              }`}
                              onClick={() => handleEventClick(event)}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className="w-1 h-8 rounded-full"
                                  style={{ backgroundColor: event.store_color ? getColorFromName(event.store_color) : THEME.primary }}
                                />
                                <div>
                                  <div className={`font-medium ${
                                    dateInfo.isSunday ? 'text-red-600' : dateInfo.isSaturday ? 'text-blue-600' : 'text-gray-900'
                                  }`}>
                                    {dateInfo.full}
                                    {event.start_time && (
                                      <span className="ml-2 font-normal text-gray-600">
                                        {event.start_time.slice(0, 5)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 text-sm text-gray-500">
                                    <MapPin className="w-3 h-3" />
                                    <span>{org.name}{event.store_short_name}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right">
                                {isFull ? (
                                  <span className="text-sm text-gray-500">満席</span>
                                ) : (
                                  <span className={`text-sm font-medium ${
                                    available <= 2 ? 'text-red-600' : 'text-gray-600'
                                  }`}>
                                    残り{available}席
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}

                        {orgEvents.length > 5 && (
                          <button
                            onClick={() => navigate(`/${org.slug}/scenario/${scenarioSlug}`)}
                            className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center justify-center gap-1"
                          >
                            他{orgEvents.length - 5}件を見る
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


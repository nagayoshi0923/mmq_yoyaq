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
  ArrowLeft, Users, Clock, Calendar, MapPin, Building2, ChevronRight, Sparkles
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

interface ScenarioCharacter {
  id: string
  name: string
  description: string | null
  image_url: string | null
  sort_order: number
}

export function ScenarioDetailGlobal({ scenarioSlug, onClose }: ScenarioDetailGlobalProps) {
  const navigate = useNavigate()
  const [scenario, setScenario] = useState<ScenarioMaster | null>(null)
  const [events, setEvents] = useState<EventWithOrg[]>([])
  const [characters, setCharacters] = useState<ScenarioCharacter[]>([])
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
      let masterId: string | null = null

      // 1. まずorganization_scenariosからslugで検索し、scenario_master_idを取得
      const { data: orgScenarios } = await supabase
        .from('organization_scenarios')
        .select('scenario_master_id')
        .eq('slug', scenarioSlug)
        .limit(1)

      if (orgScenarios && orgScenarios.length > 0) {
        masterId = orgScenarios[0].scenario_master_id
      }

      // 2. slugで見つからない場合、UUIDとしてIDで検索
      if (!masterId) {
        // UUIDパターンチェック
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (uuidPattern.test(scenarioSlug)) {
          const { data: masterById } = await supabase
            .from('scenario_masters')
            .select('id')
            .eq('id', scenarioSlug)
            .limit(1)
          
          if (masterById && masterById.length > 0) {
            masterId = masterById[0].id
          }
        }
      }

      // 3. まだ見つからない場合、既存のscenariosテーブルからslugで検索
      let useLegacyTable = false
      if (!masterId) {
        const { data: legacyScenario } = await supabase
          .from('scenarios')
          .select('id')
          .eq('slug', scenarioSlug)
          .limit(1)
        
        if (legacyScenario && legacyScenario.length > 0) {
          masterId = legacyScenario[0].id
          useLegacyTable = true
        }
      }

      if (!masterId) {
        setError('シナリオが見つかりません')
        setLoading(false)
        return
      }

      // シナリオの詳細を取得
      // scenario_mastersテーブルを試し、なければ既存のscenariosテーブルから取得
      let masterData: any = null
      
      if (!useLegacyTable) {
        const { data, error } = await supabase
          .from('scenario_masters')
          .select('*')
          .eq('id', masterId)
          .limit(1)
        
        if (!error && data && data.length > 0) {
          masterData = data[0]
        }
      }
      
      // scenario_mastersから取得できなかった場合、既存のscenariosテーブルから取得
      if (!masterData) {
        const { data: legacyData, error: legacyError } = await supabase
          .from('scenarios')
          .select(`
            id,
            title,
            slug,
            description,
            key_visual_url,
            duration,
            player_count_min,
            player_count_max,
            organization_id,
            author_id,
            authors (name)
          `)
          .eq('id', masterId)
          .single()
        
        if (legacyError || !legacyData) {
          setError('シナリオの読み込みに失敗しました')
          setLoading(false)
          return
        }
        
        // 既存テーブルのデータをシナリオマスタ形式に変換
        masterData = {
          id: legacyData.id,
          title: legacyData.title,
          slug: legacyData.slug,
          description: legacyData.description,
          key_visual_url: legacyData.key_visual_url,
          official_duration: legacyData.duration,
          player_count_min: legacyData.player_count_min,
          player_count_max: legacyData.player_count_max,
          author: (legacyData.authors as any)?.name || '不明',
          organization_id: legacyData.organization_id // レガシー用
        }
        useLegacyTable = true
      }

      if (!masterData) {
        setError('シナリオの読み込みに失敗しました')
        setLoading(false)
        return
      }

      setScenario(masterData)

      // キャラクター情報を取得（scenario_mastersからの場合のみ）
      if (!useLegacyTable) {
        const { data: charData } = await supabase
          .from('scenario_characters')
          .select('id, name, description, image_url, sort_order')
          .eq('scenario_master_id', masterId)
          .eq('is_visible', true)
          .order('sort_order', { ascending: true })
        
        if (charData) {
          setCharacters(charData)
        }
      }

      // 組織マップを作成
      const orgMap: Record<string, { slug: string, name: string }> = {}

      if (useLegacyTable) {
        // レガシーモード: シナリオの組織情報を取得
        if (masterData.organization_id) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('id, slug, name')
            .eq('id', masterData.organization_id)
            .single()
          
          if (orgData) {
            orgMap[orgData.id] = {
              slug: orgData.slug,
              name: orgData.name
            }
          }
        }
      } else {
        // 新モード: organization_scenariosからこのマスタを使用している組織を取得
        const { data: availableOrgScenarios, error: availableOrgScenariosError } = await supabase
          .from('organization_scenarios')
          .select(`
            id,
            organization_id,
            organizations!inner (id, slug, name)
          `)
          .eq('scenario_master_id', masterId)
          .eq('org_status', 'available')

        if (availableOrgScenariosError) {
          logger.error('Failed to fetch organization scenarios:', availableOrgScenariosError)
        }

        availableOrgScenarios?.forEach((os: any) => {
          if (os.organizations) {
            orgMap[os.organization_id] = {
              slug: os.organizations.slug,
              name: os.organizations.name
            }
          }
        })
      }

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
        {/* ヒーローセクション */}
        <section className="relative overflow-hidden" style={{ backgroundColor: THEME.primary }}>
          <div 
            className="absolute top-0 right-0 w-48 h-48 opacity-20"
            style={{ 
              background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
              transform: 'translate(30%, -30%)'
            }}
          />
          <div className="max-w-6xl mx-auto px-4 py-4 relative">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onClose ? onClose() : navigate(-1)}
                className="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>戻る</span>
              </button>
            </div>
          </div>
        </section>
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
        {/* ヒーローセクション */}
        <section className="relative overflow-hidden" style={{ backgroundColor: THEME.primary }}>
          <div 
            className="absolute top-0 right-0 w-48 h-48 opacity-20"
            style={{ 
              background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
              transform: 'translate(30%, -30%)'
            }}
          />
          <div className="max-w-6xl mx-auto px-4 py-4 relative">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>戻る</span>
              </button>
            </div>
          </div>
        </section>
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
        
        <div className="max-w-6xl mx-auto px-4 py-4 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onClose ? onClose() : navigate(-1)}
                className="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>戻る</span>
              </button>
              <div className="h-4 w-px bg-white/30" />
              <span className="text-sm text-white/80">シナリオ詳細</span>
            </div>
            <div 
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: THEME.accent, color: '#000' }}
            >
              <Sparkles className="w-2.5 h-2.5" />
              MURDER MYSTERY QUEST
            </div>
          </div>
        </div>
      </section>

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
                  className="w-full shadow-lg"
                  style={{ borderRadius: 0 }}
                />
              ) : (
                <div className="w-full aspect-[3/4] bg-gray-200 flex items-center justify-center" style={{ borderRadius: 0 }}>
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
              <div className="bg-white p-4 border" style={{ borderRadius: 0 }}>
                <h2 className="font-semibold text-gray-900 mb-2">概要</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{scenario.description}</p>
              </div>
            )}

            {/* あらすじ */}
            {scenario.synopsis && (
              <div className="bg-white p-4 border" style={{ borderRadius: 0 }}>
                <h2 className="font-semibold text-gray-900 mb-2">あらすじ</h2>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{scenario.synopsis}</p>
              </div>
            )}

            {/* キャラクター */}
            {characters.length > 0 && (
              <div className="bg-white p-4 border" style={{ borderRadius: 0 }}>
                <h2 className="font-semibold text-gray-900 mb-4">登場キャラクター</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {characters.map(char => (
                    <div key={char.id} className="text-center">
                      {char.image_url ? (
                        <img
                          src={char.image_url}
                          alt={char.name}
                          className="w-full aspect-[3/4] object-cover mb-2 shadow-sm"
                          style={{ borderRadius: 0 }}
                        />
                      ) : (
                        <div className="w-full aspect-[3/4] bg-gray-100 mb-2 flex items-center justify-center" style={{ borderRadius: 0 }}>
                          <span className="text-gray-400 text-xs">No Image</span>
                        </div>
                      )}
                      <p className="font-medium text-gray-900 text-sm">{char.name}</p>
                      {char.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{char.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 公演日程 */}
            <div className="bg-white p-4 border" style={{ borderRadius: 0 }}>
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
                              className={`flex items-center justify-between p-3 border cursor-pointer transition-colors ${
                                isFull ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'
                              }`}
                              style={{ borderRadius: 0 }}
                              onClick={() => handleEventClick(event)}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className="w-1 h-8"
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


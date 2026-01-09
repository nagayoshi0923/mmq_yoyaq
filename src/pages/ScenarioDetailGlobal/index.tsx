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
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { 
  ArrowLeft, Users, Clock, Calendar, MapPin, Building2, ChevronRight, ChevronDown, ChevronUp,
  Sparkles, BookOpen, Heart, Info, ExternalLink, Star, AlertCircle, MessageSquare, Zap
} from 'lucide-react'
import { getColorFromName } from '@/lib/utils'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Footer } from '@/components/layout/Footer'

interface ScenarioDetailGlobalProps {
  scenarioSlug: string
  onClose?: () => void
}

interface ScenarioMaster {
  id: string
  title: string
  slug?: string
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
  participation_fee?: number
  has_pre_reading?: boolean
  gm_comment?: string | null
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
  const { user } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()
  const [scenario, setScenario] = useState<ScenarioMaster | null>(null)
  const [events, setEvents] = useState<EventWithOrg[]>([])
  const [characters, setCharacters] = useState<ScenarioCharacter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false)
  const [isEventsExpanded, setIsEventsExpanded] = useState(false)

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
            genre,
            participation_fee,
            synopsis,
            authors (name)
          `)
          .eq('id', masterId)
          .single()
        
        if (legacyError || !legacyData) {
          setError('シナリオの読み込みに失敗しました')
          setLoading(false)
          return
        }
        
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
          organization_id: legacyData.organization_id,
          genre: legacyData.genre || [],
          participation_fee: legacyData.participation_fee,
          synopsis: legacyData.synopsis,
          difficulty: (legacyData as any).difficulty || null,
          has_pre_reading: (legacyData as any).has_pre_reading || false,
          gm_comment: (legacyData as any).gm_comment || null
        }
        useLegacyTable = true
      }

      if (!masterData) {
        setError('シナリオの読み込みに失敗しました')
        setLoading(false)
        return
      }

      setScenario(masterData)

      // キャラクター情報を取得
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

      // 今日以降の公演を取得
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

  // 時間フォーマット
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0 && mins > 0) {
      return `${hours}時間${mins}分`
    } else if (hours > 0) {
      return `${hours}時間`
    }
    return `${minutes}分`
  }

  // 人数フォーマット
  const formatPlayerCount = (min: number, max: number) => {
    if (min === max) return `${max}人`
    return `${min}〜${max}人`
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

  // 7日以内のイベントとそれ以降を分離
  const { eventsWithin7Days, eventsAfter7Days } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const sevenDaysLater = new Date(today)
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7)
    
    const within: EventWithOrg[] = []
    const after: EventWithOrg[] = []
    
    events.forEach(event => {
      const eventDate = new Date(event.date + 'T00:00:00')
      if (eventDate < sevenDaysLater) {
        within.push(event)
      } else {
        after.push(event)
      }
    })
    
    return { eventsWithin7Days: within, eventsAfter7Days: after }
  }, [events])

  const handleEventClick = (event: EventWithOrg) => {
    navigate(`/${event.organization_slug}/scenario/${scenarioSlug}`)
  }

  const handleFavoriteClick = () => {
    if (scenario) {
      toggleFavorite(scenario.id)
    }
  }

  // あらすじの文字数
  const synopsisLength = scenario?.synopsis?.length || 0
  const shouldTruncateSynopsis = synopsisLength > 200

  // 難易度に応じた色を返す
  const getDifficultyColor = (difficulty: string): { bg: string, text: string } => {
    const difficultyLower = difficulty.toLowerCase()
    if (difficultyLower.includes('初心者') || difficultyLower.includes('easy') || difficultyLower.includes('初級')) {
      return { bg: '#dcfce7', text: '#166534' } // 緑
    } else if (difficultyLower.includes('中級') || difficultyLower.includes('medium') || difficultyLower.includes('普通')) {
      return { bg: '#fef9c3', text: '#854d0e' } // 黄
    } else if (difficultyLower.includes('上級') || difficultyLower.includes('hard') || difficultyLower.includes('難')) {
      return { bg: '#fed7aa', text: '#c2410c' } // オレンジ
    } else if (difficultyLower.includes('最難') || difficultyLower.includes('expert') || difficultyLower.includes('エキスパート')) {
      return { bg: '#fecaca', text: '#dc2626' } // 赤
    }
    return { bg: '#f3f4f6', text: '#374151' } // グレー（デフォルト）
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: THEME.background }}>
        <Header />
        <section className="relative overflow-hidden" style={{ backgroundColor: THEME.primary }}>
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
        <div className="flex-1 flex items-center justify-center py-20">
          <div 
            className="animate-spin h-8 w-8 border-4 border-t-transparent rounded-full"
            style={{ borderColor: `${THEME.primary} transparent ${THEME.primary} ${THEME.primary}` }}
          />
        </div>
        <Footer />
      </div>
    )
  }

  if (error || !scenario) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: THEME.background }}>
        <Header />
        <section className="relative overflow-hidden" style={{ backgroundColor: THEME.primary }}>
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
        <div className="flex-1 max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{error || 'シナリオが見つかりません'}</h1>
          <Button onClick={() => navigate('/')}>トップへ戻る</Button>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: THEME.background }}>
      <Header />

      {/* ヒーローセクション */}
      <section 
        className="relative overflow-hidden"
        style={{ backgroundColor: THEME.primary }}
      >
        <div 
          className="absolute top-0 right-0 w-64 h-64 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div 
          className="absolute bottom-0 left-0 w-1 h-16"
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
      <div className="flex-1 max-w-6xl mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* 左カラム: キービジュアル */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-4">
              {/* キービジュアル */}
              <div className="relative">
                {scenario.key_visual_url ? (
                  <img
                    src={scenario.key_visual_url}
                    alt={scenario.title}
                    className="w-full shadow-lg"
                    style={{ borderRadius: 0 }}
                  />
                ) : (
                  <div className="w-full aspect-[3/4] bg-gray-200 flex items-center justify-center" style={{ borderRadius: 0 }}>
                    <Sparkles className="w-12 h-12 text-gray-300" />
                  </div>
                )}
                
                {/* お気に入りボタン */}
                {user && (
                  <button
                    onClick={handleFavoriteClick}
                    className="absolute top-3 right-3 w-10 h-10 bg-white/90 flex items-center justify-center shadow-md transition-colors hover:bg-white"
                    style={{ borderRadius: 0 }}
                  >
                    <Heart className={`h-5 w-5 ${
                      isFavorite(scenario.id) ? 'fill-current text-red-500' : 'text-gray-400'
                    }`} />
                  </button>
                )}
              </div>

              {/* シナリオ基本情報カード */}
              <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
                <h4 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
                  <Info className="w-4 h-4" style={{ color: THEME.primary }} />
                  シナリオ情報
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-xs text-gray-500">プレイ人数</span>
                      <p className="font-medium text-gray-900">{formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-xs text-gray-500">プレイ時間</span>
                      <p className="font-medium text-gray-900">{formatDuration(scenario.official_duration)}</p>
                    </div>
                  </div>
                  {scenario.difficulty && (
                    <div className="flex items-center gap-3">
                      <Star className="w-4 h-4 text-gray-400" />
                      <div>
                        <span className="text-xs text-gray-500">難易度</span>
                        <p className="font-medium text-gray-900">{scenario.difficulty}</p>
                      </div>
                    </div>
                  )}
                  {scenario.participation_fee && (
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 text-gray-400 text-center font-bold">¥</span>
                      <div>
                        <span className="text-xs text-gray-500">参加費</span>
                        <p className="font-medium text-gray-900">¥{scenario.participation_fee.toLocaleString()}〜</p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 追加情報 */}
                {scenario.has_pre_reading && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-3 py-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>事前読解あり</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 右カラム: 情報 */}
          <div className="lg:col-span-2 space-y-6">
            {/* タイトル・作者 */}
            <div className="space-y-3">
              {scenario.author && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium px-2 py-0.5 bg-gray-100 text-gray-700">作者</span>
                  <span className="text-gray-700">{scenario.author}</span>
                </div>
              )}
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                {scenario.title}
              </h1>
              
              {/* ジャンル・難易度・事前読解バッジ */}
              <div className="flex flex-wrap items-center gap-2">
                {scenario.genre && scenario.genre.map((g, i) => (
                  <Badge 
                    key={i} 
                    variant="outline" 
                    className="text-xs px-2.5 py-1"
                    style={{ borderColor: THEME.primary, color: THEME.primary }}
                  >
                    {g}
                  </Badge>
                ))}
                {scenario.difficulty && (
                  <Badge 
                    className="text-xs px-2.5 py-1 flex items-center gap-1"
                    style={{ 
                      backgroundColor: getDifficultyColor(scenario.difficulty).bg,
                      color: getDifficultyColor(scenario.difficulty).text,
                      border: 'none'
                    }}
                  >
                    <Zap className="w-3 h-3" />
                    {scenario.difficulty}
                  </Badge>
                )}
                {scenario.has_pre_reading && (
                  <Badge 
                    className="text-xs px-2.5 py-1 flex items-center gap-1 bg-blue-100 text-blue-700"
                  >
                    <AlertCircle className="w-3 h-3" />
                    事前読解あり
                  </Badge>
                )}
              </div>
            </div>

            {/* 概要・紹介文 */}
            {scenario.description && (
              <div className="bg-white border border-gray-200" style={{ borderRadius: 0 }}>
                <div 
                  className="px-4 py-3 border-b border-gray-200 flex items-center gap-2"
                  style={{ backgroundColor: '#374151' }}
                >
                  <Info className="w-4 h-4 text-white" />
                  <h3 className="font-semibold text-white text-sm">概要</h3>
                </div>
                <div className="p-4">
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">
                    {scenario.description}
                  </p>
                </div>
              </div>
            )}

            {/* あらすじ */}
            {scenario.synopsis && (
              <div className="bg-gray-50 border border-gray-200" style={{ borderRadius: 0 }}>
                <div 
                  className="px-4 py-3 border-b border-gray-200 flex items-center gap-2"
                  style={{ backgroundColor: THEME.primary }}
                >
                  <BookOpen className="w-4 h-4 text-white" />
                  <h3 className="font-semibold text-white text-sm">あらすじ</h3>
                </div>
                <div className="p-4">
                  <div className={`relative ${!isSynopsisExpanded && shouldTruncateSynopsis ? 'max-h-40 overflow-hidden' : ''}`}>
                    <p className="leading-relaxed whitespace-pre-wrap text-sm text-gray-700">
                      {scenario.synopsis}
                    </p>
                    {!isSynopsisExpanded && shouldTruncateSynopsis && (
                      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-gray-50 to-transparent" />
                    )}
                  </div>
                  {shouldTruncateSynopsis && (
                    <button
                      onClick={() => setIsSynopsisExpanded(!isSynopsisExpanded)}
                      className="mt-3 flex items-center gap-1 text-sm font-medium transition-colors"
                      style={{ color: THEME.primary }}
                    >
                      {isSynopsisExpanded ? '閉じる' : '続きを読む'}
                      <ChevronDown className={`w-4 h-4 transition-transform ${isSynopsisExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* GMからのコメント */}
            {scenario.gm_comment && (
              <div className="bg-amber-50 border border-amber-200" style={{ borderRadius: 0 }}>
                <div 
                  className="px-4 py-3 border-b border-amber-200 flex items-center gap-2"
                  style={{ backgroundColor: '#f59e0b' }}
                >
                  <MessageSquare className="w-4 h-4 text-white" />
                  <h3 className="font-semibold text-white text-sm">GMからのコメント</h3>
                </div>
                <div className="p-4">
                  <p className="text-amber-900 whitespace-pre-wrap leading-relaxed text-sm italic">
                    "{scenario.gm_comment}"
                  </p>
                </div>
              </div>
            )}

            {/* キャラクター */}
            {characters.length > 0 && (
              <div className="bg-white border border-gray-200" style={{ borderRadius: 0 }}>
                <div 
                  className="px-4 py-3 border-b border-gray-200 flex items-center gap-2"
                  style={{ backgroundColor: THEME.primary }}
                >
                  <Users className="w-4 h-4 text-white" />
                  <h3 className="font-semibold text-white text-sm">登場キャラクター</h3>
                  <span className="text-white/70 text-xs">({characters.length}人)</span>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {characters.map(char => (
                      <div key={char.id} className="group">
                        <div className="relative overflow-hidden" style={{ borderRadius: 0 }}>
                          {char.image_url ? (
                            <img
                              src={char.image_url}
                              alt={char.name}
                              className="w-full aspect-[3/4] object-cover shadow-sm group-hover:scale-105 transition-transform"
                              style={{ borderRadius: 0 }}
                            />
                          ) : (
                            <div className="w-full aspect-[3/4] bg-gray-100 flex items-center justify-center" style={{ borderRadius: 0 }}>
                              <Users className="w-6 h-6 text-gray-300" />
                            </div>
                          )}
                        </div>
                        <p className="font-medium text-gray-900 text-sm mt-2 text-center">{char.name}</p>
                        {char.description && (
                          <p className="text-xs text-gray-500 mt-1 text-center line-clamp-2">{char.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 公演日程 */}
            <div className="bg-white border border-gray-200" style={{ borderRadius: 0 }}>
              <div 
                className="px-4 py-3 border-b border-gray-200 flex items-center justify-between"
                style={{ backgroundColor: THEME.primary }}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-white" />
                  <h3 className="font-semibold text-white text-sm">公演日程</h3>
                </div>
                <span className="text-white/70 text-xs">
                  7日以内: {eventsWithin7Days.length}件
                </span>
              </div>
              <div className="p-4">
                {events.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    現在予定されている公演はありません
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* 7日以内の公演 */}
                    {eventsWithin7Days.length > 0 ? (
                      <div className="space-y-2">
                        {eventsWithin7Days.map(event => {
                          const dateInfo = formatDate(event.date)
                          const available = event.player_count_max - event.current_participants
                          const isFull = available <= 0

                          return (
                            <div
                              key={event.id}
                              className={`flex items-center justify-between p-3 border cursor-pointer transition-all ${
                                isFull ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50 hover:shadow-sm'
                              }`}
                              style={{ borderRadius: 0 }}
                              onClick={() => handleEventClick(event)}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className="w-1 h-10 flex-shrink-0"
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
                                  <div className="flex items-center gap-2 text-sm text-gray-500">
                                    <Building2 className="w-3 h-3" />
                                    <span>{event.organization_name}</span>
                                    <MapPin className="w-3 h-3" />
                                    <span>{event.store_short_name}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {isFull ? (
                                  <span className="text-sm text-gray-500">満席</span>
                                ) : (
                                  <span className={`text-sm font-medium ${
                                    available <= 2 ? 'text-red-600' : 'text-gray-600'
                                  }`}>
                                    残り{available}席
                                  </span>
                                )}
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 bg-gray-50 text-muted-foreground">
                        7日以内の公演予定はありません
                      </div>
                    )}

                    {/* 8日以降の公演（折りたたみ） */}
                    {eventsAfter7Days.length > 0 && (
                      <div className="mt-4">
                        <Button
                          variant="outline"
                          onClick={() => setIsEventsExpanded(!isEventsExpanded)}
                          className="w-full gap-2"
                          style={{ borderRadius: 0 }}
                        >
                          {isEventsExpanded ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              閉じる
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              8日以降の公演を見る（{eventsAfter7Days.length}件）
                            </>
                          )}
                        </Button>
                        
                        {isEventsExpanded && (
                          <div className="mt-3 space-y-2">
                            {eventsAfter7Days.map(event => {
                              const dateInfo = formatDate(event.date)
                              const available = event.player_count_max - event.current_participants
                              const isFull = available <= 0

                              return (
                                <div
                                  key={event.id}
                                  className={`flex items-center justify-between p-3 border cursor-pointer transition-all ${
                                    isFull ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50 hover:shadow-sm'
                                  }`}
                                  style={{ borderRadius: 0 }}
                                  onClick={() => handleEventClick(event)}
                                >
                                  <div className="flex items-center gap-3">
                                    <span
                                      className="w-1 h-10 flex-shrink-0"
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
                                      <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <Building2 className="w-3 h-3" />
                                        <span>{event.organization_name}</span>
                                        <MapPin className="w-3 h-3" />
                                        <span>{event.store_short_name}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    {isFull ? (
                                      <span className="text-sm text-gray-500">満席</span>
                                    ) : (
                                      <span className={`text-sm font-medium ${
                                        available <= 2 ? 'text-red-600' : 'text-gray-600'
                                      }`}>
                                        残り{available}席
                                      </span>
                                    )}
                                    <ChevronRight className="w-4 h-4 text-gray-400" />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 遊べる店舗一覧 */}
            {eventsByOrg.length > 0 && (
              <div className="bg-white border border-gray-200" style={{ borderRadius: 0 }}>
                <div 
                  className="px-4 py-3 border-b border-gray-200 flex items-center gap-2"
                  style={{ backgroundColor: THEME.primary }}
                >
                  <Building2 className="w-4 h-4 text-white" />
                  <h3 className="font-semibold text-white text-sm">遊べる店舗</h3>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {eventsByOrg.map(({ org, events: orgEvents }) => (
                      <div 
                        key={org.slug}
                        className="p-4 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
                        style={{ borderRadius: 0 }}
                        onClick={() => navigate(`/${org.slug}/scenario/${scenarioSlug}`)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{org.name}</h4>
                            <p className="text-sm text-gray-500">{orgEvents.length}件の公演予定</p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}

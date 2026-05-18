/**
 * シナリオ共通詳細ページ
 * @path /scenario/:scenarioSlug
 * @purpose 全組織の公演日程を表示（プラットフォーム横断）
 * @access 全員
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { showToast } from '@/utils/toast'
import {
  ArrowLeft, Users, Clock, Calendar, MapPin, Building2, ChevronRight, ChevronDown, ChevronUp,
  Sparkles, BookOpen, Heart, Info, ExternalLink, AlertCircle, MessageSquare, CheckCheck
} from 'lucide-react'
import { getColorFromName } from '@/lib/utils'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Footer } from '@/components/layout/Footer'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { countManualPlayHistoryForCustomer, isManualPlayHistoryAtCap } from '@/lib/manualPlayHistoryLimit'
import { getAvailableSeats } from '@/lib/participantUtils'

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
  description?: string | null
  image_url?: string | null
  sort_order: number
  is_npc?: boolean
  gender?: string
  age?: string | null
  occupation?: string | null
  first_person?: string | null
  background_color?: string | null
  image_position?: string | null
  image_scale?: number | null
}

interface ScenarioDetailData {
  scenario: ScenarioMaster
  events: EventWithOrg[]
  characters: ScenarioCharacter[]
  availableOrganizations: Array<{ id: string; slug: string; name: string; scenarioId: string }>
  favoriteScenarioId: string
  redirectSlug: string | null
}

async function fetchScenarioDetail(scenarioSlug: string): Promise<ScenarioDetailData | null> {
  // 1. organization_scenariosからslugで検索
  let masterId: string | null = null
  const { data: orgScenarios } = await supabase
    .from('organization_scenarios')
    .select('scenario_master_id')
    .eq('slug', scenarioSlug)
    .limit(1)
  if (orgScenarios?.[0]) masterId = orgScenarios[0].scenario_master_id

  let useLegacyTable = false

  // 2. UUIDとしてIDで検索
  if (!masterId) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidPattern.test(scenarioSlug)) {
      const { data: masterById } = await supabase.from('scenario_masters').select('id').eq('id', scenarioSlug).limit(1)
      if (masterById?.[0]) {
        masterId = masterById[0].id
      } else {
        const { data: legacyById } = await supabase.from('organization_scenarios').select('scenario_master_id').eq('id', scenarioSlug).limit(1)
        if (legacyById?.[0]) { masterId = legacyById[0].scenario_master_id; useLegacyTable = true }
      }
    }
  }

  // 3. fallback
  if (!masterId) {
    const { data: legacyScenario } = await supabase.from('organization_scenarios').select('scenario_master_id').eq('slug', scenarioSlug).limit(1)
    if (legacyScenario?.[0]) { masterId = legacyScenario[0].scenario_master_id; useLegacyTable = true }
  }

  if (!masterId) return null

  // シナリオ詳細取得
  let masterData: any = null
  if (!useLegacyTable) {
    const { data, error } = await supabase
      .from('scenario_masters')
      .select('id, title, author, author_id, key_visual_url, description, player_count_min, player_count_max, official_duration, genre, synopsis, caution, required_items, master_status, created_at, updated_at, gallery_images')
      .eq('id', masterId)
      .limit(1)
    if (!error && data?.[0]) masterData = data[0]
  }
  if (!masterData) {
    const { data: legacyData, error: legacyError } = await supabase
      .from('organization_scenarios_with_master')
      .select('id, org_scenario_id, title, slug, description, key_visual_url, duration, player_count_min, player_count_max, organization_id, author, genre, participation_fee, synopsis')
      .eq('scenario_master_id', masterId)
      .limit(1)
      .maybeSingle()
    if (legacyError || !legacyData) return null
    masterData = {
      id: legacyData.id, title: legacyData.title, slug: legacyData.slug, description: legacyData.description,
      key_visual_url: legacyData.key_visual_url, official_duration: legacyData.duration,
      player_count_min: legacyData.player_count_min, player_count_max: legacyData.player_count_max,
      author: legacyData.author || '不明', organization_id: legacyData.organization_id,
      genre: legacyData.genre || [], participation_fee: legacyData.participation_fee,
      synopsis: legacyData.synopsis, has_pre_reading: false, gm_comment: null
    }
    useLegacyTable = true
  }

  // キャラクター取得
  let characters: ScenarioCharacter[] = []
  if (!useLegacyTable) {
    const { data: charData } = await supabase.from('scenario_characters').select('id, name, description, image_url, sort_order').eq('scenario_master_id', masterId).eq('is_visible', true).order('sort_order', { ascending: true })
    if (charData?.length) {
      characters = charData
    } else {
      const { data: orgScenarioRows } = await supabase.from('organization_scenarios').select('characters').eq('scenario_master_id', masterId).not('characters', 'is', null).limit(1)
      if (orgScenarioRows?.[0]?.characters && Array.isArray(orgScenarioRows[0].characters)) characters = orgScenarioRows[0].characters as ScenarioCharacter[]
    }
  } else {
    const { data: orgScenarioRows } = await supabase.from('organization_scenarios').select('characters').eq('scenario_master_id', masterId).not('characters', 'is', null).limit(1)
    if (orgScenarioRows?.[0]?.characters && Array.isArray(orgScenarioRows[0].characters)) characters = orgScenarioRows[0].characters as ScenarioCharacter[]
  }

  // 組織マップ構築
  const orgMap: Record<string, { slug: string; name: string }> = {}
  if (useLegacyTable) {
    if (masterData.organization_id) {
      const { data: orgData } = await supabase.from('organizations').select('id, slug, name').eq('id', masterData.organization_id).single()
      if (orgData) orgMap[orgData.id] = { slug: orgData.slug, name: orgData.name }
    }
  } else {
    const { data: relatedScenarios } = await supabase.from('organization_scenarios').select('organization_id').eq('scenario_master_id', masterId)
    const orgIds = [...new Set(relatedScenarios?.map(s => s.organization_id).filter(Boolean) || [])]
    if (orgIds.length > 0) {
      const { data: orgsData } = await supabase.from('organizations').select('id, slug, name').in('id', orgIds)
      orgsData?.forEach((org: any) => { orgMap[org.id] = { slug: org.slug, name: org.name } })
    }
    const { data: availableOrgScenarios } = await supabase.from('organization_scenarios').select('id, organization_id, organizations!inner (id, slug, name)').eq('scenario_master_id', masterId).eq('org_status', 'available')
    availableOrgScenarios?.forEach((os: any) => {
      if (os.organizations && !orgMap[os.organization_id]) orgMap[os.organization_id] = { slug: os.organizations.slug, name: os.organizations.name }
    })
  }

  // 貸切可能組織リスト・リダイレクトslug
  let redirectSlug: string | null = null
  const availableOrgs: Array<{ id: string; slug: string; name: string; scenarioId: string }> = []

  if (!useLegacyTable) {
    const { data: relatedScenarios } = await supabase.from('organization_scenarios').select('id, organization_id, slug').eq('scenario_master_id', masterId).eq('org_status', 'available')
    if (relatedScenarios?.length) {
      const firstWithSlug = relatedScenarios.find(s => s.slug)
      if (firstWithSlug) redirectSlug = firstWithSlug.slug
      relatedScenarios.forEach(s => {
        const org = s.organization_id ? orgMap[s.organization_id] : null
        if (org && !availableOrgs.some(o => o.id === s.organization_id)) {
          availableOrgs.push({ id: s.organization_id, slug: org.slug, name: org.name, scenarioId: s.id })
        }
      })
    }
  } else if (masterData.organization_id && orgMap[masterData.organization_id]) {
    const org = orgMap[masterData.organization_id]
    availableOrgs.push({ id: masterData.organization_id, slug: org.slug, name: org.name, scenarioId: masterId })
  }

  // 公演取得
  const today = new Date().toISOString().split('T')[0]
  const { data: eventData, error: eventError } = await supabase
    .from('schedule_events_public')
    .select('id, date, start_time, time_slot, current_participants, max_participants, capacity, organization_id, store_id, is_reservation_enabled, is_private_booking')
    .eq('scenario_master_id', masterId)
    .gte('date', today)
    .in('category', ['open', 'offsite'])
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(50)
  if (eventError) logger.error('Failed to fetch events:', eventError)

  const storeIds = [...new Set((eventData || []).map((e: any) => e.store_id).filter(Boolean))]
  const storeMap: Record<string, { id: string; name: string; short_name: string; color: string | null; region: string | null }> = {}
  if (storeIds.length > 0) {
    const { data: storesData } = await supabase.from('stores_public').select('id, name, short_name, color, region').in('id', storeIds)
    storesData?.forEach((s: any) => { storeMap[s.id] = s })
  }

  const events: EventWithOrg[] = (eventData || [])
    .filter((e: any) => e.is_private_booking !== true && e.is_reservation_enabled !== false)
    .map((e: any) => {
      const store = storeMap[e.store_id] || null
      const org = e.organization_id ? orgMap[e.organization_id] : null
      return {
        id: e.id, date: e.date, start_time: e.start_time || '', time_slot: e.time_slot || '',
        current_participants: e.current_participants || 0,
        player_count_max: e.max_participants ?? e.capacity ?? masterData.player_count_max,
        organization_id: e.organization_id || '', organization_slug: org?.slug || '', organization_name: org?.name || '不明',
        store_id: store?.id || '', store_name: store?.name || '', store_short_name: store?.short_name || store?.name || '',
        store_color: store?.color || null, store_region: store?.region || null,
      }
    })
    .filter((e: EventWithOrg) => e.organization_slug)

  return {
    scenario: masterData as ScenarioMaster,
    events,
    characters,
    availableOrganizations: availableOrgs,
    favoriteScenarioId: masterId,
    redirectSlug,
  }
}

async function checkIsPlayed(email: string, scenarioId: string): Promise<boolean> {
  const { data: customer } = await supabase.from('customers').select('id').eq('email', email).maybeSingle()
  if (!customer) return false
  const { data: reservation } = await supabase.from('reservations').select('id').eq('customer_id', customer.id).eq('scenario_master_id', scenarioId).in('status', ['confirmed', 'gm_confirmed']).lte('requested_datetime', new Date().toISOString()).limit(1).maybeSingle()
  if (reservation) return true
  const { data: manual } = await supabase.from('manual_play_history').select('id').eq('customer_id', customer.id).eq('scenario_master_id', scenarioId).limit(1).maybeSingle()
  return !!manual
}

export function ScenarioDetailGlobal({ scenarioSlug, onClose }: ScenarioDetailGlobalProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false)
  const [isEventsExpanded, setIsEventsExpanded] = useState(false)
  const [isPlayedDialogOpen, setIsPlayedDialogOpen] = useState(false)
  const [playedDate, setPlayedDate] = useState('')
  const [playedOverride, setPlayedOverride] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['scenario-detail-global', scenarioSlug],
    queryFn: () => fetchScenarioDetail(scenarioSlug),
  })

  const { data: isPlayedFromServer } = useQuery({
    queryKey: ['scenario-is-played', user?.email, data?.scenario?.id],
    enabled: !!user?.email && !!data?.scenario?.id,
    queryFn: () => checkIsPlayed(user!.email!, data!.scenario.id),
  })

  const isPlayed = playedOverride || isPlayedFromServer || false

  const submitPlayedMutation = useMutation({
    mutationFn: async () => {
      if (!user?.email || !data?.scenario) throw new Error('データが不足しています')
      const { data: customer } = await supabase.from('customers').select('id').eq('email', user.email).maybeSingle()
      if (!customer) throw new Error('顧客情報が見つかりません')
      const manualCount = await countManualPlayHistoryForCustomer(customer.id)
      if (isManualPlayHistoryAtCap(manualCount)) throw new Error(`手動のプレイ履歴は最大${MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER}件まで登録できます`)
      const { error } = await supabase.from('manual_play_history').insert({
        customer_id: customer.id, scenario_title: data.scenario.title, scenario_master_id: data.scenario.id, played_at: playedDate || null, venue: null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setPlayedOverride(true)
      setIsPlayedDialogOpen(false)
      showToast.success('体験済みに登録しました')
    },
    onError: (error: any) => {
      logger.error('体験済み登録エラー:', error)
      showToast.error(error.message || '登録に失敗しました')
    },
  })

  // URLがUUIDでslugが存在する場合にリダイレクト
  useEffect(() => {
    if (!data?.redirectSlug) return
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidPattern.test(scenarioSlug)) {
      const searchParams = new URLSearchParams(window.location.search)
      const queryString = searchParams.toString()
      navigate(`/scenario/${data.redirectSlug}${queryString ? '?' + queryString : ''}`, { replace: true })
    }
  }, [data?.redirectSlug, scenarioSlug, navigate])

  useReportRouteScrollRestoration('scenario-detail-global', { isLoading })

  const { scenario, events = [], characters = [], availableOrganizations = [], favoriteScenarioId } = data ?? {}

  const eventsByOrg = useMemo(() => {
    const grouped: Record<string, { org: { slug: string; name: string }; events: EventWithOrg[] }> = {}
    events.forEach(e => {
      if (!grouped[e.organization_id]) grouped[e.organization_id] = { org: { slug: e.organization_slug, name: e.organization_name }, events: [] }
      grouped[e.organization_id].events.push(e)
    })
    return Object.values(grouped)
  }, [events])

  const eventsWithinMonth = events.slice(0, 10)
  const eventsAfterMonth = events.slice(10)

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    const dayOfWeek = d.getDay()
    return { full: `${d.getMonth() + 1}/${d.getDate()}(${weekdays[dayOfWeek]})`, isSunday: dayOfWeek === 0, isSaturday: dayOfWeek === 6 }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0 && mins > 0) return `${hours}時間${mins}分`
    if (hours > 0) return `${hours}時間`
    return `${minutes}分`
  }

  const formatPlayerCount = (min: number, max: number) => min === max ? `${max}人` : `${min}〜${max}人`

  const handleEventClick = (event: EventWithOrg) => {
    saveScrollPositionForCurrentUrl()
    navigate(`/${event.organization_slug}/scenario/${scenarioSlug}?date=${event.date}`)
  }

  const handleFavoriteClick = () => {
    if (favoriteScenarioId) toggleFavorite(favoriteScenarioId)
    else if (scenario) toggleFavorite(scenario.id)
  }

  const handlePlayedClick = () => {
    if (!user) { showToast.error('ログインが必要です'); return }
    if (isPlayed) { showToast.info('既に体験済みとして登録されています'); return }
    setPlayedDate(new Date().toISOString().split('T')[0])
    setIsPlayedDialogOpen(true)
  }

  const synopsisLength = scenario?.synopsis?.length || 0
  const shouldTruncateSynopsis = synopsisLength > 200

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: THEME.background }}>
        <Header />
        <section className="relative overflow-hidden" style={{ backgroundColor: THEME.primary }}>
          <div className="max-w-6xl mx-auto px-4 py-4 relative">
            <button onClick={() => onClose ? onClose() : navigate(-1)} className="flex items-center gap-2 text-white/90 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /><span>戻る</span>
            </button>
          </div>
        </section>
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-t-transparent rounded-full" style={{ borderColor: `${THEME.primary} transparent ${THEME.primary} ${THEME.primary}` }} />
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
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-white/90 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /><span>戻る</span>
            </button>
          </div>
        </section>
        <div className="flex-1 max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{data === null ? 'シナリオが見つかりません' : 'データの読み込みに失敗しました'}</h1>
          <Button onClick={() => navigate('/')}>トップへ戻る</Button>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: THEME.background }}>
      <Header />

      <section className="relative overflow-hidden" style={{ backgroundColor: THEME.primary }}>
        <div className="absolute top-0 right-0 w-64 h-64 opacity-20" style={{ background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 left-0 w-1 h-16" style={{ backgroundColor: THEME.accent }} />
        <div className="max-w-6xl mx-auto px-4 py-4 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => onClose ? onClose() : navigate(-1)} className="flex items-center gap-2 text-white/90 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" /><span>戻る</span>
              </button>
              <div className="h-4 w-px bg-white/30" />
              <span className="text-sm text-white/80">シナリオ詳細</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex-1 max-w-6xl mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-4">
              <div className="relative">
                {scenario.key_visual_url ? (
                  <img src={scenario.key_visual_url} alt={scenario.title} className="w-full shadow-lg" style={{ borderRadius: 0 }} />
                ) : (
                  <div className="w-full aspect-[3/4] bg-gray-200 flex items-center justify-center" style={{ borderRadius: 0 }}>
                    <Sparkles className="w-12 h-12 text-gray-300" />
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-200 p-4" style={{ borderRadius: 0 }}>
                <h4 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
                  <Info className="w-4 h-4" style={{ color: THEME.primary }} />シナリオ情報
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-gray-400" />
                    <div><span className="text-xs text-gray-500">プレイ人数</span><p className="font-medium text-gray-900">{formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}</p></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <div><span className="text-xs text-gray-500">プレイ時間</span><p className="font-medium text-gray-900">{formatDuration(scenario.official_duration)}</p></div>
                  </div>
                  {scenario.participation_fee && (
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 text-gray-400 text-center font-bold">¥</span>
                      <div><span className="text-xs text-gray-500">参加費</span><p className="font-medium text-gray-900">¥{scenario.participation_fee.toLocaleString()}〜</p></div>
                    </div>
                  )}
                </div>
                {scenario.has_pre_reading && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 px-3 py-2">
                      <AlertCircle className="w-4 h-4" /><span>事前読み込みあり</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                {scenario.author && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium px-2 py-0.5 bg-gray-100 text-gray-700">作者</span>
                    <span className="text-gray-700">{scenario.author}</span>
                  </div>
                )}
                {user && (
                  <div className="flex items-center gap-2">
                    <button onClick={handlePlayedClick} className="flex items-center gap-1 px-2 py-1 transition-colors hover:bg-green-50 rounded" title={isPlayed ? '体験済み' : '体験済みに登録'}>
                      <CheckCheck className={`h-5 w-5 ${isPlayed ? 'text-green-500' : 'text-gray-400'}`} />
                      <span className="text-xs text-gray-500">{isPlayed ? '体験済み' : '体験した'}</span>
                    </button>
                    <button onClick={handleFavoriteClick} className="flex items-center gap-1 px-2 py-1 transition-colors hover:bg-red-50 rounded">
                      <Heart className={`h-5 w-5 fill-current text-red-500 ${isFavorite(favoriteScenarioId || scenario.id) ? 'opacity-100' : 'opacity-30'}`} />
                      <span className="text-xs text-gray-500">{isFavorite(favoriteScenarioId || scenario.id) ? '登録済み' : '遊びたい'}</span>
                    </button>
                  </div>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{scenario.title}</h1>
              <div className="flex flex-wrap items-center gap-2">
                {scenario.genre?.map((g, i) => (
                  <Badge key={i} variant="outline" className="text-xs px-2.5 py-1" style={{ borderColor: THEME.primary, color: THEME.primary }}>{g}</Badge>
                ))}
                {scenario.has_pre_reading && (
                  <Badge className="text-xs px-2.5 py-1 flex items-center gap-1 bg-blue-100 text-blue-700">
                    <AlertCircle className="w-3 h-3" />事前読み込みあり
                  </Badge>
                )}
              </div>
            </div>

            {scenario.description && (
              <div className="bg-white border border-gray-200" style={{ borderRadius: 0 }}>
                <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2" style={{ backgroundColor: '#374151' }}>
                  <Info className="w-4 h-4 text-white" /><h3 className="font-semibold text-white text-sm">概要</h3>
                </div>
                <div className="p-4"><p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">{scenario.description}</p></div>
              </div>
            )}

            {scenario.synopsis && (
              <div className="bg-gray-50 border border-gray-200" style={{ borderRadius: 0 }}>
                <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2" style={{ backgroundColor: THEME.primary }}>
                  <BookOpen className="w-4 h-4 text-white" /><h3 className="font-semibold text-white text-sm">あらすじ</h3>
                </div>
                <div className="p-4">
                  <div className={`relative ${!isSynopsisExpanded && shouldTruncateSynopsis ? 'max-h-40 overflow-hidden' : ''}`}>
                    <p className="leading-relaxed whitespace-pre-wrap text-sm text-gray-700">{scenario.synopsis}</p>
                    {!isSynopsisExpanded && shouldTruncateSynopsis && <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-gray-50 to-transparent" />}
                  </div>
                  {shouldTruncateSynopsis && (
                    <button onClick={() => setIsSynopsisExpanded(!isSynopsisExpanded)} className="mt-3 flex items-center gap-1 text-sm font-medium transition-colors" style={{ color: THEME.primary }}>
                      {isSynopsisExpanded ? '閉じる' : '続きを読む'}<ChevronDown className={`w-4 h-4 transition-transform ${isSynopsisExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {scenario.gm_comment && (
              <div className="bg-amber-50 border border-amber-200" style={{ borderRadius: 0 }}>
                <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2" style={{ backgroundColor: '#f59e0b' }}>
                  <MessageSquare className="w-4 h-4 text-white" /><h3 className="font-semibold text-white text-sm">GMからのコメント</h3>
                </div>
                <div className="p-4"><p className="text-amber-900 whitespace-pre-wrap leading-relaxed text-sm italic">"{scenario.gm_comment}"</p></div>
              </div>
            )}

            {characters.length > 0 && (
              <div className="bg-white border border-gray-200" style={{ borderRadius: 0 }}>
                <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2" style={{ backgroundColor: THEME.primary }}>
                  <Users className="w-4 h-4 text-white" /><h3 className="font-semibold text-white text-sm">登場キャラクター</h3><span className="text-white/70 text-xs">({characters.length}人)</span>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {[...characters].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((char, index) => (
                      <div key={char.id ?? index} className={`flex flex-col ${char.is_npc ? 'ring-2 ring-amber-300' : ''}`} style={{ borderRadius: 0 }}>
                        <div className="relative w-full overflow-hidden" style={{ borderRadius: 0 }}>
                          {char.image_url ? (
                            <div className="w-full aspect-[3/4] overflow-hidden" style={{ backgroundColor: char.background_color || '#e5e7eb' }}>
                              <img src={char.image_url} alt={char.name} className="w-full h-full object-cover" style={{ objectPosition: char.image_position ? (char.image_position.includes(' ') ? `${char.image_position.split(' ')[0]}% ${char.image_position.split(' ')[1]}%` : `center ${char.image_position}`) : '50% 50%', transform: char.image_scale ? `scale(${char.image_scale / 100})` : undefined }} />
                            </div>
                          ) : (
                            <div className="w-full aspect-[3/4] bg-gray-200 flex items-center justify-center"><Users className="w-10 h-10 text-gray-400" /></div>
                          )}
                          {char.is_npc && <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-sm shadow z-[1]">NPC</span>}
                          <div className="absolute bottom-0 left-0 right-0 px-2 pt-6 pb-2" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)' }}>
                            <p className="font-semibold text-white text-xs leading-tight drop-shadow">{char.name}{char.first_person && <span className="ml-1 font-normal text-white/70">（{char.first_person}）</span>}</p>
                            {(char.age || char.occupation) && <p className="text-[10px] text-white/80 mt-0.5 leading-tight">{[char.age, char.occupation].filter(Boolean).join(' / ')}</p>}
                          </div>
                        </div>
                        {char.description && (
                          <div className="px-2 py-2 bg-zinc-900 border-t border-zinc-800">
                            <p className="text-[10px] text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">{char.description}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200" style={{ borderRadius: 0 }}>
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between" style={{ backgroundColor: THEME.primary }}>
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-white" /><h3 className="font-semibold text-white text-sm">公演日程</h3></div>
                <span className="text-white/70 text-xs">直近{eventsWithinMonth.length}件 / 全{events.length}件</span>
              </div>
              <div className="p-4">
                {events.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">現在予定されている公演はありません</p>
                ) : (
                  <div className="space-y-3">
                    {eventsWithinMonth.length > 0 ? (
                      <div className="space-y-2">
                        {eventsWithinMonth.map(event => {
                          const dateInfo = formatDate(event.date)
                          const available = getAvailableSeats({ current_participants: event.current_participants }, event.player_count_max)
                          const isFull = available <= 0
                          return (
                            <div key={event.id} className={`flex items-center justify-between p-3 border cursor-pointer transition-all ${isFull ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50 hover:shadow-sm'}`} style={{ borderRadius: 0 }} onClick={() => handleEventClick(event)}>
                              <div className="flex items-center gap-3">
                                <span className="w-1 h-10 flex-shrink-0" style={{ backgroundColor: event.store_color ? getColorFromName(event.store_color) : THEME.primary }} />
                                <div>
                                  <div className={`font-medium ${dateInfo.isSunday ? 'text-red-600' : dateInfo.isSaturday ? 'text-blue-600' : 'text-gray-900'}`}>
                                    {dateInfo.full}{event.start_time && <span className="ml-2 font-normal text-gray-600">{event.start_time.slice(0, 5)}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 text-sm text-gray-500"><Building2 className="w-3 h-3" /><span>{event.organization_name}</span><MapPin className="w-3 h-3" /><span>{event.store_short_name}</span></div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {isFull ? <span className="text-sm text-gray-500">満席</span> : <span className={`text-sm font-medium ${available <= 2 ? 'text-red-600' : 'text-gray-600'}`}>残り{available}席</span>}
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 bg-gray-50 text-muted-foreground">現在予定されている公演はありません</div>
                    )}

                    {eventsAfterMonth.length > 0 && (
                      <div className="mt-4">
                        <Button variant="outline" onClick={() => setIsEventsExpanded(!isEventsExpanded)} className="w-full gap-2" style={{ borderRadius: 0 }}>
                          {isEventsExpanded ? <><ChevronUp className="w-4 h-4" />閉じる</> : <><ChevronDown className="w-4 h-4" />残りの公演を見る（{eventsAfterMonth.length}件）</>}
                        </Button>
                        {isEventsExpanded && (
                          <div className="mt-3 space-y-2">
                            {eventsAfterMonth.map(event => {
                              const dateInfo = formatDate(event.date)
                              const available = getAvailableSeats({ current_participants: event.current_participants }, event.player_count_max)
                              const isFull = available <= 0
                              return (
                                <div key={event.id} className={`flex items-center justify-between p-3 border cursor-pointer transition-all ${isFull ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50 hover:shadow-sm'}`} style={{ borderRadius: 0 }} onClick={() => handleEventClick(event)}>
                                  <div className="flex items-center gap-3">
                                    <span className="w-1 h-10 flex-shrink-0" style={{ backgroundColor: event.store_color ? getColorFromName(event.store_color) : THEME.primary }} />
                                    <div>
                                      <div className={`font-medium ${dateInfo.isSunday ? 'text-red-600' : dateInfo.isSaturday ? 'text-blue-600' : 'text-gray-900'}`}>
                                        {dateInfo.full}{event.start_time && <span className="ml-2 font-normal text-gray-600">{event.start_time.slice(0, 5)}</span>}
                                      </div>
                                      <div className="flex items-center gap-2 text-sm text-gray-500"><Building2 className="w-3 h-3" /><span>{event.organization_name}</span><MapPin className="w-3 h-3" /><span>{event.store_short_name}</span></div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {isFull ? <span className="text-sm text-gray-500">満席</span> : <span className={`text-sm font-medium ${available <= 2 ? 'text-red-600' : 'text-gray-600'}`}>残り{available}席</span>}
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

            {(eventsByOrg.length > 0 || availableOrganizations.length > 0) && (
              <div className="bg-white border border-gray-200" style={{ borderRadius: 0 }}>
                <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2" style={{ backgroundColor: THEME.primary }}>
                  <Building2 className="w-4 h-4 text-white" /><h3 className="font-semibold text-white text-sm">遊べる店舗</h3>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {eventsByOrg.map(({ org, events: orgEvents }) => {
                      const orgInfo = availableOrganizations.find(o => o.slug === org.slug)
                      return (
                        <div key={org.slug} className="p-4 border border-gray-200" style={{ borderRadius: 0 }}>
                          <div className="mb-3"><h4 className="font-medium text-gray-900">{org.name}</h4><p className="text-sm text-gray-500">{orgEvents.length}件の公演予定</p></div>
                          <div className="flex gap-2">
                            <button onClick={() => { saveScrollPositionForCurrentUrl(); navigate(`/${org.slug}`) }} className="flex-1 py-2 px-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2" style={{ borderRadius: 0 }}>
                              <Building2 className="w-4 h-4" />店舗トップ
                            </button>
                            {orgInfo && (
                              <button onClick={() => { saveScrollPositionForCurrentUrl(); navigate(`/${org.slug}/scenario/${scenarioSlug}?tab=private`) }} className="flex-1 py-2 px-3 text-sm text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors flex items-center justify-center gap-2" style={{ borderRadius: 0 }}>
                                <Calendar className="w-4 h-4" />貸切リクエスト
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {availableOrganizations.filter(org => !eventsByOrg.some(e => e.org.slug === org.slug)).map(org => (
                      <div key={org.slug} className="p-4 border border-gray-200" style={{ borderRadius: 0 }}>
                        <div className="mb-3"><h4 className="font-medium text-gray-900">{org.name}</h4><p className="text-sm text-gray-500">公演予定なし</p></div>
                        <div className="flex gap-2">
                          <button onClick={() => { saveScrollPositionForCurrentUrl(); navigate(`/${org.slug}`) }} className="flex-1 py-2 px-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2" style={{ borderRadius: 0 }}>
                            <Building2 className="w-4 h-4" />店舗トップ
                          </button>
                          <button onClick={() => { saveScrollPositionForCurrentUrl(); navigate(`/${org.slug}/scenario/${scenarioSlug}?tab=private`) }} className="flex-1 py-2 px-3 text-sm text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors flex items-center justify-center gap-2" style={{ borderRadius: 0 }}>
                            <Calendar className="w-4 h-4" />貸切リクエスト
                          </button>
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

      <Dialog open={isPlayedDialogOpen} onOpenChange={setIsPlayedDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>体験済みに登録</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="text-sm text-muted-foreground">「{scenario?.title}」を体験済みに登録します。</div>
            <div className="space-y-2">
              <Label>体験日（任意）</Label>
              <SingleDatePopover date={playedDate} onDateChange={(date) => setPlayedDate(date || '')} placeholder="日付を選択" />
            </div>
            <Button onClick={() => submitPlayedMutation.mutate()} disabled={submitPlayedMutation.isPending} className="w-full">
              {submitPlayedMutation.isPending ? '登録中...' : '登録する'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * MMQ プラットフォームトップページ
 * @path /
 * @purpose 顧客向けトップページ - シャープデザイン
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { formatDateJST } from '@/utils/dateUtils'
import { formatJstDateJa } from '@/utils/jstDate'
import { Search, ChevronRight, ChevronDown, ChevronUp, Sparkles, Building2, Calendar, Filter, Flame, FileText, X, RefreshCw, HelpCircle } from 'lucide-react'
import { Footer } from '@/components/layout/Footer'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import { PlayedRegistrationDialog } from '@/components/modals/PlayedRegistrationDialog'
import { showToast } from '@/utils/toast'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { ScenarioCard, type ScenarioCardData } from '@/pages/PublicBookingTop/components/ScenarioCard'
import { getAvailableSeats } from '@/lib/participantUtils'

interface ScenarioWithEvents extends ScenarioCardData {
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
    current_participants?: number
    is_confirmed?: boolean
    region?: string
  }>
}

interface Organization {
  id: string
  slug: string
  display_name: string
  logo_url?: string
}

interface StoreWithOrg {
  id: string
  name: string
  short_name: string
  region?: string
  address?: string
  organization_id: string
  organization_slug?: string
  organization_name?: string
}

interface BlogPostSummary {
  id: string
  title: string
  slug: string
  excerpt?: string | null
  cover_image_url?: string | null
  published_at: string
  organization_name?: string
}

interface PlatformTopData {
  scenariosWithEvents: ScenarioWithEvents[]
  organizations: Organization[]
  stores: StoreWithOrg[]
  blogPosts: BlogPostSummary[]
}

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

const PLATFORM_TOP_AFTER14_EXPANDED_KEY = 'platform-top-lineup-after14-expanded'
const PLATFORM_TOP_SNAPSHOT_KEY = 'platform-top-display-v1'
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function isBrowserReloadNavigation(): boolean {
  if (typeof performance === 'undefined') return false
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return nav?.type === 'reload'
}

function readSnapshot(): { data: PlatformTopData; savedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(PLATFORM_TOP_SNAPSHOT_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { v: number; savedAt: number; data: PlatformTopData }
    if (o.v !== 1 || !Array.isArray(o.data?.scenariosWithEvents)) return null
    if (typeof o.savedAt !== 'number' || Date.now() - o.savedAt > SNAPSHOT_MAX_AGE_MS) return null
    return { data: o.data, savedAt: o.savedAt }
  } catch {
    return null
  }
}

function writeSnapshot(data: PlatformTopData): void {
  try {
    sessionStorage.setItem(PLATFORM_TOP_SNAPSHOT_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), data }))
  } catch { /* 容量超過等は無視 */ }
}

async function fetchPlatformTopData(): Promise<PlatformTopData> {
  const today = formatDateJST(new Date())

  const [orgResult, storeResult, masterResult, eventResult, reservationResult, orgScenarioSlugResult] = await Promise.all([
    supabase.from('organizations').select('id, slug, name, logo_url').eq('is_active', true).order('name'),
    supabase.from('stores').select('id, name, short_name, region, address, organization_id').eq('status', 'active').or('is_temporary.is.null,is_temporary.eq.false').neq('ownership_type', 'office').order('region', { ascending: true }).order('name', { ascending: true }),
    supabase.from('scenario_masters').select('id').eq('master_status', 'approved'),
    supabase.from('schedule_events').select(`id, date, start_time, current_participants, max_participants, organization_id, scenario_masters:scenario_master_id!inner (id, title, key_visual_url, player_count_min, player_count_max, official_duration, author), stores:store_id (id, name, short_name, color, region)`).gte('date', today).in('category', ['open', 'offsite']).eq('is_cancelled', false).eq('is_reservation_enabled', true).order('date', { ascending: true }).limit(200),
    supabase.from('reservations').select('schedule_event_id, participant_count, status').gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).in('status', ['confirmed', 'pending', 'checked_in']),
    supabase.from('organization_scenarios').select('scenario_master_id, slug').not('slug', 'is', null),
  ])

  const { data: orgData, error: orgError } = orgResult
  const { data: storeData, error: storeError } = storeResult
  const { data: approvedMasters, error: masterError } = masterResult
  const { data: eventData, error: eventError } = eventResult
  const { data: reservations } = reservationResult
  const { data: orgScenarioSlugs } = orgScenarioSlugResult

  if (orgError) logger.error('組織取得エラー:', orgError)
  if (storeError) logger.error('店舗取得エラー:', storeError)
  if (masterError) logger.error('マスタ取得エラー:', masterError)

  const masterSlugMap: Record<string, string> = {}
  orgScenarioSlugs?.forEach(os => {
    if (os.scenario_master_id && os.slug) masterSlugMap[os.scenario_master_id] = os.slug
  })

  const orgMap: Record<string, { slug: string; name: string }> = {}
  orgData?.forEach(o => { orgMap[o.id] = { slug: o.slug, name: o.name } })

  const organizations: Organization[] = orgData?.map(o => ({
    id: o.id, slug: o.slug, display_name: o.name, logo_url: o.logo_url || undefined
  })) ?? []

  const stores: StoreWithOrg[] = storeData
    ?.filter(s => s.organization_id && orgMap[s.organization_id])
    .map(s => ({ ...s, organization_slug: orgMap[s.organization_id!]?.slug, organization_name: orgMap[s.organization_id!]?.name })) ?? []

  const approvedMasterIds = new Set(approvedMasters?.map(m => m.id) || [])

  const participantsMap: Record<string, number> = {}
  reservations?.forEach(r => {
    if (r.schedule_event_id) participantsMap[r.schedule_event_id] = (participantsMap[r.schedule_event_id] || 0) + (r.participant_count || 1)
  })

  const scenarioMap: Record<string, ScenarioWithEvents> = {}
  if (eventData) {
    eventData.forEach(e => {
      const scenarioData = e.scenario_masters as unknown as { id: string; title: string; key_visual_url?: string | null; genre?: string[]; author?: string; player_count_min: number; player_count_max: number; official_duration: number } | null
      const store = e.stores as unknown as { id: string; name: string; short_name?: string; color?: string; region?: string } | null
      if (!scenarioData || !store) return
      if (!e.organization_id || !orgMap[e.organization_id]) return

      const nowForFilter = new Date()
      const nowJSTForFilter = new Date(nowForFilter.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
      const todayJSTStr = formatDateJST(nowForFilter)
      if (e.date === todayJSTStr && e.start_time) {
        const [h, m] = e.start_time.split(':').map(Number)
        if (h < nowJSTForFilter.getHours() || (h === nowJSTForFilter.getHours() && m <= nowJSTForFilter.getMinutes())) return
      }

      if (!approvedMasterIds.has(scenarioData.id)) return

      const org = orgMap[e.organization_id || '']
      if (!org) return

      if (!scenarioMap[scenarioData.id]) {
        scenarioMap[scenarioData.id] = {
          scenario_id: scenarioData.id,
          scenario_title: scenarioData.title,
          scenario_slug: masterSlugMap[scenarioData.id] || scenarioData.id,
          key_visual_url: scenarioData.key_visual_url,
          author: scenarioData.author || '',
          player_count_min: scenarioData.player_count_min,
          player_count_max: scenarioData.player_count_max,
          duration: scenarioData.official_duration,
          organization_id: e.organization_id || '',
          organization_slug: org.slug,
          organization_name: org.name,
          next_events: [],
        }
      }

      if (scenarioMap[scenarioData.id].next_events.length < 10) {
        const currentParticipants = e.current_participants ?? 0
        const remainingSlots = getAvailableSeats(
          { current_participants: currentParticipants, max_participants: (e as any).max_participants },
          scenarioData.player_count_max
        )
        const isConfirmed = currentParticipants >= scenarioData.player_count_min && remainingSlots > 0
        scenarioMap[scenarioData.id].next_events.push({
          date: e.date,
          time: e.start_time || '',
          store_name: store.name,
          store_short_name: store.short_name || store.name,
          store_color: store.color,
          available_seats: remainingSlots,
          current_participants: currentParticipants,
          is_confirmed: isConfirmed,
          region: store.region,
        })
      }
    })
  }

  const scenariosWithEvents = Object.values(scenarioMap).sort((a, b) => {
    if (a.next_events.length > 0 && b.next_events.length === 0) return -1
    if (a.next_events.length === 0 && b.next_events.length > 0) return 1
    if (a.next_events.length > 0 && b.next_events.length > 0) return a.next_events[0].date.localeCompare(b.next_events[0].date)
    return a.scenario_title.localeCompare(b.scenario_title)
  })

  const { data: blogData } = await supabase
    .from('blog_posts')
    .select('id, title, slug, excerpt, cover_image_url, published_at, organization_id')
    .eq('is_published', true)
    .order('published_at', { ascending: false })
    .limit(3)

  const blogPosts: BlogPostSummary[] = blogData?.map(post => ({
    ...post, organization_name: orgMap[post.organization_id]?.name || ''
  })) ?? []

  return { scenariosWithEvents, organizations, stores, blogPosts }
}

export function PlatformTop() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { favorites, toggleFavorite } = useFavorites()
  const { isPlayed, customerId, markAsPlayed, unmarkAsPlayed } = usePlayedScenarios()
  const [playedDialogTarget, setPlayedDialogTarget] = useState<{ id: string; title: string } | null>(null)
  const [togglingPlayedIds, setTogglingPlayedIds] = useState<Set<string>>(new Set())
  const [selectedRegion, setSelectedRegion] = useState('all')
  const [isExpanded, setIsExpanded] = useState(() => {
    if (!isBrowserReloadNavigation()) return false
    try { return sessionStorage.getItem(PLATFORM_TOP_AFTER14_EXPANDED_KEY) === '1' } catch { return false }
  })

  const snapshot = readSnapshot()
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['platform-top'],
    queryFn: fetchPlatformTopData,
    initialData: snapshot?.data,
    initialDataUpdatedAt: snapshot?.savedAt,
    staleTime: 0,
  })

  // データ取得完了後にスナップショット保存
  useEffect(() => {
    if (!data || isFetching) return
    const empty = data.scenariosWithEvents.length === 0 && data.organizations.length === 0 && data.stores.length === 0
    if (empty) return
    writeSnapshot(data)
  }, [data, isFetching])

  // 展開状態をリロード前に保存
  useEffect(() => {
    const flush = () => {
      try { sessionStorage.setItem(PLATFORM_TOP_AFTER14_EXPANDED_KEY, isExpanded ? '1' : '0') } catch { /* ignore */ }
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    }
  }, [isExpanded])

  useReportRouteScrollRestoration('platform-top', { isLoading, isFetching })

  const toggleAfter14Expanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev
      try { sessionStorage.setItem(PLATFORM_TOP_AFTER14_EXPANDED_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }, [])

  const scenariosWithEvents = data?.scenariosWithEvents ?? []
  const organizations = data?.organizations ?? []
  const stores = data?.stores ?? []
  const blogPosts = data?.blogPosts ?? []

  const filteredScenarios = useMemo(() => {
    if (selectedRegion === 'all') return scenariosWithEvents
    return scenariosWithEvents
      .filter(s => s.next_events.some(e => e.region === selectedRegion))
      .map(s => ({ ...s, next_events: s.next_events.filter(e => e.region === selectedRegion) }))
  }, [scenariosWithEvents, selectedRegion])

  const nearlyConfirmed = useMemo(() => {
    const result: ScenarioWithEvents[] = []
    const addedScenarioIds = new Set<string>()
    filteredScenarios.forEach(scenario => {
      const nearlyFullEvent = scenario.next_events.find(e => e.available_seats > 0 && e.available_seats <= 3)
      if (nearlyFullEvent && !addedScenarioIds.has(scenario.scenario_id)) {
        addedScenarioIds.add(scenario.scenario_id)
        result.push({ ...scenario, next_events: [nearlyFullEvent, ...scenario.next_events.filter(e => e !== nearlyFullEvent)] })
      }
    })
    return result.sort((a, b) => (a.next_events?.[0]?.available_seats || 999) - (b.next_events?.[0]?.available_seats || 999))
  }, [filteredScenarios])

  const { withinTwoWeeks, afterTwoWeeks } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const twoWeeksEnd = new Date(today)
    twoWeeksEnd.setDate(twoWeeksEnd.getDate() + 14)
    const within: ScenarioWithEvents[] = []
    const after: ScenarioWithEvents[] = []
    filteredScenarios.forEach(scenario => {
      const nextEventDate = scenario.next_events?.[0]?.date
      if (nextEventDate) {
        const eventDate = new Date(nextEventDate + 'T00:00:00')
        if (eventDate < twoWeeksEnd) within.push(scenario)
        else after.push(scenario)
      }
    })
    return { withinTwoWeeks: within, afterTwoWeeks: after }
  }, [filteredScenarios])

  const storesByRegion = useMemo(() => {
    const grouped: Record<string, StoreWithOrg[]> = {}
    stores.forEach(store => {
      const region = store.region || 'その他'
      if (!grouped[region]) grouped[region] = []
      grouped[region].push(store)
    })
    const sortedRegions = Object.keys(grouped).sort((a, b) => {
      if (a === 'その他') return 1
      if (b === 'その他') return -1
      return a.localeCompare(b, 'ja')
    })
    return { grouped, sortedRegions }
  }, [stores])

  const handleFavoriteClick = (e: React.MouseEvent, scenarioId: string) => {
    e.stopPropagation()
    toggleFavorite(scenarioId)
  }

  const handlePlayedClick = (scenarioId: string, scenarioTitle: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user) { showToast.error('ログインが必要です'); return }
    if (isPlayed(scenarioId)) {
      if (togglingPlayedIds.has(scenarioId)) return
      setTogglingPlayedIds(prev => new Set(prev).add(scenarioId))
      unmarkAsPlayed(scenarioId)
        .then(() => showToast.success('未体験に戻しました'))
        .catch((error) => {
          logger.error('未体験変更エラー:', error)
          showToast.error('未体験への変更に失敗しました')
        })
        .finally(() => setTogglingPlayedIds(prev => {
          const next = new Set(prev)
          next.delete(scenarioId)
          return next
        }))
      return
    }
    setPlayedDialogTarget({ id: scenarioId, title: scenarioTitle })
  }

  const handleScenarioClick = (slugOrId: string, eventDate?: string, eventTime?: string) => {
    saveScrollPositionForCurrentUrl()
    const params = new URLSearchParams()
    if (eventDate) params.set('date', eventDate)
    if (eventTime) params.set('time', eventTime)
    const query = params.toString() ? `?${params.toString()}` : ''
    navigate(`/scenario/${slugOrId}${query}`)
  }

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: THEME.background }}>
      <Header />

      <section className="relative w-full overflow-hidden" style={{ backgroundColor: THEME.primary }}>
        <div className="absolute top-0 right-0 w-96 h-96 opacity-20" style={{ background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 left-0 w-2 h-14 md:h-24" style={{ backgroundColor: THEME.accent }} />
        <div className="max-w-7xl mx-auto px-4 py-7 sm:py-10 md:py-20 relative">
          <div className="text-center text-white">
            <h1 className="text-[1.625rem] leading-snug sm:text-3xl md:text-5xl font-bold mb-3 md:mb-4 tracking-tight">
              <span className="md:hidden">マーダーミステリー<br />予約するなら<br />MMQ</span>
              <span className="hidden md:inline">マーダーミステリー予約するなら MMQ</span>
            </h1>
            <p className="text-[0.9375rem] sm:text-lg md:text-xl opacity-90 mb-5 md:mb-8 max-w-2xl mx-auto leading-relaxed">
              <span className="md:hidden">全国の店舗から、<br />あなたにぴったりの物語を見つけよう</span>
              <span className="hidden md:inline">全国の店舗から、あなたにぴったりの物語を見つけよう</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <Button size="lg" className="bg-white hover:bg-gray-100 px-6 sm:px-8 h-12 sm:h-14 text-base sm:text-lg font-semibold shadow-lg hover:scale-[1.02] transition-transform" style={{ color: THEME.primary, borderRadius: 0 }} onClick={() => { saveScrollPositionForCurrentUrl(); navigate('/scenario') }}>
                <Search className="w-5 h-5 mr-2" />シナリオを探す
              </Button>
              {user ? (
                <Button size="lg" variant="ghost" className="border-2 border-white/50 text-white hover:bg-white/10 hover:text-white px-8 h-14 text-lg" style={{ borderRadius: 0 }} onClick={() => navigate('/mypage')}>マイページ</Button>
              ) : (
                <Button size="lg" variant="ghost" className="border-2 border-white/50 text-white hover:bg-white/10 hover:text-white px-8 h-14 text-lg" style={{ borderRadius: 0 }} onClick={() => navigate('/login')}>ログイン / 新規登録</Button>
              )}
              <Button size="lg" variant="ghost" className="border-2 border-white/50 text-white hover:bg-white/10 hover:text-white px-8 h-14 text-lg" style={{ borderRadius: 0 }} onClick={() => navigate('/guide')}>
                <HelpCircle className="w-5 h-5 mr-2" />はじめての方へ
              </Button>
            </div>
          </div>
        </div>
      </section>

      {!isLoading && nearlyConfirmed.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pt-8 md:pt-12">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-3">
              <Flame className="w-6 h-6 text-orange-500" />残りわずか<span className="w-12 h-1 ml-2" style={{ backgroundColor: '#f97316' }} /><span className="text-sm font-normal text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">お早めに！</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {nearlyConfirmed.map((scenario) => (
              <ScenarioCard key={`nearly-${scenario.scenario_id}`} scenario={scenario} onClick={(slugOrId) => { const e = scenario.next_events?.[0]; handleScenarioClick(slugOrId, e?.date, e?.time) }} isFavorite={favorites.has(scenario.scenario_id)} isPlayed={isPlayed(scenario.scenario_id)} onToggleFavorite={(id, e) => handleFavoriteClick(e, id)} onTogglePlayed={handlePlayedClick} organizationName={scenario.organization_name} />
            ))}
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Calendar className="w-6 h-6" style={{ color: THEME.primary }} />公演ラインナップ<span className="w-12 h-1 ml-2" style={{ backgroundColor: THEME.accent }} />
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="w-32" style={{ borderRadius: 0 }}><SelectValue placeholder="地域" /></SelectTrigger>
              <SelectContent>{REGIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" style={{ borderRadius: 0 }} disabled={isLoading || isFetching} onClick={() => { saveScrollPositionForCurrentUrl(); void refetch() }}>
              <RefreshCw className={`h-4 w-4 shrink-0 ${isFetching ? 'animate-spin' : ''}`} />更新
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-t-transparent" style={{ borderColor: `${THEME.primary} transparent ${THEME.primary} ${THEME.primary}` }} />
          </div>
        ) : filteredScenarios.length === 0 ? (
          <div className="text-center py-12 text-gray-500">該当する公演がありません</div>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-3">2週間以内の公演（{withinTwoWeeks.length}件）</p>
              {withinTwoWeeks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {withinTwoWeeks.map((scenario) => (
                    <ScenarioCard key={scenario.scenario_id} scenario={scenario} onClick={handleScenarioClick} isFavorite={favorites.has(scenario.scenario_id)} isPlayed={isPlayed(scenario.scenario_id)} onToggleFavorite={(id, e) => handleFavoriteClick(e, id)} onTogglePlayed={handlePlayedClick} organizationName={scenario.organization_name} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground bg-gray-50 rounded-lg"><p>2週間以内の公演予定はありません</p></div>
              )}
            </div>

            {afterTwoWeeks.length > 0 && (
              <div className="mt-6">
                <Button variant="outline" onClick={toggleAfter14Expanded} className="w-full gap-2" style={{ borderRadius: 0 }}>
                  {isExpanded ? <><ChevronUp className="w-4 h-4" />閉じる</> : <><ChevronDown className="w-4 h-4" />2週間より後の公演を見る（{afterTwoWeeks.length}件）</>}
                </Button>
                {isExpanded && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {afterTwoWeeks.map((scenario) => (
                      <ScenarioCard key={scenario.scenario_id} scenario={scenario} onClick={handleScenarioClick} isFavorite={favorites.has(scenario.scenario_id)} isPlayed={isPlayed(scenario.scenario_id)} onToggleFavorite={(id, e) => handleFavoriteClick(e, id)} onTogglePlayed={handlePlayedClick} organizationName={scenario.organization_name} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {filteredScenarios.length > 0 && (
          <div className="text-center mt-8">
            <Button variant="outline" className="inline-flex items-center gap-2 px-6 py-3 font-medium hover:scale-[1.02] transition-transform" style={{ borderColor: THEME.primary, color: THEME.primary, borderRadius: 0, borderWidth: 2 }} onClick={() => { saveScrollPositionForCurrentUrl(); navigate('/scenario') }}>
              すべてのシナリオを見る<ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </section>

      {stores.length > 0 && (
        <section className="bg-white py-8 md:py-12">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <Building2 className="w-6 h-6" style={{ color: THEME.primary }} />参加店舗<span className="w-12 h-1 ml-2" style={{ backgroundColor: THEME.accent }} /><span className="text-sm font-normal text-gray-500 ml-2">{stores.length}店舗</span>
            </h2>
            <div className="space-y-6">
              {storesByRegion.sortedRegions.map(region => (
                <div key={region}>
                  <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
                    <span className="w-1 h-4" style={{ backgroundColor: THEME.primary }} />{region}<span className="text-gray-400 font-normal">（{storesByRegion.grouped[region].length}店舗）</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {storesByRegion.grouped[region].map(store => (
                      <div key={store.id} className="bg-gray-50 p-3 border border-gray-100 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all" style={{ borderRadius: 0 }} onClick={() => store.organization_slug && navigate(`/${store.organization_slug}`)}>
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: THEME.primaryLight, borderRadius: 0 }}>
                            <Building2 className="w-5 h-5" style={{ color: THEME.primary }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 text-sm hover:underline">{store.name}</h4>
                            <p className="text-xs text-gray-500">{store.organization_name}</p>
                            {store.address && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{store.address}</p>}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {blogPosts.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <FileText className="w-6 h-6" style={{ color: THEME.primary }} />お知らせ<span className="w-12 h-1 ml-2" style={{ backgroundColor: THEME.primary }} />
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {blogPosts.map(post => (
              <article key={post.id} className="bg-white border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow" style={{ borderRadius: 0 }} onClick={() => navigate(`/blog/${post.slug}`)}>
                {post.cover_image_url && (
                  <div className="aspect-[16/9] bg-gray-100 overflow-hidden">
                    <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                    <Calendar className="w-3 h-3" />
                    {formatJstDateJa(post.published_at)}
                    {post.organization_name && <><span>•</span><span>{post.organization_name}</span></>}
                  </div>
                  <h3 className="font-bold text-gray-900 line-clamp-2 mb-2">{post.title}</h3>
                  {post.excerpt && <p className="text-sm text-gray-600 line-clamp-2">{post.excerpt}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <div className="relative overflow-hidden p-8 md:p-12 text-center text-white" style={{ backgroundColor: THEME.primary, borderRadius: 0 }}>
          <div className="absolute top-0 right-0 w-64 h-full" style={{ background: `linear-gradient(90deg, transparent 0%, ${THEME.accent}30 100%)` }} />
          <div className="absolute bottom-0 left-0 w-32 h-1" style={{ backgroundColor: THEME.accent }} />
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">今すぐシナリオを探そう</h2>
            <p className="opacity-90 mb-6 max-w-lg mx-auto">様々な店舗のマーダーミステリーを検索。<br />あなたにぴったりの物語を見つけましょう。</p>
            <Button size="lg" className="bg-white hover:bg-gray-100 px-8 hover:scale-[1.02] transition-transform" style={{ color: THEME.primary, borderRadius: 0 }} onClick={() => navigate('/scenario')}>
              シナリオを探す<ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      <Footer />

      {playedDialogTarget && (
        <PlayedRegistrationDialog open={!!playedDialogTarget} onOpenChange={(open) => { if (!open) setPlayedDialogTarget(null) }} scenarioTitle={playedDialogTarget.title} scenarioMasterId={playedDialogTarget.id} customerId={customerId} onRegistered={() => markAsPlayed(playedDialogTarget.id)} />
      )}
    </div>
  )
}

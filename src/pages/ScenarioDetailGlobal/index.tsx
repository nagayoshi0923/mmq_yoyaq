import { PageBar } from '@/components/renewal/PageBar'
import { usePlayedScenarios } from '@/hooks/usePlayedScenarios'
import { storeDisplayName } from '@/lib/publicStoreName'
import { registerPlayedScenario } from '@/lib/registerPlayedScenario'
import { publicBookingReadApi } from '@/lib/api/publicBookingReadApi'
import { storeHasRecruitmentPause, type StoreRecruitmentPausePeriod } from '@/lib/storeRecruitmentPause'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Label } from '@/components/ui/label'
import { scenarioDetailGlobalReadApi } from '@/lib/api/scenarioPageReadApi'
import { logger } from '@/utils/logger'
import { useAuth } from '@/contexts/AuthContext'
import { useFavorites } from '@/hooks/useFavorites'
import { showToast } from '@/utils/toast'
import { cn } from '@/lib/utils'
import { ScenarioCardImage } from '@/components/public-top/ScenarioCardImage'
import { RenewalChip } from '@/components/renewal/RenewalChip'
import { PRIVATE_PURPLE, SERIF_HEADING } from '@/components/renewal/fonts'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { formatJstMonthDay, getJstWeekdayIndex } from '@/utils/jstDate'
import { Footer } from '@/components/layout/Footer'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER } from '@/constants/album'
import { getAvailableSeats } from '@/lib/participantUtils'
import { usePageMeta } from '@/hooks/usePageMeta'
import { JsonLd } from '@/components/seo/JsonLd'
import { seatsLabel } from '@/components/renewal/labels'
import {
  buildCreativeWorkJsonLd,
  buildEventJsonLd,
  scenarioPageDescription,
  scenarioPageTitle,
} from '@/lib/seo'

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
  const { data: orgScenarios } = await scenarioDetailGlobalReadApi.findMasterIdBySlug(scenarioSlug)
  if (orgScenarios?.[0]) masterId = orgScenarios[0].scenario_master_id

  let useLegacyTable = false

  // 2. UUIDとしてIDで検索
  if (!masterId) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidPattern.test(scenarioSlug)) {
      const { data: masterById } = await scenarioDetailGlobalReadApi.findMasterById(scenarioSlug)
      if (masterById?.[0]) {
        masterId = masterById[0].id
      } else {
        const { data: legacyById } = await scenarioDetailGlobalReadApi.findMasterIdByOrgScenarioId(scenarioSlug)
        if (legacyById?.[0]) { masterId = legacyById[0].scenario_master_id; useLegacyTable = true }
      }
    }
  }

  // 3. fallback
  if (!masterId) {
    const { data: legacyScenario } = await scenarioDetailGlobalReadApi.findMasterIdBySlug(scenarioSlug)
    if (legacyScenario?.[0]) { masterId = legacyScenario[0].scenario_master_id; useLegacyTable = true }
  }

  if (!masterId) return null

  // シナリオ詳細取得
  let masterData: any = null
  if (!useLegacyTable) {
    const { data, error } = await scenarioDetailGlobalReadApi.getMasterDetail(masterId)
    if (!error && data?.[0]) masterData = data[0]
  }
  if (!masterData) {
    const { data: legacyData, error: legacyError } = await scenarioDetailGlobalReadApi.findLegacyScenarioView(masterId)
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
    const { data: charData } = await scenarioDetailGlobalReadApi.listVisibleCharacters(masterId)
    if (charData?.length) {
      characters = charData
    } else {
      const { data: orgScenarioRows } = await scenarioDetailGlobalReadApi.findOrganizationCharacters(masterId)
      if (orgScenarioRows?.[0]?.characters && Array.isArray(orgScenarioRows[0].characters)) characters = orgScenarioRows[0].characters as ScenarioCharacter[]
    }
  } else {
    const { data: orgScenarioRows } = await scenarioDetailGlobalReadApi.findOrganizationCharacters(masterId)
    if (orgScenarioRows?.[0]?.characters && Array.isArray(orgScenarioRows[0].characters)) characters = orgScenarioRows[0].characters as ScenarioCharacter[]
  }

  // 組織マップ構築（useLegacyTable に関わらず全組織を取得）
  const orgMap: Record<string, { slug: string; name: string }> = {}
  const { data: relatedOrgIds } = await scenarioDetailGlobalReadApi.listOrganizationIdsOfMaster(masterId)
  const orgIds = [...new Set(relatedOrgIds?.map((s) => s.organization_id).filter(Boolean) || [])]
  if (orgIds.length > 0) {
    const { data: orgsData } = await scenarioDetailGlobalReadApi.listOrganizationsByIds(orgIds)
    orgsData?.forEach((org) => { orgMap[org.id] = { slug: org.slug, name: org.name } })
  }
  if (!useLegacyTable) {
    const { data: availableOrgScenarios } = await scenarioDetailGlobalReadApi.listAvailableOrgScenariosWithOrganization(masterId)
    availableOrgScenarios?.forEach((os: any) => {
      if (os.organizations && !orgMap[os.organization_id]) orgMap[os.organization_id] = { slug: os.organizations.slug, name: os.organizations.name }
    })
  }

  // 貸切可能組織リスト・リダイレクトslug（useLegacyTable に関わらず全組織を表示）
  let redirectSlug: string | null = null
  const availableOrgs: Array<{ id: string; slug: string; name: string; scenarioId: string }> = []

  const { data: allAvailableScenarios } = await scenarioDetailGlobalReadApi.listAvailableOrgScenarios(masterId)
  if (allAvailableScenarios?.length) {
    const firstWithSlug = allAvailableScenarios.find((s) => s.slug)
    if (firstWithSlug) redirectSlug = firstWithSlug.slug
    allAvailableScenarios.forEach((s) => {
      const org = s.organization_id ? orgMap[s.organization_id] : null
      if (org && !availableOrgs.some(o => o.id === s.organization_id)) {
        availableOrgs.push({ id: s.organization_id, slug: org.slug, name: org.name, scenarioId: s.id })
      }
    })
  }

  // 公演取得
  const today = new Date().toISOString().split('T')[0]
  const { data: eventData, error: eventError } = await scenarioDetailGlobalReadApi.listUpcomingPublicEvents(masterId, today)
  if (eventError) logger.error('Failed to fetch events:', eventError)

  const storeIds = [...new Set((eventData || []).map((e) => e.store_id).filter(Boolean))]
  const storeMap: Record<string, { id: string; name: string; short_name: string; color: string | null; region: string | null; public_name?: string | null; is_temporary?: boolean | null; temporary_venue_names?: unknown }> = {}
  if (storeIds.length > 0) {
    const { data: storesData } = await scenarioDetailGlobalReadApi.listPublicStoresByIds(storeIds)
    storesData?.forEach((s) => { storeMap[s.id] = s })
  }

  // 店舗の「公演募集停止」期間の公演は出さない（予約は DB でも止まる。組織別の予約サイトと同じ扱い、#696）
  let performancePauses: StoreRecruitmentPausePeriod[] = []
  if (storeIds.length > 0) {
    const { data: pauseRows, error: pauseError } = await publicBookingReadApi.listPerformancePauses(storeIds as string[])
    if (pauseError) logger.error('店舗の募集停止期間の取得に失敗:', pauseError)
    else performancePauses = (pauseRows || []) as StoreRecruitmentPausePeriod[]
  }

  const events: EventWithOrg[] = (eventData || [])
    .filter((e) => e.is_private_booking !== true && e.is_reservation_enabled !== false)
    .filter((e) => !(e.store_id && e.date && storeHasRecruitmentPause(e.date, e.store_id, 'performance', performancePauses)))
    .map((e) => {
      const store = storeMap[e.store_id] || null
      const org = e.organization_id ? orgMap[e.organization_id] : null
      return {
        id: e.id, date: e.date, start_time: e.start_time || '', time_slot: e.time_slot || '',
        current_participants: e.current_participants || 0,
        player_count_max: e.max_participants ?? e.capacity ?? masterData.player_count_max,
        organization_id: e.organization_id || '', organization_slug: org?.slug || '', organization_name: org?.name || '不明',
        store_id: store?.id || '', store_name: storeDisplayName(store, { organizationName: org?.name, date: e.date }), store_short_name: storeDisplayName(store, { organizationName: org?.name, date: e.date }),
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

export function ScenarioDetailGlobal({ scenarioSlug, onClose }: ScenarioDetailGlobalProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isFavorite, toggleFavorite } = useFavorites()
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false)
  const [showAllCharacters, setShowAllCharacters] = useState(false)
  const [regionFilter, setRegionFilter] = useState<string | null>(null)
  const [isPlayedDialogOpen, setIsPlayedDialogOpen] = useState(false)
  const [playedDate, setPlayedDate] = useState('')
  const { customerId: playedCustomerId, customerIds, isPlayed: hasPlayed, markAsPlayed, unmarkAsPlayed } = usePlayedScenarios()

  const { data, isLoading, error } = useQuery({
    queryKey: ['scenario-detail-global', scenarioSlug],
    queryFn: () => fetchScenarioDetail(scenarioSlug),
  })

  const canonicalSlug = data?.redirectSlug || scenarioSlug
  const canonicalPath = `/scenario/${canonicalSlug}`

  usePageMeta({
    title: data?.scenario ? scenarioPageTitle(data.scenario.title) : 'マーダーミステリー公演予約 | MMQ',
    description: data?.scenario
      ? scenarioPageDescription(data.scenario.title, data.scenario.description || data.scenario.synopsis)
      : undefined,
    canonicalPath,
    image: data?.scenario?.key_visual_url,
  })

  const isPlayed = data?.scenario ? hasPlayed(data.scenario.id) : false

  const submitPlayedMutation = useMutation({
    mutationFn: async () => {
      if (!playedCustomerId || !data?.scenario) throw new Error('顧客情報が見つかりません')
      const registered = await registerPlayedScenario(customerIds, data.scenario.id, data.scenario.title, playedDate || null)
      if (!registered) throw new Error(`手動のプレイ履歴は最大${MAX_MANUAL_PLAY_HISTORY_PER_CUSTOMER}件まで登録できます`)
    },
    onSuccess: () => {
      markAsPlayed(data!.scenario.id)
      setIsPlayedDialogOpen(false)
      showToast.success('体験済みに登録しました')
    },
    onError: (error) => {
      logger.error('体験済み登録エラー:', error)
      showToast.error(error.message || '登録に失敗しました')
    },
  })

  const unmarkPlayedMutation = useMutation({
    mutationFn: async () => {
      if (!playedCustomerId || !data?.scenario) throw new Error('顧客情報が見つかりません')
      await unmarkAsPlayed(data.scenario.id)
    },
    onSuccess: () => {

      showToast.success('未体験に戻しました')
    },
    onError: (error: unknown) => {
      logger.error('未体験変更エラー:', error)
      showToast.error('未体験への変更に失敗しました')
    },
  })

  useEffect(() => {

  }, [user?.email, data?.scenario?.id])

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
    const dayOfWeek = getJstWeekdayIndex(dateStr) ?? 0
    return { full: formatJstMonthDay(dateStr, true), isSunday: dayOfWeek === 0, isSaturday: dayOfWeek === 6 }
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
    if (isPlayed) {
      if (!unmarkPlayedMutation.isPending) unmarkPlayedMutation.mutate()
      return
    }
    setPlayedDate(new Date().toISOString().split('T')[0])
    setIsPlayedDialogOpen(true)
  }

  // この作品を遊べる店舗: 組織×エリア（店舗の地域）の枠。公演が近い順。公演が無くても受付中の組織は枠を出す
  const playGroups = useMemo(() => {
    const map = new Map<string, { key: string; orgName: string; orgSlug: string; region: string | null; stores: string[]; events: EventWithOrg[]; privateOk: boolean }>()
    for (const e of events) {
      const key = `${e.organization_id}_${e.store_region ?? ''}`
      let g = map.get(key)
      if (!g) { g = { key, orgName: e.organization_name, orgSlug: e.organization_slug, region: e.store_region, stores: [], events: [], privateOk: true }; map.set(key, g) }
      if (!g.stores.includes(e.store_short_name)) g.stores.push(e.store_short_name)
      g.events.push(e)
    }
    for (const o of availableOrganizations) {
      if (![...map.values()].some((g) => g.orgSlug === o.slug)) map.set(o.id, { key: o.id, orgName: o.name, orgSlug: o.slug, region: null, stores: [], events: [], privateOk: true })
    }
    const groups = [...map.values()].sort((a, b) => (a.events[0]?.date ?? '9999').localeCompare(b.events[0]?.date ?? '9999'))
    const regions = [...new Set(groups.map((g) => g.region).filter((r): r is string => !!r))]
    return { groups, regions, orgCount: new Set(groups.map((g) => g.orgSlug)).size }
  }, [events, availableOrganizations])
  const playableCharacters = useMemo(() => characters.filter((c) => !c.is_npc).sort((a, b) => a.sort_order - b.sort_order), [characters])
  const openOrg = (orgSlug: string, privateTab = false) => {
    saveScrollPositionForCurrentUrl()
    navigate(`/${orgSlug}/scenario/${canonicalSlug}${privateTab ? '?tab=private' : ''}`)
  }
  const seatText = (e: EventWithOrg) => {
    // 色の段階はほかの画面の「あと N 席」と同じ（renewal/labels の seatsLabel）
    return seatsLabel(getAvailableSeats(e))
  }
  const handleShare = async () => {
    const url = `${window.location.origin}${canonicalPath}`
    try {
      if (navigator.share) await navigator.share({ title: scenario?.title, url })
      else { await navigator.clipboard.writeText(url); showToast.success('リンクをコピーしました') }
    } catch { /* 共有を閉じたときは何もしない */ }
  }

  const synopsisLength = scenario?.synopsis?.length || 0
  const shouldTruncateSynopsis = synopsisLength > 200

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: THEME.background }}>
        <Header />
        <PageBar title="作品紹介" onBack={() => (onClose ? onClose() : navigate(-1))} />
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
        <PageBar title="作品紹介" onBack={() => navigate('/')} />
        <div className="flex-1 max-w-4xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{data === null ? 'シナリオが見つかりません' : 'データの読み込みに失敗しました'}</h2>
          <Button onClick={() => navigate('/')}>トップへ戻る</Button>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: THEME.background }}>
      <JsonLd data={buildCreativeWorkJsonLd({
        title: scenario.title,
        description: scenario.synopsis || scenario.description,
        author: scenario.author,
        image: scenario.key_visual_url,
        canonicalPath,
      })} />
      <JsonLd data={buildEventJsonLd({
        workTitle: scenario.title,
        canonicalPath,
        events: events.map((event) => ({
          date: event.date,
          startTime: event.start_time,
          organizationName: event.organization_name,
          storeName: event.store_name,
        })),
      })} />
      <Header />
      <PageBar title="作品紹介" onBack={() => (onClose ? onClose() : navigate(-1))} />

      <div className="flex-1 bg-white">
        <div className="mx-auto max-w-4xl">
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-900 sm:aspect-[16/7]">
            <ScenarioCardImage src={scenario.key_visual_url} alt={scenario.title} />
          </div>

          <div className="px-4 pb-6 pt-4">
            {scenario.author && <p className="text-xs text-muted-foreground">{scenario.author}</p>}
            <h2 className={cn(SERIF_HEADING, 'mt-1.5 text-2xl font-bold leading-snug')}>{scenario.title}</h2>
            <p className="mt-2 text-sm">
              {formatPlayerCount(scenario.player_count_min, scenario.player_count_max)}・約{formatDuration(scenario.official_duration)}
              {scenario.participation_fee ? `・${scenario.participation_fee.toLocaleString('ja-JP')}円前後（店舗ごとに違います）` : ''}
            </p>
            {(scenario.genre?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {scenario.genre.slice(0, 6).map((g) => (
                  <span key={g} className="border border-gray-300 px-2 py-0.5 text-xs">{g}</span>
                ))}
                {scenario.has_pre_reading && <span className="border border-gray-300 px-2 py-0.5 text-xs">事前読み込みあり</span>}
              </div>
            )}
            <div className="mt-3 flex gap-5 text-sm">
              <button type="button" onClick={handleFavoriteClick} aria-pressed={isFavorite(favoriteScenarioId || scenario.id)} className={cn(isFavorite(favoriteScenarioId || scenario.id) && 'font-bold text-red-600')}>
                {isFavorite(favoriteScenarioId || scenario.id) ? '♥' : '♡'} 遊びたい
              </button>
              <button type="button" onClick={handlePlayedClick} aria-pressed={isPlayed} className={cn(isPlayed && 'font-bold text-green-700')}>✓ 遊んだ</button>
              <button type="button" onClick={handleShare}>↗ 共有</button>
            </div>
          </div>

          {(scenario.synopsis || scenario.description) && (
            <section className="border-t border-gray-200 px-4 py-6">
              <h3 className="text-lg font-bold">あらすじ</h3>
              <p className={cn('mt-3 whitespace-pre-wrap text-sm leading-relaxed', shouldTruncateSynopsis && !isSynopsisExpanded && 'line-clamp-5')}>
                {scenario.synopsis || scenario.description}
              </p>
              {shouldTruncateSynopsis && (
                <button type="button" onClick={() => setIsSynopsisExpanded((v) => !v)} className="mt-2 text-sm underline underline-offset-4">
                  {isSynopsisExpanded ? '閉じる' : '続きを読む'}
                </button>
              )}
            </section>
          )}

          {playableCharacters.length > 0 && (
            <section className="border-t border-gray-200 px-4 py-6">
              <h3 className="text-lg font-bold">キャラクター</h3>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {(showAllCharacters ? playableCharacters : playableCharacters.slice(0, 3)).map((c) => (
                  <div key={c.id} className="min-w-0">
                    <div className="aspect-[4/3] overflow-hidden bg-gray-100" style={c.background_color ? { backgroundColor: c.background_color } : undefined}>
                      {c.image_url && <img src={c.image_url} alt="" className="h-full w-full object-cover" style={{ objectPosition: c.image_position ?? 'center' }} />}
                    </div>
                    <p className="mt-1.5 truncate text-sm font-bold">{c.name}</p>
                    <p className="truncate text-2xs text-muted-foreground">{[genderLabel(c.gender), c.age].filter(Boolean).join('・')}</p>
                  </div>
                ))}
              </div>
              {playableCharacters.length > 3 && (
                <button type="button" onClick={() => setShowAllCharacters((v) => !v)} className="mt-3 text-sm underline underline-offset-4">
                  {showAllCharacters ? '閉じる' : `${playableCharacters.length}人すべて見る`}
                </button>
              )}
            </section>
          )}

          <section id="where-to-play" className="border-t border-gray-200 px-4 py-6">
            <h3 className="text-lg font-bold">この作品を遊べる店舗</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              全国{playGroups.orgCount}組織・{playGroups.groups.length}エリア。組織に関係なく、公演が近い順に並んでいます
            </p>
            {playGroups.regions.length > 1 && (
              <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-row" role="group" aria-label="地域">
                {[null, ...playGroups.regions].map((r) => (
                  <RenewalChip key={r ?? 'all'} selected={regionFilter === r} onClick={() => setRegionFilter(r)}>{r ?? 'すべての地域'}</RenewalChip>
                ))}
              </div>
            )}
            <div className="mt-4 space-y-3">
              {playGroups.groups.filter((g) => !regionFilter || g.region === regionFilter).map((g) => {
                const next = g.events[0]
                return (
                  <div key={g.key} className="border border-gray-200 p-4">
                    <p className="text-base font-bold">
                      <span className="text-[#003437]">{g.orgName}</span>
                      {g.region && <span className="ml-3">{g.region}エリア</span>}
                    </p>
                    {g.stores.length > 0 && <p className="mt-1 text-xs text-muted-foreground">店舗：{g.stores.join('・')}</p>}
                    <p className="mt-1 text-xs">
                      {next
                        ? <>公演　次は {formatJstMonthDay(next.date, true)} {next.start_time.slice(0, 5)} {next.store_short_name}・{seatText(next)}{g.events.length > 1 ? `　ほか${g.events.length - 1}回` : ''}</>
                        : 'まだ公演の予定はありません'}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => openOrg(g.orgSlug)} className="flex h-11 flex-1 items-center justify-center border border-gray-300 text-sm font-bold hover:bg-gray-50">公演を見る ›</button>
                      {g.privateOk && (
                        <button type="button" onClick={() => openOrg(g.orgSlug, true)} className="flex h-11 flex-1 items-center justify-center text-sm font-bold text-white hover:opacity-90" style={{ backgroundColor: PRIVATE_PURPLE }}>
                          貸切の空きを見る ›
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {playGroups.groups.length === 0 && <p className="bg-muted/50 p-4 text-center text-sm text-muted-foreground">いま、この作品を受け付けている店舗はありません。</p>}
            </div>
            <p className="mt-4 bg-gray-100 p-3 text-xs leading-relaxed text-muted-foreground">料金・キャンセル規定・支払いは組織ごとに違います。予約・貸切の申込は各組織のページで行います。</p>
          </section>

          <section className="border-t border-gray-200 px-4 py-6">
            <h3 className="text-lg font-bold">遊ぶ前に</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              <li>・一度遊んだ作品は、別の店舗でも参加できません（物語の結末を知っているため）</li>
              <li>・遊んだ作品はマイページのアルバムに自動で残ります</li>
            </ul>
          </section>
        </div>
      </div>

      <Footer />

      <Dialog open={isPlayedDialogOpen} onOpenChange={setIsPlayedDialogOpen}>
        <DialogContent fixedSize="form">
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

function genderLabel(g?: string | null): string | null {
  if (!g) return null
  if (g === 'male') return '男性'
  if (g === 'female') return '女性'
  if (g === 'other' || g === 'any') return null
  return g
}

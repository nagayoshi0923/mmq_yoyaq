/**
 * 店舗（組織）の予約サイトトップ
 * @path /{organizationSlug}
 *
 * 2026-10 刷新（社長承認の見本 Top.dc.html）: 上の帯 → 残りわずか → 友だちと貸切で遊ぶ → 空いている公演を探す → 作品から探す → はじめての方へ
 * （残りわずかを探す枠の上へ: 2026-10-12 社長指示。貸切を残りわずかの直後へ: 2026-10-13 社長指示）。
 * 「空いている公演を探す」のチップ: 今週・来週・今月は日付順のカード、カレンダー・リストは元の部品（2026-10-12 社長決定。見た目だけ新トップに合わせた）。旧 /{org}/calendar・/list はそれぞれのチップで開く。
 * 初期選択は「今月」で、該当する作品カードは全部並べる（2026-10-13 社長指示）。
 * 方針: docs/product-spec/トップページ刷新_2026-10.md
 * 2026-10-23（QW-20261023-001）: 残りわずかの直後に「新作一覧」、上の帯に「カタログ」（その組織の /{org}/catalog）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { logger } from '@/utils/logger'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Footer } from '@/components/layout/Footer'
import { useAuth } from '@/contexts/AuthContext'
import { BOOKING_THEME } from '@/lib/theme'
import { usePageMeta } from '@/hooks/usePageMeta'
import { orgBookingDescription, orgBookingTitle } from '@/lib/seo'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { autoOrganizationTagline } from '@/lib/publicStoreName'
import { nearlyFullPerformances, todayJst } from '@/lib/publicPerformanceSearch'
import { FirstTimeSection, PrivateBookingSection } from '@/components/public-top/InfoSections'
import { privateGuidePath } from '@/pages/static/guide/privateGuidePath'
import { usePerformanceSearchParams } from '@/components/public-top/usePerformanceSearchParams'
import { NearlyFullStrip } from '@/components/public-top/NearlyFullStrip'
import { NewArrivalsSection, type NewArrivalItem } from '@/components/public-top/NewArrivalsSection'
import { pickNewArrivals } from '@/components/public-top/newArrivals'
import { fetchPrivateBookingData, fetchPrivateBookingDays, isPrivateBookingCandidate, orgPrivateBookingPath } from '@/components/public-top/privateBookingStatus'
import { TopHero } from '@/components/public-top/TopHero'
import { ScenarioBrowseSection, type BrowseScenario } from '@/components/public-top/ScenarioBrowseSection'
import { useScenarioMarks } from '@/components/public-top/useScenarioMarks'
import { cardKey, indexUpcoming, scenarioBrowseCard, type ScenarioCardData, type ScenarioCardMeta, type ScenarioCardSource } from '@/components/public-top/scenarioCards'
import { useBookingData } from './hooks/useBookingData'
import { useStoreTopPerformances } from './hooks/useStoreTopPerformances'
import { StoreSearchSection } from './components/top/StoreSearchSection'

const DEFAULT_HERO_COLOR = '#1f2a2e'
/** 遊びたいリストの登録がこの数以上なら「人気」 */
const POPULAR_FAVORITES = 10

interface PublicBookingTopProps {
  /** 旧 3 タブ時代の受け口（作品カードは URL で開くので使わない） */
  onScenarioSelect?: (scenarioId: string) => void
  organizationSlug?: string
}

function useNowMs(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

export function PublicBookingTop({ organizationSlug }: PublicBookingTopProps) {
  const { isStaff } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const slug = organizationSlug ?? ''
  const nowMs = useNowMs()
  const today = todayJst(new Date(nowMs))

  const {
    scenarios,
    allEvents,
    blockedSlots,
    stores,
    privateBookingDeadlineDays,
    isLoading,
    isFetching,
    loadData,
    organizationNotFound,
    organizationId,
    organizationName,
    organizationHeaderImageUrl,
    organizationPublicBookingHeroDescription,
    organizationThemeColor,
  } = useBookingData(organizationSlug)

  const { state: search, update: updateSearch } = usePerformanceSearchParams()
  const { performances, storeOptions, nextDates } = useStoreTopPerformances({
    allEvents, stores, organizationId, organizationSlug: slug, organizationName, nowMs,
  })
  const nearlyFull = useMemo(() => nearlyFullPerformances(performances, nowMs), [performances, nowMs])
  // 作品カード（本番の見た目）の材料: 作品ごとの今後の公演と、作者・おすすめ・遊びたい数・リリース日
  const cardSource = useMemo<ScenarioCardSource>(() => {
    const meta = new Map<string, ScenarioCardMeta>(scenarios.map((s) => [s.scenario_id, s]))
    return { upcoming: indexUpcoming(performances, nowMs), meta: (id) => meta.get(id) }
  }, [scenarios, performances, nowMs])

  const tagline = useMemo(
    () => organizationPublicBookingHeroDescription?.trim() || autoOrganizationTagline(stores),
    [organizationPublicBookingHeroDescription, stores],
  )
  const primaryColor = BOOKING_THEME.primary
  const { marks, dialog: marksDialog } = useScenarioMarks()

  usePageMeta({
    title: organizationName ? orgBookingTitle(organizationName) : 'マーダーミステリー予約 | MMQ',
    description: organizationName ? orgBookingDescription(organizationName) : tagline,
    canonicalPath: organizationSlug ? `/${organizationSlug}` : '/',
  })
  useReportRouteScrollRestoration('public-booking-top', { isLoading, isFetching })

  useEffect(() => {
    loadData().catch((error) => logger.error('PublicBookingTop データ取得エラー:', error))
  }, [loadData])

  // 旧 3 タブの URL: /calendar はカレンダー、/list はリスト（時間割）、/private-booking は貸切の区画へ
  const legacySub = location.pathname.match(/^\/[^/]+\/(calendar|list|private-booking)\/?$/)?.[1]
  useEffect(() => {
    if (!legacySub || !slug) return
    if (legacySub === 'private-booking') {
      navigate(`/${slug}`, { replace: true })
      window.setTimeout(() => document.getElementById('private-booking')?.scrollIntoView({ behavior: 'smooth' }), 300)
      return
    }
    navigate(`/${slug}?view=${legacySub}`, { replace: true })
  }, [legacySub, slug, navigate])

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // 元のカレンダー・リストで公演を押したとき（元のまま作品ページへ）
  const openScenario = useCallback((slugOrId: string) => {
    saveScrollPositionForCurrentUrl()
    navigate(`/${slug}/scenario/${slugOrId}`)
  }, [navigate, slug])

  const openCard = useCallback((card: ScenarioCardData) => {
    saveScrollPositionForCurrentUrl()
    navigate(card.path)
  }, [navigate])

  const browseScenarios = useMemo<BrowseScenario[]>(() => scenarios.map((s) => {
    const path = `/${slug}/scenario/${s.scenario_slug || s.scenario_id}`
    const events = cardSource.upcoming.get(cardKey({ organization_id: organizationId ?? '', scenario_id: s.scenario_id })) ?? []
    return {
      id: s.scenario_id,
      title: s.scenario_title,
      author: s.author ?? '',
      genres: s.genre,
      player_count_min: s.player_count_min,
      player_count_max: s.player_count_max,
      is_new: !!s.is_new || s.genre.includes('新作'),
      is_popular: !!s.is_recommended || (s.favorite_count ?? 0) >= POPULAR_FAVORITES || s.genre.includes('オススメ'),
      next_date: nextDates.get(s.scenario_id) ?? null,
      card: scenarioBrowseCard({
        id: s.scenario_id,
        title: s.scenario_title,
        key_visual_url: s.key_visual_url,
        player_count_min: s.player_count_min,
        player_count_max: s.player_count_max,
        duration_minutes: s.duration,
        fee: s.participation_fee,
        author: s.author,
        is_recommended: s.is_recommended,
        favorite_count: s.favorite_count,
        release_date: s.release_date,
      }, events, path),
    }
  }), [scenarios, nextDates, slug, cardSource, organizationId])

  // 新作一覧: この組織の公開作品を、リリース日（無ければ掲載登録日）から 90 日以内のものだけ新しい順に。新作タグでは絞らない
  const newArrivalPicks = useMemo(() => {
    const byId = new Map(scenarios.map((s) => [s.scenario_id, s]))
    const candidates = browseScenarios.map((b) => ({
      ...b,
      release_date: byId.get(b.id)?.release_date ?? null,
      listed_at: byId.get(b.id)?.listed_at ?? null,
      scenario: byId.get(b.id)!,
    }))
    return pickNewArrivals(candidates, today)
  }, [scenarios, browseScenarios, today])

  // 新作一覧のカードの「貸切受付中」（この組織で日程の相談を始められるか。既存の判定・値だけ。読めない間は出さない）
  const storeIdsKey = stores.map((s) => s.id).join(',')
  const { data: privateData } = useQuery({
    queryKey: ['public-top-private-booking', organizationId, storeIdsKey],
    enabled: Boolean(organizationId) && !isLoading,
    queryFn: () => fetchPrivateBookingData([organizationId!], storeIdsKey ? storeIdsKey.split(',') : []),
    staleTime: 5 * 60_000,
  })
  const dayPairs = useMemo(() => (organizationId ? newArrivalPicks
    .filter(({ item }) => isPrivateBookingCandidate(privateData, organizationId, item.id, item.scenario, today))
    .map(({ item }) => ({ organizationId, scenarioId: item.id })) : []), [newArrivalPicks, privateData, organizationId, today])
  const { data: privateDays } = useQuery({
    queryKey: ['public-top-private-booking-days', dayPairs.map((p) => p.scenarioId).join(',')],
    enabled: dayPairs.length > 0,
    queryFn: () => fetchPrivateBookingDays(dayPairs),
    staleTime: 5 * 60_000,
  })
  const newArrivals = useMemo<NewArrivalItem[]>(() => newArrivalPicks.map(({ item, date }) => {
    const path = organizationId && slug
      ? orgPrivateBookingPath(privateData, privateDays, { id: organizationId, slug }, { id: item.id, slug: item.scenario.scenario_slug, available_from: item.scenario.available_from, available_until: item.scenario.available_until }, isLoading ? null : stores, today)
      : null
    return { card: { ...item.card, private_booking_path: path }, date }
  }), [newArrivalPicks, privateData, privateDays, organizationId, slug, stores, isLoading, today])

  if (organizationNotFound) {
    return (
      <div className="booking-shell min-h-screen bg-background">
        <Header />
        <div className="container mx-auto max-w-7xl px-4 py-16 text-center md:px-6">
          <h1 className="mb-4 text-2xl font-bold">ページが見つかりません</h1>
          <p className="mb-8 text-muted-foreground">指定されたページは存在しないか、現在利用できません。</p>
          <a href="/" className={`inline-flex items-center justify-center px-6 py-3 transition-colors ${BOOKING_THEME.classes.button}`}>
            MMQトップページへ
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="booking-shell min-h-screen bg-muted/40">
      <Header />
      {isStaff && <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />}

      <TopHero
        name={organizationName || (isLoading ? '' : 'MMQ')}
        tagline={isLoading && stores.length === 0 ? '' : tagline}
        backgroundColor={organizationThemeColor || DEFAULT_HERO_COLOR}
        headerImageUrl={organizationHeaderImageUrl}
        onFirstTime={() => navigate('/guide')}
        onAccess={() => scrollTo('store-access')}
        onPrivate={() => scrollTo('private-booking')}
        catalogPath={slug ? `/${slug}/catalog` : '/scenario'}
      />

      <main className="mx-auto max-w-4xl space-y-3 px-3.5 py-3 sm:px-4 md:py-5">
        <NearlyFullStrip performances={nearlyFull} source={cardSource} marks={marks} onOpen={openCard} />
        <NewArrivalsSection
          items={newArrivals}
          lead="この組織で遊べる、新しく掲載された作品"
          catalogPath={slug ? `/${slug}/catalog` : '/scenario'}
          marks={marks}
          onOpen={openCard}
        />
        <PrivateBookingSection
          text="4〜8 人集まれば、好きな作品を好きな日に。候補日を出して、メンバーの都合を聞いて、店舗に申し込むまでサイトで完結します。"
          scenariosPath={`/${slug}/private-booking-select`}
          guidePath={privateGuidePath(slug)}
          primaryColor={primaryColor}
        />
        <StoreSearchSection
          performances={performances}
          isLoading={isLoading}
          state={search}
          onChange={updateSearch}
          storeOptions={storeOptions}
          today={today}
          nowMs={nowMs}
          primaryColor={primaryColor}
          source={cardSource}
          marks={marks}
          onOpen={openCard}
          classic={{
            organizationId,
            allEvents,
            blockedSlots,
            stores,
            scenarios,
            organizationSlug: slug,
            organizationName,
            privateBookingDeadlineDays,
            onCardClick: openScenario,
          }}
        />
        {scenarios.length > 0 && (
          <ScenarioBrowseSection
            scenarios={browseScenarios}
            catalogPath={`/${slug}/catalog`}
            searchPath={(q) => `/${slug}/catalog?q=${encodeURIComponent(q)}`}
            marks={marks}
            primaryColor={primaryColor}
            onOpen={openCard}
          />
        )}
        <FirstTimeSection faqPath={slug ? `/${slug}/faq` : '/faq'} />
      </main>

      <Footer organizationSlug={organizationSlug} organizationName={organizationName ?? undefined} stores={stores} />
      {marksDialog}
    </div>
  )
}

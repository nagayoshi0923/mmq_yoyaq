/**
 * 店舗（組織）の予約サイトトップ
 * @path /{organizationSlug}
 *
 * 2026-10 刷新（社長承認の見本 Top.dc.html）: 上の帯 → 空いている公演を探す → 残りわずか → 貸切 → 作品から探す → はじめての方へ。
 * 「空いている公演を探す」のチップ: 今週末〜来週は日付順のカード、カレンダー・リストは元の部品（2026-10-12 社長決定。見た目だけ新トップに合わせた）。旧 /{org}/calendar・/list はそれぞれのチップで開く。
 * 方針: docs/product-spec/トップページ刷新_2026-10.md
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { nearlyFullPerformances, performanceDetailPath, todayJst, type PublicPerformance } from '@/lib/publicPerformanceSearch'
import { formatJstMonthDay } from '@/utils/jstDate'
import { FirstTimeSection, PrivateBookingSection } from '@/components/public-top/InfoSections'
import { usePerformanceSearchParams } from '@/components/public-top/usePerformanceSearchParams'
import { NearlyFullStrip } from '@/components/public-top/NearlyFullStrip'
import { ScenarioBrowseSection, type BrowseScenario } from '@/components/public-top/ScenarioBrowseSection'
import { useScenarioMarks } from '@/components/public-top/useScenarioMarks'
import { useBookingData } from './hooks/useBookingData'
import { useStoreTopPerformances } from './hooks/useStoreTopPerformances'
import { StoreHero } from './components/top/StoreHero'
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

  const openPerformance = useCallback((p: PublicPerformance) => {
    saveScrollPositionForCurrentUrl()
    navigate(performanceDetailPath(p, search.people))
  }, [navigate, search.people])

  const browseScenarios = useMemo<BrowseScenario[]>(() => scenarios.map((s) => {
    const next = nextDates.get(s.scenario_id) ?? null
    return {
      id: s.scenario_id,
      title: s.scenario_title,
      author: s.author ?? '',
      key_visual_url: s.key_visual_url,
      genres: s.genre,
      player_count_min: s.player_count_min,
      player_count_max: s.player_count_max,
      is_new: !!s.is_new || s.genre.includes('新作'),
      is_popular: !!s.is_recommended || (s.favorite_count ?? 0) >= POPULAR_FAVORITES || s.genre.includes('オススメ'),
      next_date: next,
      note: next ? `次回 ${formatJstMonthDay(next)}` : '貸切で遊べます',
      path: `/${slug}/scenario/${s.scenario_slug || s.scenario_id}`,
    }
  }), [scenarios, nextDates, slug])

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

      <StoreHero
        name={organizationName || (isLoading ? '' : 'MMQ')}
        tagline={isLoading && stores.length === 0 ? '' : tagline}
        backgroundColor={organizationThemeColor || DEFAULT_HERO_COLOR}
        headerImageUrl={organizationHeaderImageUrl}
        onFirstTime={() => navigate('/guide')}
        onAccess={() => scrollTo('store-access')}
        onPrivate={() => scrollTo('private-booking')}
      />

      <main className="mx-auto max-w-4xl space-y-3 px-4 py-3 md:py-5">
        <StoreSearchSection
          performances={performances}
          isLoading={isLoading}
          state={search}
          onChange={updateSearch}
          storeOptions={storeOptions}
          today={today}
          nowMs={nowMs}
          primaryColor={primaryColor}
          onSelect={openPerformance}
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
        <NearlyFullStrip performances={nearlyFull} onSelect={openPerformance} />
        <PrivateBookingSection
          text="4〜8 人集まれば、好きな作品を好きな日に。候補日を出して、メンバーの都合を聞いて、店舗に申し込むまでサイトで完結します。"
          scenariosPath={`/${slug}/private-booking-select`}
          primaryColor={primaryColor}
        />
        {scenarios.length > 0 && (
          <ScenarioBrowseSection
            scenarios={browseScenarios}
            catalogPath={`/${slug}/catalog`}
            searchPath={(q) => `/${slug}/catalog?q=${encodeURIComponent(q)}`}
            marks={marks}
            primaryColor={primaryColor}
          />
        )}
        <FirstTimeSection faqPath={slug ? `/${slug}/faq` : '/faq'} />
      </main>

      <Footer organizationSlug={organizationSlug} organizationName={organizationName ?? undefined} stores={stores} />
      {marksDialog}
    </div>
  )
}

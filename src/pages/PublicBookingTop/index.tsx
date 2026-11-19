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
import { autoOrganizationTagline, countPublicStores, storeAreaLabel } from '@/lib/publicStoreName'
import { DEFAULT_DATE_PRESET, nearlyFullPerformances, todayJst, upcomingRange } from '@/lib/publicPerformanceSearch'
import { privateGuidePath } from '@/pages/static/guide/privateGuidePath'
import { usePerformanceSearchParams } from '@/components/public-top/usePerformanceSearchParams'
import { buildOrgBrowseScenarios, orgNewArrivalPicks } from '@/components/public-top/newArrivalsSource'
import { newArrivalsPath } from '@/pages/NewArrivals/paths'
import { FeatureBannerSection } from '@/components/public-top/FeatureBannerSection'
import type { BrowseScenario } from '@/components/public-top/ScenarioBrowseSection'
import { useScenarioMarks } from '@/components/public-top/useScenarioMarks'
import { indexUpcoming, withFirstEventPath, type ScenarioCardData, type ScenarioCardMeta, type ScenarioCardSource } from '@/components/public-top/scenarioCards'
import { useBookingData } from './hooks/useBookingData'
import { useExtraBookingMonths } from './hooks/useExtraBookingMonths'
import { browseLimits, defaultBookingRangeEnd, extraMonthsToLoad, monthLoadStatus, requiredUntil, uniqueById } from './utils/bookingRange'
import { useStoreTopPerformances } from './hooks/useStoreTopPerformances'
import { useNewArrivalNextEvents } from './hooks/useNewArrivalNextEvents'
import { newArrivalPerformances } from '@/components/public-top/newArrivalNextEvents'
import { ScheduleSection } from './components/top/ScheduleSection'
import { scheduleUntil } from './components/top/scheduleRange'
import { StoreAccessSection } from './components/top/StoreAccessSection'
import { OrgHero } from '@/components/renewal/OrgHero'
import { BottomLinks, NearlyFullRow, NewArrivalsRow, PrivateBookingBlock, ThemeChips, type RenewalNewArrival } from '@/components/renewal/TopSections'

const DEFAULT_HERO_COLOR = '#1f2a2e'

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
    loadedUntil = defaultBookingRangeEnd(today),
    latestPublicDate = null,
    latestPublicDateError = false,
    scenarioRows = null,
    limitState = 'ready',
    fetchedThisVisit = true,
  } = useBookingData(organizationSlug)

  const { state: search, update: updateSearch } = usePerformanceSearchParams()
  // 「もっと見る」の回数 + 1（今日から windows × 30 日のカード。URL の ?more= に持ち、戻ったときも同じ期間）
  const cardWindows = search.windows
  // カレンダー・リストで表示中の月（YYYY-MM）。最初の 3 か月より先なら、その月の公演を月ごとに読む
  const [visibleMonth, setVisibleMonth] = useState<string | null>(null)
  const onVisibleMonthChange = useCallback((month: Date) => {
    setVisibleMonth(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`)
  }, [])
  const limits = useMemo(
    () => browseLimits(today, defaultBookingRangeEnd(today), latestPublicDate, latestPublicDateError),
    [today, latestPublicDate, latestPublicDateError],
  )
  const cardsPreset = search.preset === 'date' ? DEFAULT_DATE_PRESET : search.preset
  const until = requiredUntil({
    cardsUntil: search.view === 'cards' && cardsPreset === DEFAULT_DATE_PRESET ? upcomingRange(today, cardWindows).to : null,
    visibleMonth: search.view === 'cards' ? null : visibleMonth,
    lastMonth: limits.lastMonth,
  })
  const extraMonths = useMemo(() => extraMonthsToLoad(loadedUntil, until), [loadedUntil, until])
  const extra = useExtraBookingMonths({ organizationId, months: extraMonths, today, scenarioRows, stores })
  // 同じ公演が最初の取得と月ごとの取得の両方に入っても 1 件にする（id で一意）
  const mergedEvents = useMemo(() => uniqueById(allEvents, extra.events), [allEvents, extra.events])
  const mergedBlocked = useMemo(() => uniqueById(blockedSlots, extra.blocked), [blockedSlots, extra.blocked])
  const monthKey = (month: Date) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const monthStatus = useCallback((month: Date) => {
    return monthLoadStatus(monthKey(month), loadedUntil, limits.lastMonth, extra.statusOf, limitState)
  }, [loadedUntil, extra, limits.lastMonth, limitState])
  // 上限より先の月の「読み込めませんでした」は、今回の取得（上限を含む）からやり直す。それ以外は月ごとの取得をやり直す
  const onRetryMonth = useCallback((month: Date) => {
    if (monthKey(month) > limits.lastMonth && limitState === 'error') { void loadData(); return }
    extra.retry(monthKey(month))
  }, [extra, limits.lastMonth, limitState, loadData])
  // カードの期間のうち、まだ読めていない月の状態（読み込み中・読めなかった）
  const cardsExtraState = extraMonths.some((m) => extra.status.get(m) === 'error') ? 'error' as const
    : extraMonths.some((m) => extra.status.get(m) !== 'ready') ? 'loading' as const : 'ready' as const
  const [lmY, lmM] = limits.lastMonth.split('-').map(Number)
  const lastMonthDate = useMemo(() => new Date(lmY, lmM - 1, 1), [lmY, lmM]) // jst-ignore（カレンダーの月）

  const { performances, storeOptions, nextDates } = useStoreTopPerformances({
    allEvents: mergedEvents, stores, organizationId, organizationSlug: slug, organizationName, nowMs,
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
  // 「もっと見る」・月送りで読み足す月が揃うまで、戻ったときのスクロール位置を戻さない（先に戻すと後から伸びてずれる）
  const extraPending = extraMonths.some((m) => extra.statusOf(m) === 'loading')
  useReportRouteScrollRestoration('public-booking-top', { isLoading: isLoading || extraPending, isFetching })

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

  const browseScenarios = useMemo<BrowseScenario[]>(
    () => buildOrgBrowseScenarios({ scenarios, slug, organizationId, upcoming: cardSource.upcoming, nextDates }),
    [scenarios, nextDates, slug, cardSource, organizationId],
  )

  // 新作一覧: この組織の公開作品を、リリース日（無ければ掲載登録日）から 90 日以内のものだけ新しい順に。新作タグでは絞らない
  const newArrivalPicks = useMemo(() => orgNewArrivalPicks(scenarios, browseScenarios, today), [scenarios, browseScenarios, today])
  // 新作のカードの次回公演は、最初の 3 か月より先でも作品ごとに次の 1〜2 件を読んで出す（検索・カレンダーの公演には足さない。2026-10-26 社長報告）
  const newArrivalIds = useMemo(() => newArrivalPicks.map(({ item }) => item.id), [newArrivalPicks])
  const newArrivalNextQuery = useNewArrivalNextEvents({ organizationId, scenarioIds: newArrivalIds, today, scenarioRows, stores })
  const newArrivalNextEvents = newArrivalNextQuery.events
  const { performances: newArrivalNext } = useStoreTopPerformances({
    allEvents: newArrivalNextEvents, stores, organizationId, organizationSlug: slug, organizationName, nowMs,
  })
  const newArrivalCards = useMemo(() => {
    const ids = new Set(newArrivalIds)
    // 再訪で取り直した情報だけ（最初の取得はこの訪問で取り直せたときだけ・読み足した月は使わない。点検 R1247-A）
    const list = newArrivalPerformances({ base: performances, baseFresh: fetchedThisVisit, loadedUntil, next: newArrivalNext })
    const upcoming = indexUpcoming(list, nowMs)
    return new Map(buildOrgBrowseScenarios({ scenarios: scenarios.filter((s) => ids.has(s.scenario_id)), slug, organizationId, upcoming, nextDates })
      .map((b) => [b.id, withFirstEventPath(b.card, list)]))
  }, [newArrivalIds, performances, fetchedThisVisit, loadedUntil, newArrivalNext, nowMs, scenarios, slug, organizationId, nextDates])

  // 新作: 次の公演の店舗（「馬場」）を人数・時間の前に
  const newArrivals = useMemo<RenewalNewArrival[]>(() => newArrivalPicks.map(({ item, date }) => {
    const card = newArrivalCards.get(item.id) ?? item.card
    return { card, date, sub: card.events[0]?.store_name ?? '' }
  }), [newArrivalPicks, newArrivalCards])

  // テーマで探す: この組織の公開作品に多いカテゴリの上位（「新作」は新作の区画があるので外す）
  const themes = useMemo(() => {
    const count = new Map<string, number>()
    for (const sc of scenarios) for (const g of sc.genre ?? []) if (g && g !== '新作') count.set(g, (count.get(g) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g)
  }, [scenarios])

  const openPath = useCallback((path: string) => {
    saveScrollPositionForCurrentUrl()
    navigate(path)
  }, [navigate])
  const scheduleEnd = scheduleUntil(today, cardWindows)
  const areaLabel = useMemo(() => {
    const count = countPublicStores(stores)
    const area = storeAreaLabel(stores)
    return count > 0 ? `${area ? `${area} ` : ''}${count}店舗` : ''
  }, [stores])

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
    <div className="booking-shell min-h-screen bg-[#f7f6f3]">
      <Header />
      {isStaff && <NavigationBar currentPage={organizationSlug ? `booking/${organizationSlug}` : 'customer-booking'} />}

      <OrgHero
        area={areaLabel}
        name={organizationName || (isLoading ? '' : 'MMQ')}
        tagline={isLoading && stores.length === 0 ? '' : (organizationPublicBookingHeroDescription?.trim() || '物語の登場人物になる、数時間の体験を。')}
        imageUrl={organizationHeaderImageUrl}
        color={organizationThemeColor || DEFAULT_HERO_COLOR}
        onSearch={() => scrollTo('results')}
        links={[
          { label: 'はじめての方へ', to: '/guide' },
          { label: '貸切で遊ぶ', onClick: () => scrollTo('private-booking') },
          { label: '店舗とアクセス', onClick: () => scrollTo('store-access') },
        ]}
      />

      <main>
        <FeatureBannerSection organizationSlug={slug || null} />
        <ThemeChips genres={themes} catalogPath={slug ? `/${slug}/catalog` : '/scenario'} />
        <NearlyFullRow
          performances={nearlyFull}
          lead="あと少しで人数がそろう回・残りわずかの回です"
          placeOf={(p) => cardSource.meta(p.scenario_id)?.author ?? ''}
          onOpen={openPath}
        />
        <NewArrivalsRow items={newArrivals} allPath={newArrivalsPath(slug || null)} lead="この組織で遊べる、新しく掲載された作品" onOpen={openPath} />
        <ScheduleSection
          organizationName={organizationName ?? ''}
          performances={performances}
          isLoading={isLoading}
          storeOptions={storeOptions}
          storeIds={search.storeIds}
          onStoreIdsChange={(storeIds) => updateSearch({ storeIds })}
          today={today}
          nowMs={nowMs}
          until={scheduleEnd}
          onMore={limits.moreUntil && scheduleEnd < limits.moreUntil ? () => updateSearch({ windows: cardWindows + 1 }) : undefined}
          extraState={cardsExtraState}
          onRetryExtra={() => extraMonths.forEach((m) => { if (extra.status.get(m) === 'error') extra.retry(m) })}
          privatePath={`/${slug}/private-booking-select`}
          privateGuidePath={privateGuidePath(slug)}
          onOpen={openPath}
        />
        <PrivateBookingBlock to={`/${slug}/private-booking-select`} label="貸切できる作品を見る" />
        <StoreAccessSection stores={stores} contactPath={`/org/${slug}/contact`} />
        <BottomLinks links={[
          { label: 'はじめての方へ：遊び方と予約の流れ', to: '/guide' },
          { label: 'ほかの地域の公演は MMQ で全国から探す', to: '/' },
        ]} />
      </main>

      <Footer organizationSlug={organizationSlug} organizationName={organizationName ?? undefined} stores={[]} />
      {marksDialog}
    </div>
  )
}

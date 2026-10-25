/**
 * MMQ 全体トップ
 * @path /
 *
 * 2026-10 刷新（社長承認の見本 TopMMQ.dc.html）: 上の帯（見出し・一言・3 つのボタン） → 残りわずか → 貸切 → 空いている公演を探す →
 * 作品から探す → 参加店舗 → はじめての方へ → 店舗の方へ（2026-10-13 社長指示: 店舗トップと同じ順に、初期選択は「今月」、
 * 結果は全部並べる）。2026-10-14 社長指摘: 検索フォームは帯から外し、探すは独立した枠（チップ）に。
 * 他組織の公演も同じ一覧に混ぜる（社長決定）。公開情報だけを使う。
 * 方針: docs/product-spec/トップページ刷新_2026-10.md
 * 2026-10-15 社長指摘: 「友だちと貸切で遊ぶ」→「参加店舗から選ぶ」は、トップの中に枠を開かず、貸切を始めるページ
 * （/private-booking/select-organization。店舗を選ぶ → 作品を選ぶ）へ遷移する。通常の「参加店舗」は組織トップのまま。
 * 2026-10-23（QW-20261023-001）: 残りわずかの直後に「新作一覧」、上の帯に「カタログ」（全体カタログ /scenario）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { JsonLd } from '@/components/seo/JsonLd'
import { usePageMeta } from '@/hooks/usePageMeta'
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, buildWebsiteJsonLd } from '@/lib/seo'
import { BOOKING_THEME } from '@/lib/theme'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { FirstTimeSection, PrivateBookingSection } from '@/components/public-top/InfoSections'
import { NearlyFullStrip } from '@/components/public-top/NearlyFullStrip'
import { NewArrivalsSection, type NewArrivalItem } from '@/components/public-top/NewArrivalsSection'
import { buildPlatformBrowseScenarios, platformNewArrivalPicks } from '@/components/public-top/newArrivalsSource'
import { newArrivalsPath } from '@/pages/NewArrivals/paths'
import { fetchPrivateBookingData, fetchPrivateBookingDays, isPrivateBookingCandidate, platformPrivateBookingPath } from '@/components/public-top/privateBookingStatus'
import { ScenarioBrowseSection, type BrowseScenario } from '@/components/public-top/ScenarioBrowseSection'
import { useScenarioMarks } from '@/components/public-top/useScenarioMarks'
import { indexUpcoming, withFirstEventPath, type ScenarioCardData, type ScenarioCardMeta, type ScenarioCardSource } from '@/components/public-top/scenarioCards'
import { TopHero } from '@/components/public-top/TopHero'
import { TopSection } from '@/components/public-top/TopSection'
import { usePerformanceSearchParams } from '@/components/public-top/usePerformanceSearchParams'
import {
  datePresetRange,
  datesWithOpenings,
  isBookableNow,
  nearlyFullPerformances,
  DEFAULT_DATE_PRESET,
  resolvePresetRange,
  searchPerformances,
  todayJst,
  upcomingRange,
  type DateRange,
} from '@/lib/publicPerformanceSearch'
import { extraMonthsToLoad, uniqueById } from '@/pages/PublicBookingTop/utils/bookingRange'
import { useExtraPlatformMonths } from './hooks/useExtraPlatformMonths'
import { usePlatformNewArrivalNext } from './hooks/usePlatformNewArrivalNext'
import { addJstDays } from '@/utils/jstDate'
import { fetchPlatformTopData, PLATFORM_RANGE_DAYS } from './hooks/platformTopData'
import { PlatformSearchSection } from './components/PlatformSearchSection'
import { OrganizationDirectory } from './components/OrganizationDirectory'
import { PRIVATE_BOOKING_START_PATH } from '@/pages/PrivateBookingStart/paths'

const HERO_COLOR = '#1f2a2e'

export function PlatformTop() {
  const navigate = useNavigate()
  usePageMeta({ title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, canonicalPath: '/' })

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  const today = todayJst(new Date(nowMs))
  const maxDate = addJstDays(today, PLATFORM_RANGE_DAYS)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['platform-top-v2', today],
    queryFn: () => fetchPlatformTopData(today),
    staleTime: 2 * 60 * 1000,
  })

  const performances = useMemo(() => data?.performances ?? [], [data])
  const organizations = useMemo(() => data?.organizations ?? [], [data])
  const prefectures = data?.prefectures ?? []
  const { state: search, update: updateSearch } = usePerformanceSearchParams()
  // 「もっと見る」の回数 + 1（今日から windows × 30 日。URL の ?more= に持ち、戻ったときも同じ期間）
  const cardWindows = search.windows
  // 最初に読む 55 日より先は、「もっと見る」で要る月だけ月ごとに読む。上限は予約を受け付けている公開の公演のいちばん先の日
  // （読めなかったときは今日から 1 年。月ごとに読むので取りすぎない）
  const moreUntil = data ? (data.latestPublicDateError ? addJstDays(today, 365) : data.latestPublicDate) : null
  const cardsUntilRaw = search.preset === DEFAULT_DATE_PRESET ? upcomingRange(today, cardWindows).to : null
  const cardsUntil = cardsUntilRaw && moreUntil && cardsUntilRaw > moreUntil ? moreUntil : cardsUntilRaw
  const loadedUntil = data?.loadedUntil ?? addJstDays(today, PLATFORM_RANGE_DAYS)
  const extraMonths = useMemo(() => (data?.context ? extraMonthsToLoad(loadedUntil, cardsUntil) : []), [data, loadedUntil, cardsUntil])
  const extra = useExtraPlatformMonths({ months: extraMonths, today, loadedUntil, context: data?.context ?? null })
  // 同じ公演が最初の取得と月ごとの取得の両方に入っても 1 件にする（id で一意）
  const searchable = useMemo(() => uniqueById(performances, extra.performances), [performances, extra.performances])
  // 「もっと見る」で読み足す月が揃うまで、戻ったときのスクロール位置を戻さない（先に戻すと後から伸びてずれる）
  useReportRouteScrollRestoration('platform-top', { isLoading: isLoading || extra.state === 'loading', isFetching })
  const primaryColor = BOOKING_THEME.primary
  const { marks, dialog: marksDialog } = useScenarioMarks()

  const { range, results } = useMemo(() => {
    const find = (r: DateRange) => searchPerformances(searchable, {
      range: r, onlyAvailable: search.onlyAvailable, prefecture: search.area,
      beginnerOnly: search.beginnerOnly, storeIds: search.storeIds,
    }, nowMs)
    // 「今週」が 0 件なら「来週」に切り替える（読み込み中は切り替えない）。既定は今日から windows × 30 日
    const r = resolvePresetRange(search.preset, today, search.date, (cand) => (isLoading ? 1 : find(cand).length), cardWindows)
    return { range: r, results: find(r) }
  }, [searchable, search.preset, search.date, today, isLoading, search.onlyAvailable, search.area, search.beginnerOnly, search.storeIds, nowMs, cardWindows])
  const nearlyFull = useMemo(() => nearlyFullPerformances(performances, nowMs), [performances, nowMs])
  // 作品カード（本番の見た目）の材料。全体トップでは画像の左上に組織名の帯を出す
  const cardSource = useMemo<ScenarioCardSource>(() => {
    const meta = new Map<string, ScenarioCardMeta>((data?.scenarios ?? []).map((s) => [s.id, s]))
    return { upcoming: indexUpcoming(searchable, nowMs), meta: (id) => meta.get(id), showOrganization: true }
  }, [data, searchable, nowMs])
  const openDates = useMemo(() => datesWithOpenings(
    search.area ? performances.filter((p) => p.prefecture === search.area) : performances, nowMs,
  ), [performances, search.area, nowMs])

  // 数字は 1 つの計算元から: 参加店舗数（店舗トップと同じ数え方）・今後 2 週間の公演数（予約を受け付けている公演）
  const storeCount = useMemo(() => organizations.reduce((sum, o) => sum + o.store_count, 0), [organizations])
  const upcomingCount = useMemo(() => {
    const until = addJstDays(today, 13)
    return performances.filter((p) => p.date <= until && isBookableNow(p, nowMs)).length
  }, [performances, today, nowMs])
  // 参加店舗の「今月 N 公演に空きあり」: 「今月」のチップと同じ範囲（今日〜月末）で数える。
  // 見出しが「今月」なので、一覧のような「来月」への切り替えはしない
  const monthOpenings = useMemo(() => {
    const map = new Map<string, number>()
    searchPerformances(performances, { range: datePresetRange('month', today), onlyAvailable: true }, nowMs)
      .forEach((p) => map.set(p.organization_id, (map.get(p.organization_id) ?? 0) + 1))
    return map
  }, [performances, today, nowMs])

  // 作品から探す: 全国の公開作品。カードの次回公演は全店舗の予約を受け付けている公演から
  const browseScenarios = useMemo<BrowseScenario[]>(
    () => buildPlatformBrowseScenarios(data?.scenarios ?? [], cardSource.upcoming, today),
    [data, cardSource, today],
  )

  // 新作一覧: 全国の公開作品を、リリース日（無ければ掲載登録日）から 90 日以内のものだけ新しい順に。新作タグでは絞らない
  const newArrivalPicks = useMemo(() => platformNewArrivalPicks(data?.scenarios ?? [], browseScenarios, today), [data, browseScenarios, today])
  // 新作のカードの次回公演は、55 日・「もっと見る」の期間より先でも作品ごとに次の 1〜2 件を読んで出す（検索の公演には足さない。2026-10-26 社長報告）
  const newArrivalIds = useMemo(() => newArrivalPicks.map(({ item }) => item.id), [newArrivalPicks])
  const newArrivalNext = usePlatformNewArrivalNext({ scenarioIds: newArrivalIds, today, context: data?.context ?? null })
  const newArrivalCards = useMemo(() => {
    const ids = new Set(newArrivalIds)
    const list = uniqueById(searchable, newArrivalNext)
    const upcoming = indexUpcoming(list, nowMs)
    return new Map(buildPlatformBrowseScenarios((data?.scenarios ?? []).filter((s) => ids.has(s.id)), upcoming, today)
      .map((b) => [b.id, withFirstEventPath(b.card, list)]))
  }, [newArrivalIds, searchable, newArrivalNext, nowMs, data, today])

  // 新作一覧のカードの「貸切受付中」（その作品を公開している組織ごとに、日程の相談を始められるかを既存の判定で決める。読めない間は出さない）
  const orgIds = useMemo(() => organizations.map((o) => o.id), [organizations])
  const storeIds = useMemo(() => (data?.stores ?? []).map((s) => s.id), [data])
  const { data: privateData } = useQuery({
    queryKey: ['platform-top-private-booking', orgIds.join(','), storeIds.join(',')],
    enabled: orgIds.length > 0,
    queryFn: () => fetchPrivateBookingData(orgIds, storeIds),
    staleTime: 5 * 60_000,
  })
  const dayPairs = useMemo(() => newArrivalPicks.flatMap(({ item }) => item.scenario.organizations
    .filter((o) => isPrivateBookingCandidate(privateData, o.organization_id, item.id, o, today))
    .map((o) => ({ organizationId: o.organization_id, scenarioId: item.id }))), [newArrivalPicks, privateData, today])
  const { data: privateDays } = useQuery({
    // 組織・作品・今日で分ける（組織トップと同じ形のキー）
    queryKey: ['private-booking-days', today, dayPairs.map((p) => `${p.organizationId}:${p.scenarioId}`).join(',')],
    enabled: dayPairs.length > 0,
    queryFn: () => fetchPrivateBookingDays(dayPairs),
    staleTime: 5 * 60_000,
  })
  const newArrivals = useMemo<NewArrivalItem[]>(() => {
    const slugById = new Map(organizations.map((o) => [o.id, o.slug]))
    return newArrivalPicks.map(({ item, date }) => ({
      card: { ...(newArrivalCards.get(item.id) ?? item.card), private_booking_path: platformPrivateBookingPath(privateData, privateDays, item.scenario, slugById, data?.stores ?? null, today) },
      date,
    }))
  }, [newArrivalPicks, newArrivalCards, organizations, privateData, privateDays, data, today])

  const openCard = useCallback((card: ScenarioCardData) => {
    saveScrollPositionForCurrentUrl()
    navigate(card.path)
  }, [navigate])

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="booking-shell min-h-screen bg-muted/40">
      <JsonLd data={buildWebsiteJsonLd()} />
      <Header />

      <TopHero
        name="全国のマーダーミステリー公演を、ここから予約"
        tagline={isLoading && !data ? '' : `参加店舗 ${storeCount} ・ 公演 ${upcomingCount} 件（今後 2 週間）`}
        accessLabel="参加店舗"
        backgroundColor={HERO_COLOR}
        headerImageUrl={null}
        onFirstTime={() => navigate('/guide')}
        onAccess={() => scrollTo('organizations')}
        onPrivate={() => scrollTo('private-booking')}
        catalogPath="/scenario"
      />

      <main className="mx-auto max-w-4xl space-y-3 px-3.5 py-3 sm:px-4 md:py-5">
        <NearlyFullStrip performances={nearlyFull} source={cardSource} marks={marks} aside="全店舗・日付順" onOpen={openCard} />

        <NewArrivalsSection items={newArrivals} lead="全国の公開作品から、新しい物語を見つけよう" allPath={newArrivalsPath()} marks={marks} onOpen={openCard} />

        <PrivateBookingSection
          text="4〜8 人集まれば、好きな作品を好きな日に。候補日を出して、メンバーの都合を聞いて、店舗に申し込むまでサイトで完結します。貸切は店舗ごとなので、まず店舗を選び、その店舗で貸切できる作品から選びます。"
          chooseStorePath={PRIVATE_BOOKING_START_PATH}
          primaryColor={primaryColor}
        />

        <PlatformSearchSection
          performances={performances}
          results={results}
          range={range}
          isLoading={isLoading}
          state={search}
          onChange={updateSearch}
          prefectures={prefectures}
          today={today}
          maxDate={maxDate}
          markedDates={openDates}
          primaryColor={primaryColor}
          source={cardSource}
          marks={marks}
          onOpen={openCard}
          canShowMore={search.preset === DEFAULT_DATE_PRESET && !!moreUntil && range.to < moreUntil}
          onMore={() => updateSearch({ windows: cardWindows + 1 })}
          extraState={search.preset === DEFAULT_DATE_PRESET ? extra.state : 'ready'}
          onRetryExtra={extra.retry}
        />

        {browseScenarios.length > 0 && (
          <ScenarioBrowseSection
            scenarios={browseScenarios}
            catalogPath="/scenario"
            allLabel={(n) => `すべての作品（全国 ${n}）›`}
            footnote="作品を押すと、上演している店舗と次の公演が見られます。"
            searchPath={(q) => `/scenario?q=${encodeURIComponent(q)}`}
            marks={marks}
            primaryColor={primaryColor}
            allButtonLabel="カタログを見る"
            onOpen={openCard}
          />
        )}

        <OrganizationDirectory
          organizations={organizations}
          prefectures={prefectures}
          area={search.area}
          monthOpenings={monthOpenings}
          primaryColor={primaryColor}
          onAreaChange={(area) => updateSearch({ area })}
        />

        <FirstTimeSection faqPath="/faq" extraText="予約から当日までの流れを 3 分で。" />

        <TopSection id="for-stores" title="店舗の方へ">
          <p className="text-sm text-muted-foreground">MMQ に参加して公演の予約を受け付けませんか。</p>
          <Link to="/contact?type=partnership" className="mt-2 inline-flex rounded-md border border-input bg-white px-3 py-1.5 text-sm font-medium hover:bg-muted">
            参加について問い合わせる
          </Link>
        </TopSection>
      </main>

      <Footer />
      {marksDialog}
    </div>
  )
}


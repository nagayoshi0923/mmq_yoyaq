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
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { JsonLd } from '@/components/seo/JsonLd'
import { usePageMeta } from '@/hooks/usePageMeta'
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, buildWebsiteJsonLd } from '@/lib/seo'
import { BOOKING_THEME } from '@/lib/theme'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { buildPlatformBrowseScenarios, platformNewArrivalPicks } from '@/components/public-top/newArrivalsSource'
import { newArrivalsPath } from '@/pages/NewArrivals/paths'
import type { BrowseScenario } from '@/components/public-top/ScenarioBrowseSection'
import { useScenarioMarks } from '@/components/public-top/useScenarioMarks'
import { indexUpcoming, withFirstEventPath, type ScenarioCardData, type ScenarioCardMeta, type ScenarioCardSource } from '@/components/public-top/scenarioCards'
import { usePerformanceSearchParams, type PerformanceSearchState } from '@/components/public-top/usePerformanceSearchParams'
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
import { newArrivalPerformances } from '@/components/public-top/newArrivalNextEvents'
import { addJstDays } from '@/utils/jstDate'
import { fetchPlatformTopData, PLATFORM_RANGE_DAYS } from './hooks/platformTopData'
import { PlatformSearchSection } from './components/PlatformSearchSection'
import { OrganizationDirectory } from './components/OrganizationDirectory'
import { PRIVATE_BOOKING_START_PATH } from '@/pages/PrivateBookingStart/paths'
import { RenewalHero } from '@/components/renewal/RenewalHero'
import { shortPrefecture } from '@/lib/publicStoreName'
import { BottomLinks, NearlyFullRow, NewArrivalsRow, PrivateBookingBlock, ThemeChips, type RenewalNewArrival } from './components/TopRenewalSections'

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

  const { data, isLoading, isFetching, isFetchedAfterMount, isError } = useQuery({
    queryKey: ['platform-top-v2', today],
    queryFn: () => fetchPlatformTopData(today),
    staleTime: 2 * 60 * 1000,
  })

  const performances = useMemo(() => data?.performances ?? [], [data])
  const organizations = useMemo(() => data?.organizations ?? [], [data])
  const prefectures = useMemo(() => data?.prefectures ?? [], [data])
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

  // 参加店舗数（店舗トップと同じ数え方）
  const storeCount = useMemo(() => organizations.reduce((sum, o) => sum + o.store_count, 0), [organizations])
  // 地域・組織から探すの「今月 N 公演に空き」: 今日〜月末で数える
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
  const newArrivalNextQuery = usePlatformNewArrivalNext({ scenarioIds: newArrivalIds, today, context: data?.context ?? null })
  const newArrivalNext = newArrivalNextQuery.performances
  const newArrivalCards = useMemo(() => {
    const ids = new Set(newArrivalIds)
    // 再訪で取り直した情報だけ（最初の 55 日はこの訪問で取り直せたときだけ。再訪では取り直さないので次回公演の取得だけになる。
    // 「もっと見る」で読み足した月は使わない。点検 R1247-A）
    const list = newArrivalPerformances({ base: performances, baseFresh: isFetchedAfterMount && !isError, loadedUntil: data?.loadedUntil, next: newArrivalNext })
    const upcoming = indexUpcoming(list, nowMs)
    return new Map(buildPlatformBrowseScenarios((data?.scenarios ?? []).filter((s) => ids.has(s.id)), upcoming, today)
      .map((b) => [b.id, withFirstEventPath(b.card, list)]))
  }, [newArrivalIds, performances, isFetchedAfterMount, isError, newArrivalNext, nowMs, data, today])

  // 新作: 作品を公開している組織の名前（「クインズワルツ ほか2組織」）
  const newArrivals = useMemo<RenewalNewArrival[]>(() => {
    const nameById = new Map(organizations.map((o) => [o.id, o.name]))
    return newArrivalPicks.map(({ item, date }) => {
      const names = item.scenario.organizations.map((o) => nameById.get(o.organization_id)).filter((n): n is string => !!n)
      return {
        card: newArrivalCards.get(item.id) ?? item.card,
        date,
        organizations: names.length === 0 ? '' : names.length === 1 ? names[0] : `${names[0]} ほか${names.length - 1}組織`,
      }
    })
  }, [newArrivalPicks, newArrivalCards, organizations])

  // テーマで探す: 公開作品に多いカテゴリの上位（「新作」は新作の区画があるので外す）
  const themes = useMemo(() => {
    const count = new Map<string, number>()
    for (const sc of data?.scenarios ?? []) for (const g of sc.genres ?? []) if (g && g !== '新作') count.set(g, (count.get(g) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, THEME_LIMIT).map(([g]) => g)
  }, [data])

  const openCard = useCallback((card: ScenarioCardData) => {
    saveScrollPositionForCurrentUrl()
    navigate(card.path)
  }, [navigate])

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const openPath = useCallback((path: string) => {
    saveScrollPositionForCurrentUrl()
    navigate(path)
  }, [navigate])

  // 上の帯の「どこで」「いつ」は、下の「空いている公演を探す」の条件そのもの
  const whereOptions = useMemo(() => [{ value: '', label: '全国' }, ...prefectures.map((p) => ({ value: p, label: shortPrefecture(p) }))], [prefectures])
  const whenValue = search.preset === 'week' || search.preset === 'nextweek' ? search.preset : 'upcoming'

  return (
    <div className="booking-shell min-h-screen bg-[#f7f6f3]">
      <JsonLd data={buildWebsiteJsonLd()} />
      <Header />

      <RenewalHero
        headline={['今夜、だれかの', '物語の中へ。']}
        lead={`全国${isLoading && !data ? '' : storeCount}店舗のマーダーミステリー公演から、空いている席を探して予約できます。`}
        where={{ value: search.area ?? '', options: whereOptions, onChange: (v) => updateSearch({ area: v || null, storeIds: [] }) }}
        when={{ value: whenValue, options: WHEN_OPTIONS, onChange: (v) => updateSearch({ preset: v as PerformanceSearchState['preset'] }) }}
        onSearch={() => scrollTo('results')}
        links={[
          { label: 'はじめての方へ', to: '/guide' },
          { label: '貸切で遊ぶ', onClick: () => scrollTo('private-booking') },
          { label: '作品一覧', to: '/scenario' },
        ]}
      />

      <main>
        <ThemeChips genres={themes} />
        <NewArrivalsRow items={newArrivals} allPath={newArrivalsPath()} onOpen={openPath} />
        <NearlyFullRow performances={nearlyFull} onOpen={openPath} />
        <OrganizationDirectory
          organizations={organizations}
          prefectures={prefectures}
          area={search.area}
          monthOpenings={monthOpenings}
          onAreaChange={(area) => updateSearch({ area, storeIds: [] })}
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
        <PrivateBookingBlock to={PRIVATE_BOOKING_START_PATH} />
        <BottomLinks links={[
          { label: 'はじめての方へ：遊び方と予約の流れ', to: '/guide' },
          { label: '店舗の方へ：MMQで予約受付をはじめる', to: '/contact?type=partnership' },
        ]} />
      </main>

      <Footer />
      {marksDialog}
    </div>
  )
}

const THEME_LIMIT = 8
const WHEN_OPTIONS = [
  { value: 'upcoming', label: 'これから30日' },
  { value: 'week', label: '今週' },
  { value: 'nextweek', label: '来週' },
]

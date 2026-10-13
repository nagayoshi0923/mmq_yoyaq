/**
 * MMQ 全体トップ
 * @path /
 *
 * 2026-10 刷新（社長承認の見本 TopMMQ.dc.html）: 上の帯（見出し・一言・3 つのボタン） → 残りわずか → 貸切 → 空いている公演を探す →
 * 作品から探す → 参加店舗 → はじめての方へ → 店舗の方へ（2026-10-13 社長指示: 店舗トップと同じ順に、初期選択は「今月」、
 * 結果は全部並べる）。2026-10-14 社長指摘: 検索フォームは帯から外し、探すは独立した枠（チップ）に。
 * 他組織の公演も同じ一覧に混ぜる（社長決定）。公開情報だけを使う。
 * 方針: docs/product-spec/トップページ刷新_2026-10.md
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
import { ScenarioBrowseSection, type BrowseScenario } from '@/components/public-top/ScenarioBrowseSection'
import { useScenarioMarks } from '@/components/public-top/useScenarioMarks'
import { indexUpcoming, scenarioBrowseCard, type ScenarioCardData, type ScenarioCardMeta, type ScenarioCardSource } from '@/components/public-top/scenarioCards'
import { TopHero } from '@/components/public-top/TopHero'
import { TopSection } from '@/components/public-top/TopSection'
import { usePerformanceSearchParams } from '@/components/public-top/usePerformanceSearchParams'
import {
  datePresetRange,
  datesWithOpenings,
  isBookableNow,
  nearlyFullPerformances,
  resolvePresetRange,
  searchPerformances,
  todayJst,
  type DateRange,
  type PublicPerformance,
} from '@/lib/publicPerformanceSearch'
import { addJstDays } from '@/utils/jstDate'
import { fetchPlatformTopData, PLATFORM_RANGE_DAYS } from './hooks/platformTopData'
import { PlatformSearchSection } from './components/PlatformSearchSection'
import { OrganizationDirectory } from './components/OrganizationDirectory'

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
  useReportRouteScrollRestoration('platform-top', { isLoading, isFetching })

  const performances = useMemo(() => data?.performances ?? [], [data])
  const organizations = useMemo(() => data?.organizations ?? [], [data])
  const prefectures = data?.prefectures ?? []
  const { state: search, update: updateSearch } = usePerformanceSearchParams()
  const primaryColor = BOOKING_THEME.primary
  const { marks, dialog: marksDialog } = useScenarioMarks()

  const { range, results } = useMemo(() => {
    const find = (r: DateRange) => searchPerformances(performances, {
      range: r, onlyAvailable: search.onlyAvailable, prefecture: search.area,
      beginnerOnly: search.beginnerOnly, storeIds: search.storeIds,
    }, nowMs)
    // 「今月」が 0 件なら来月、「今週」が 0 件なら「来週」に切り替える（読み込み中は切り替えない）
    const r = resolvePresetRange(search.preset, today, search.date, (cand) => (isLoading ? 1 : find(cand).length))
    return { range: r, results: find(r) }
  }, [performances, search.preset, search.date, today, isLoading, search.onlyAvailable, search.area, search.beginnerOnly, search.storeIds, nowMs])
  const nearlyFull = useMemo(() => nearlyFullPerformances(performances, nowMs), [performances, nowMs])
  // 作品カード（本番の見た目）の材料。全体トップでは画像の左上に組織名の帯を出す
  const cardSource = useMemo<ScenarioCardSource>(() => {
    const meta = new Map<string, ScenarioCardMeta>((data?.scenarios ?? []).map((s) => [s.id, s]))
    return { upcoming: indexUpcoming(performances, nowMs), meta: (id) => meta.get(id), showOrganization: true }
  }, [data, performances, nowMs])
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
  const browseScenarios = useMemo<BrowseScenario[]>(() => {
    const byScenario = new Map<string, PublicPerformance[]>()
    cardSource.upcoming.forEach((list) => {
      if (list.length === 0) return
      const id = list[0].scenario_id
      byScenario.set(id, [...(byScenario.get(id) ?? []), ...list])
    })
    const newSince = addJstDays(today, -30)
    return (data?.scenarios ?? []).map((s) => {
      const events = byScenario.get(s.id) ?? []
      const next = events.filter((p) => p.available_seats > 0).reduce<string | null>((min, p) => (!min || p.date < min ? p.date : min), null)
      return {
        id: s.id,
        title: s.title,
        author: s.author,
        genres: s.genres,
        player_count_min: s.player_count_min,
        player_count_max: s.player_count_max,
        is_new: s.genres.includes('新作') || (!!s.release_date && s.release_date >= newSince),
        is_popular: s.is_recommended || s.genres.includes('オススメ'),
        next_date: next,
        card: scenarioBrowseCard(s, events, `/scenario/${encodeURIComponent(s.slug)}`),
      }
    })
  }, [data, cardSource, today])

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
      />

      <main className="mx-auto max-w-4xl space-y-3 px-3.5 py-3 sm:px-4 md:py-5">
        <NearlyFullStrip performances={nearlyFull} source={cardSource} marks={marks} aside="全店舗・日付順" onOpen={openCard} />

        <PrivateBookingSection
          text="4〜8 人集まれば、好きな作品を好きな日に。候補日を出して、メンバーの都合を聞いて、店舗に申し込むまでサイトで完結します。貸切は店舗ごとなので、参加店舗を選び、その店舗の「貸切できる作品を見る」から作品を選びます。"
          onChooseStore={() => scrollTo('organizations')}
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


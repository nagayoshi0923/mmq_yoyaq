/**
 * MMQ 全体トップ
 * @path /
 *
 * 2026-10 刷新（社長承認の見本 TopMMQ.dc.html）: 見出しと横断検索 → 今週末に入れる公演 → 残りわずか → 貸切 →
 * 参加店舗 → はじめての方へ → 店舗の方へ。他組織の公演も同じ一覧に混ぜる（社長決定）。公開情報だけを使う。
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
import { PerformanceResultList } from '@/components/public-top/PerformanceResultList'
import { TopSection } from '@/components/public-top/TopSection'
import { usePerformanceSearchParams } from '@/components/public-top/usePerformanceSearchParams'
import {
  DATE_PRESETS,
  datesWithOpenings,
  isBookableNow,
  nearlyFullPerformances,
  performanceDetailPath,
  resolvePresetRange,
  searchPerformances,
  todayJst,
  type DateRange,
  type PublicPerformance,
} from '@/lib/publicPerformanceSearch'
import { addJstDays, formatJstMonthDay } from '@/utils/jstDate'
import { fetchPlatformTopData, PLATFORM_RANGE_DAYS } from './hooks/platformTopData'
import { PlatformSearchForm } from './components/PlatformSearchForm'
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
      range: r, people: search.people, onlyAvailable: search.onlyAvailable, prefecture: search.area,
    }, nowMs)
    // 日曜の「今週末」は当日だけ。0 件なら次の土日に切り替える（読み込み中は切り替えない）
    const r = resolvePresetRange(search.preset, today, search.date, (cand) => (isLoading ? 1 : find(cand).length))
    return { range: r, results: find(r) }
  }, [performances, search.preset, search.date, today, isLoading, search.people, search.onlyAvailable, search.area, nowMs])
  const nearlyFull = useMemo(() => nearlyFullPerformances(performances, nowMs), [performances, nowMs])
  const openDates = useMemo(() => datesWithOpenings(
    search.area ? performances.filter((p) => p.prefecture === search.area) : performances, search.people, nowMs,
  ), [performances, search.area, search.people, nowMs])

  // 数字は 1 つの計算元から: 参加店舗数（店舗トップと同じ数え方）・今後 2 週間の公演数（予約を受け付けている公演）
  const storeCount = useMemo(() => organizations.reduce((sum, o) => sum + o.store_count, 0), [organizations])
  const upcomingCount = useMemo(() => {
    const until = addJstDays(today, 13)
    return performances.filter((p) => p.date <= until && isBookableNow(p, nowMs)).length
  }, [performances, today, nowMs])
  const weekendOpenings = useMemo(() => {
    const countWeekend = (r: DateRange) => searchPerformances(performances, { range: r, people: 1, onlyAvailable: true }, nowMs).length
    const weekend = resolvePresetRange('weekend', today, null, (r) => (isLoading ? 1 : countWeekend(r)))
    const map = new Map<string, number>()
    searchPerformances(performances, { range: weekend, people: 1, onlyAvailable: true }, nowMs)
      .forEach((p) => map.set(p.organization_id, (map.get(p.organization_id) ?? 0) + 1))
    return map
  }, [performances, today, nowMs, isLoading])

  // 作品から探す: 全国の公開作品。補足は「N 店舗で上演・次回 M/D」（予約を受け付けている公演から）
  const browseScenarios = useMemo<BrowseScenario[]>(() => {
    const stats = new Map<string, { stores: Set<string>; next: string | null }>()
    for (const p of performances) {
      if (!isBookableNow(p, nowMs)) continue
      const st = stats.get(p.scenario_id) ?? { stores: new Set<string>(), next: null }
      st.stores.add(`${p.organization_id}_${p.store_id ?? p.store_name}`)
      if (p.available_seats > 0 && (!st.next || p.date < st.next)) st.next = p.date
      stats.set(p.scenario_id, st)
    }
    const newSince = addJstDays(today, -30)
    return (data?.scenarios ?? []).map((s) => {
      const st = stats.get(s.id)
      const parts = [
        st && st.stores.size > 0 ? `${st.stores.size} 店舗で上演` : '',
        st?.next ? `次回 ${formatJstMonthDay(st.next)}` : '',
      ].filter(Boolean)
      return {
        id: s.id,
        title: s.title,
        author: s.author,
        key_visual_url: s.key_visual_url,
        genres: s.genres,
        player_count_min: s.player_count_min,
        player_count_max: s.player_count_max,
        is_new: s.genres.includes('新作') || (!!s.release_date && s.release_date >= newSince),
        is_popular: s.is_recommended || s.genres.includes('オススメ'),
        next_date: st?.next ?? null,
        note: parts.length > 0 ? parts.join('・') : '貸切で遊べます',
        path: `/scenario/${encodeURIComponent(s.slug)}`,
      }
    })
  }, [data, performances, nowMs, today])

  const openPerformance = useCallback((p: PublicPerformance) => {
    saveScrollPositionForCurrentUrl()
    navigate(performanceDetailPath(p, search.people))
  }, [navigate, search.people])

  const dateTitle = search.preset === 'date'
    ? formatJstMonthDay(range.from, true)
    : DATE_PRESETS.find((d) => d.value === search.preset)?.label ?? '今週末'
  const resetKey = `${range.from}_${range.to}_${search.people}_${search.area ?? ''}`

  return (
    <div className="booking-shell min-h-screen bg-muted/40">
      <JsonLd data={buildWebsiteJsonLd()} />
      <Header />

      <section className="text-white" style={{ backgroundColor: HERO_COLOR }}>
        <div className="mx-auto max-w-4xl px-4 pb-4 pt-5">
          <h1 className="text-xl font-bold leading-snug md:text-2xl">全国のマーダーミステリー公演を、ここから予約</h1>
          <p className="mt-1 text-sm opacity-85">
            {isLoading && !data ? ' ' : `参加店舗 ${storeCount} ・ 公演 ${upcomingCount} 件（今後 2 週間）`}
          </p>
          <PlatformSearchForm
            state={search}
            range={range}
            prefectures={prefectures}
            today={today}
            maxDate={maxDate}
            markedDates={openDates}
            primaryColor={primaryColor}
            onChange={updateSearch}
            onSubmit={() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })}
          />
        </div>
      </section>

      <main className="mx-auto max-w-4xl space-y-3 px-4 py-3 md:py-5">
        <TopSection id="results" title={`${dateTitle}に入れる公演`} aside={`${search.area ?? '全国'}・${search.people} 名`}>
          <PerformanceResultList
            performances={results}
            isLoading={isLoading}
            showOrganization
            resetKey={resetKey}
            onSelect={openPerformance}
            empty={<>条件に合う公演がありません。日付・エリア・人数を変えてみてください。</>}
          />
          {results.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">押すと各店舗の作品ページが、その公演を選んだ状態で開きます。</p>}
        </TopSection>

        <NearlyFullStrip performances={nearlyFull} showOrganization aside="全店舗・日付順" onSelect={openPerformance} />

        <PrivateBookingSection
          text="人数が集まれば、好きな店舗・好きな作品・好きな日に。候補日を出してメンバーの都合を聞き、店舗に申し込むまでサイトで完結します。"
          primaryColor={primaryColor}
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
          />
        )}

        <OrganizationDirectory
          organizations={organizations}
          prefectures={prefectures}
          area={search.area}
          weekendOpenings={weekendOpenings}
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


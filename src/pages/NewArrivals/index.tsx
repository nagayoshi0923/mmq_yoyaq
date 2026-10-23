/**
 * 新作一覧（トップの新作一覧の「すべて見る ›」の行き先。2026-10-24 社長指摘: 全カタログではなく新作一覧が見たい。QW-20261023-001）
 * @path /scenario?filter=new（MMQ 全体の新作）
 * @path /{org}/catalog?filter=new（その組織の新作）
 *
 * 新作の判定と並びはトップと同じ関数（newArrivalsSource.ts → newArrivals.ts の pickNewArrivals）。
 * トップは最新 12 件まで、このページは期間内（リリース日、無ければ掲載登録日から 90 日）の全件。
 * 公開条件もトップと同じ取得（全体: fetchPlatformTopData、組織: useBookingData）。
 * 全作品のカタログは「新作のみ」の札の解除・0 件のときの案内から開く（filter を外した同じ URL）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, X } from 'lucide-react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { ScenarioCard } from '@/components/public-top/ScenarioCard'
import { TopSection } from '@/components/public-top/TopSection'
import { useScenarioMarks } from '@/components/public-top/useScenarioMarks'
import { indexUpcoming, type ScenarioCardData } from '@/components/public-top/scenarioCards'
import { NEW_ARRIVALS_DAYS, formatNewArrivalDate, type NewArrivalDate } from '@/components/public-top/newArrivals'
import {
  buildOrgBrowseScenarios,
  buildPlatformBrowseScenarios,
  orgNewArrivalPicks,
  platformNewArrivalPicks,
} from '@/components/public-top/newArrivalsSource'
import { usePageMeta } from '@/hooks/usePageMeta'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { todayJst } from '@/lib/publicPerformanceSearch'
import { logger } from '@/utils/logger'
import { fetchPlatformTopData } from '@/pages/PlatformTop/hooks/platformTopData'
import { useBookingData } from '@/pages/PublicBookingTop/hooks/useBookingData'
import { useStoreTopPerformances } from '@/pages/PublicBookingTop/hooks/useStoreTopPerformances'
import { catalogPath } from './paths'

interface NewArrivalsPageProps {
  /** 組織の新作（/{org}/catalog?filter=new）。無ければ MMQ 全体 */
  organizationSlug?: string
}

interface Entry {
  card: ScenarioCardData
  date: NewArrivalDate
}

function useNowMs(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

export function NewArrivalsPage({ organizationSlug }: NewArrivalsPageProps) {
  return organizationSlug ? <OrgNewArrivals slug={organizationSlug} /> : <PlatformNewArrivals />
}

function PlatformNewArrivals() {
  const nowMs = useNowMs()
  const today = todayJst(new Date(nowMs))
  // 全体トップと同じ読み込み（同じキーなので、トップから来たときは読み直さない）
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['platform-top-v2', today],
    queryFn: () => fetchPlatformTopData(today),
    staleTime: 2 * 60 * 1000,
  })
  const entries = useMemo<Entry[]>(() => {
    if (!data) return []
    const browse = buildPlatformBrowseScenarios(data.scenarios, indexUpcoming(data.performances, nowMs), today)
    return platformNewArrivalPicks(data.scenarios, browse, today, Infinity).map(({ item, date }) => ({ card: item.card, date }))
  }, [data, nowMs, today])
  return (
    <NewArrivalsView
      organizationSlug={null}
      scopeLabel="全国の公開作品"
      entries={entries}
      loading={isLoading && !data}
      failed={isError && !data}
      fetching={isFetching}
    />
  )
}

function OrgNewArrivals({ slug }: { slug: string }) {
  const nowMs = useNowMs()
  const today = todayJst(new Date(nowMs))
  // 店舗トップと同じ読み込み・同じ公開条件
  const { scenarios, allEvents, stores, isLoading, isFetching, loadData, organizationNotFound, organizationId, organizationName } = useBookingData(slug)
  useEffect(() => {
    loadData().catch((error) => logger.error('新作一覧 データ取得エラー:', error))
  }, [loadData])
  const { performances, nextDates } = useStoreTopPerformances({ allEvents, stores, organizationId, organizationSlug: slug, organizationName, nowMs })
  const entries = useMemo<Entry[]>(() => {
    const browse = buildOrgBrowseScenarios({ scenarios, slug, organizationId, upcoming: indexUpcoming(performances, nowMs), nextDates })
    return orgNewArrivalPicks(scenarios, browse, today, Infinity).map(({ item, date }) => ({ card: item.card, date }))
  }, [scenarios, slug, organizationId, performances, nowMs, nextDates, today])
  return (
    <NewArrivalsView
      organizationSlug={slug}
      scopeLabel={organizationName ? `${organizationName}の公開作品` : 'この組織の公開作品'}
      entries={entries}
      loading={isLoading && scenarios.length === 0}
      failed={organizationNotFound}
      fetching={isFetching}
    />
  )
}

function NewArrivalsView({ organizationSlug, scopeLabel, entries, loading, failed, fetching }: {
  organizationSlug: string | null
  scopeLabel: string
  entries: Entry[]
  loading: boolean
  failed: boolean
  fetching: boolean
}) {
  const navigate = useNavigate()
  const { marks, dialog } = useScenarioMarks()
  const allPath = catalogPath(organizationSlug)
  const topPath = organizationSlug ? `/${organizationSlug}` : '/'
  usePageMeta({
    title: '新作一覧 | MMQ',
    description: `${scopeLabel}のうち、リリース日（無ければ掲載登録日）から ${NEW_ARRIVALS_DAYS} 日以内の作品を新しい順に掲載しています。`,
    canonicalPath: `${allPath}?filter=new`,
  })
  useReportRouteScrollRestoration('new-arrivals', { isLoading: loading, isFetching: fetching })
  const openCard = useCallback((card: ScenarioCardData) => {
    saveScrollPositionForCurrentUrl()
    navigate(card.path)
  }, [navigate])

  return (
    <PublicLayout organizationSlug={organizationSlug ?? undefined}>
      <main className="mx-auto w-full max-w-4xl space-y-3 px-3.5 py-3 sm:px-4 md:py-5">
        <Link to={topPath} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          トップへ戻る
        </Link>

        <TopSection id="new-arrivals-all" title={`新作（掲載から ${NEW_ARRIVALS_DAYS} 日）`} aside={loading ? null : `${entries.length} 作品`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Link
              to={allPath}
              data-testid="new-arrivals-filter-chip"
              aria-label="新作のみの絞り込みを解除して、すべての作品を見る"
              className="inline-flex items-center gap-1 border border-booking-primary bg-white px-2 py-0.5 text-xs font-bold text-booking-primary hover:bg-muted"
            >
              新作のみ表示中
              <X className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <Link to={allPath} className="text-xs text-muted-foreground underline hover:text-foreground">解除してすべての作品を見る</Link>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {scopeLabel}のうち、リリース日（無ければ掲載登録日）から {NEW_ARRIVALS_DAYS} 日以内の作品を新しい順に並べています。
          </p>

          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">読み込み中...</p>
          ) : failed ? (
            <p className="py-6 text-center text-sm text-muted-foreground">作品を読み込めませんでした。時間をおいて開き直してください。</p>
          ) : entries.length === 0 ? (
            <div data-testid="new-arrivals-empty" className="py-6 text-center">
              <p className="text-sm text-muted-foreground">いま新作はありません。</p>
              <Link to={allPath} className="mt-2 inline-flex border border-input bg-white px-3 py-1.5 text-sm font-medium hover:bg-muted">
                すべての作品を見る（カタログ）
              </Link>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" aria-label="新作一覧">
              {entries.map(({ card, date }) => (
                <li key={card.key} className="flex min-w-0 flex-col">
                  <ScenarioCard card={card} marks={marks} onOpen={openCard} className="flex-1" />
                  <p className="mt-1 ts-10 text-muted-foreground">{formatNewArrivalDate(date)}</p>
                </li>
              ))}
            </ul>
          )}
        </TopSection>
      </main>
      {dialog}
    </PublicLayout>
  )
}

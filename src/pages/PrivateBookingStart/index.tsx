/**
 * 貸切を始める（遊びたい作品を選ぶ → その作品を貸切できる店舗を選ぶ → 作品ページの貸切タブで店舗と候補日）
 * @path /private-booking/select-organization（?work=作品&area=都道府県）
 * @path /{org}/private-booking-select（その組織の作品だけ）
 *
 * 画面の文言は「会社」ではなく「店舗」（2026-11-18 えいきち指示）。
 * 2026-11-18 お客様画面の刷新（QW-20261114-001）: Figma「貸切／貸切を始める」(71:172) の形に作り直す。
 * 以前は「店舗を選ぶ → 作品を選ぶ」だったが、見本は作品が先。店舗と日にちは次の作品ページ（貸切タブ）で選ぶ。
 * 「日程が未定なら、先にグループを作る」は置かない（2026-11-18 えいきち指示で作品ページからもなくした）。
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { PageBar } from '@/components/renewal/PageBar'
import { RenewalChip } from '@/components/renewal/RenewalChip'
import { PRIVATE_PURPLE } from '@/components/renewal/fonts'
import { durationLabel, playersLabel } from '@/components/renewal/labels'
import { ScenarioCardImage } from '@/components/public-top/ScenarioCardImage'
import { usePageMeta } from '@/hooks/usePageMeta'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { scenarioApi } from '@/lib/api'
import { isPrivateBookingPeriodOpen, isScenarioAcceptingPrivateBooking } from '@/lib/privateBookingAcceptance'
import { STATIC_PUBLIC_META } from '@/lib/seo'
import { cn } from '@/lib/utils'
import { fetchPlatformOrganizations, type PlatformOrganization } from '@/pages/PlatformTop/hooks/platformTopData'
import { privateScenarioTabPath } from './paths'

interface PrivateScenarioRow {
  id: string
  slug?: string | null
  title: string
  author?: string | null
  duration?: number | null
  player_count_min: number
  player_count_max: number
  key_visual_url?: string | null
  is_recommended?: boolean | null
  available_stores?: string[] | null
  booking_start_date?: string | null
  booking_end_date?: string | null
}

/** 作品（作品マスタ単位）と、それを貸切で遊べる組織 */
export interface PrivateWork {
  id: string
  title: string
  duration: number | null
  player_count_min: number
  player_count_max: number
  key_visual_url: string | null
  is_recommended: boolean
  offers: Array<{ org: PlatformOrganization; scenario: { id: string; slug?: string | null }; storeNames: string[]; prefectures: string[] }>
}

/** 何も検索していないときに出す作品の数（見本は人気の作品を数件） */
export const FEATURED_WORK_COUNT = 8

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 店舗名の「店」を外した短い名前（見本「東京・2店舗（馬場・大久保）」の括弧の中） */
function shortStoreName(name: string): string {
  return name.replace(/店$/, '')
}

/** 都道府県の「都・府・県」を外す（チップ用。北海道はそのまま） */
function areaLabel(prefecture: string): string {
  return prefecture === '北海道' ? prefecture : prefecture.replace(/[都府県]$/, '')
}

/** 組織ごとの作品を、作品マスタ単位にまとめる（貸切を受け付けていて、募集期間の中のものだけ） */
export function buildPrivateWorks(
  rowsByOrg: ReadonlyArray<{ org: PlatformOrganization; rows: readonly PrivateScenarioRow[] }>,
  today: string,
): PrivateWork[] {
  const works = new Map<string, PrivateWork>()
  for (const { org, rows } of rowsByOrg) {
    for (const s of rows) {
      if (!isScenarioAcceptingPrivateBooking(s as Parameters<typeof isScenarioAcceptingPrivateBooking>[0])) continue
      if (!isPrivateBookingPeriodOpen(s, today)) continue
      const limited = Array.isArray(s.available_stores) && s.available_stores.length > 0
      const stores = limited ? org.stores.filter((st) => s.available_stores!.includes(st.id)) : org.stores
      if (stores.length === 0) continue
      const work = works.get(s.id) ?? {
        id: s.id,
        title: s.title,
        duration: s.duration ?? null,
        player_count_min: s.player_count_min,
        player_count_max: s.player_count_max,
        key_visual_url: s.key_visual_url ?? null,
        is_recommended: false,
        offers: [],
      }
      work.is_recommended = work.is_recommended || !!s.is_recommended
      if (!work.key_visual_url && s.key_visual_url) work.key_visual_url = s.key_visual_url
      // 地域は、この作品を遊べる店舗の都道府県だけ（組織全体の地域を出すと、遊べない県まで並ぶ）
      const prefectures: string[] = []
      stores.forEach((st) => { if (st.prefecture && !prefectures.includes(st.prefecture)) prefectures.push(st.prefecture) })
      work.offers.push({ org, scenario: { id: s.id, slug: s.slug }, storeNames: stores.map((st) => st.name), prefectures: prefectures.length > 0 ? prefectures : org.prefectures })
      works.set(s.id, work)
    }
  }
  // 人気の目安: おすすめ → 遊べる会社が多い → 名前順
  return [...works.values()].sort((a, b) =>
    Number(b.is_recommended) - Number(a.is_recommended)
    || b.offers.length - a.offers.length
    || a.title.localeCompare(b.title, 'ja'))
}

/** 作品名で探す（空白・大文字小文字・ひらがなカタカナの違いは気にしない） */
export function matchesWorkQuery(title: string, query: string): boolean {
  const norm = (v: string) => v.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  const q = norm(query)
  return q.length === 0 || norm(title).includes(q)
}

interface PrivateBookingStartProps {
  /** /{org}/private-booking-select から開いたときの組織（その組織の作品だけ出す） */
  organizationSlug?: string
}

export function PrivateBookingStart({ organizationSlug }: PrivateBookingStartProps) {
  const meta = STATIC_PUBLIC_META['private-booking-start']
  usePageMeta({ title: meta.title, description: meta.description, canonicalPath: organizationSlug ? `/${organizationSlug}/private-booking-select` : meta.path })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const workId = params.get('work')
  const area = params.get('area')

  const orgQuery = useQuery({
    queryKey: ['private-booking-start', 'organizations'],
    queryFn: fetchPlatformOrganizations,
    staleTime: 5 * 60_000,
  })
  const organizations = useMemo(() => {
    const all = orgQuery.data?.organizations ?? []
    return organizationSlug ? all.filter((o) => o.slug === organizationSlug) : all
  }, [orgQuery.data, organizationSlug])

  const worksQuery = useQuery({
    queryKey: ['private-booking-start', 'works', organizations.map((o) => o.id).join(',')],
    enabled: organizations.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rowsByOrg = await Promise.all(organizations.map(async (org) => ({
        org,
        rows: ((await scenarioApi.getPublic(org.id).catch(() => [])) ?? []) as unknown as PrivateScenarioRow[],
      })))
      return buildPrivateWorks(rowsByOrg, todayJst())
    },
  })
  const works = useMemo(() => worksQuery.data ?? [], [worksQuery.data])
  const loading = orgQuery.isLoading || (organizations.length > 0 && worksQuery.isLoading)
  useReportRouteScrollRestoration('private-booking-start', { isLoading: loading })

  const selected = works.find((w) => w.id === workId) ?? null
  const shown = useMemo(() => {
    const hits = query.trim() ? works.filter((w) => matchesWorkQuery(w.title, query)) : works.slice(0, FEATURED_WORK_COUNT)
    // 選んだ作品は一覧から外れても上に残す（選択中が見えなくならないように）
    return selected && !hits.some((w) => w.id === selected.id) ? [selected, ...hits] : hits
  }, [works, query, selected])

  const areas = useMemo(() => {
    if (!selected) return []
    const list: string[] = []
    selected.offers.forEach((o) => o.prefectures.forEach((p) => { if (!list.includes(p)) list.push(p) }))
    return list
  }, [selected])
  const offers = selected ? selected.offers.filter((o) => !area || o.prefectures.includes(area)) : []

  const setParam = (key: string, value: string | null) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (value) p.set(key, value); else p.delete(key)
      if (key === 'work') p.delete('area')
      return p
    }, { replace: true })
  }
  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(organizationSlug ? `/${organizationSlug}` : '/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <PageBar title="貸切を始める" onBack={goBack} />
      <main className="mx-auto w-full max-w-2xl space-y-3 px-3 py-3">
        <section className="border border-gray-200 bg-white p-4" data-testid="private-start-works">
          <h2 className="text-lg font-bold">1. 遊びたい作品を選ぶ</h2>
          <p className="mt-1 text-sm text-muted-foreground">貸切できる作品です（おすすめが先、あとは名前順）。名前でも探せます。</p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="作品名で探す"
            aria-label="作品名で探す"
            className="mt-3 h-12 w-full border border-gray-300 px-3 text-base outline-none focus:border-gray-500"
          />
          <div className="mt-3 space-y-3">
            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">読み込み中...</p>
            ) : orgQuery.isError || worksQuery.isError ? (
              <p className="py-6 text-center text-sm text-muted-foreground">作品を読み込めませんでした。時間をおいて開き直してください。</p>
            ) : shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {query.trim() ? '貸切できる作品が見つかりませんでした。名前を変えて探してください。' : 'いま貸切できる作品はありません。'}
              </p>
            ) : (
              shown.map((w) => {
                const isSelected = w.id === selected?.id
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setParam('work', isSelected ? null : w.id)}
                    aria-pressed={isSelected}
                    data-testid="private-start-work"
                    className={cn('flex w-full items-center gap-3 border bg-white p-3 text-left transition-colors', isSelected ? 'border-2' : 'border-gray-200 hover:bg-gray-50')}
                    style={isSelected ? { borderColor: PRIVATE_PURPLE, backgroundColor: '#F5F3FF' } : undefined}
                  >
                    <div className="aspect-[3/4] w-12 shrink-0 overflow-hidden bg-gray-200">
                      <ScenarioCardImage src={w.key_visual_url} alt={w.title} className="h-full w-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold">{w.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[playersLabel(w.player_count_min, w.player_count_max), durationLabel(w.duration)].filter(Boolean).join('・')}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold" style={{ color: PRIVATE_PURPLE }}>
                      {isSelected ? '✓ 選択中' : '選ぶ ›'}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <section className="border border-gray-200 bg-white p-4" data-testid="private-start-orgs">
          <h2 className="text-lg font-bold">2. この作品を貸切できる店舗</h2>
          {selected ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">{selected.title}を貸切で遊べる店舗です。日にちは次の画面で選べます。</p>
              {areas.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  <RenewalChip selected={!area} onClick={() => setParam('area', null)}>すべての地域</RenewalChip>
                  {areas.map((p) => (
                    <RenewalChip key={p} selected={area === p} onClick={() => setParam('area', p)}>{areaLabel(p)}</RenewalChip>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-3">
                {offers.map((o) => {
                  const path = privateScenarioTabPath(o.org.slug, o.scenario)
                  return (
                    <a
                      key={o.org.id}
                      href={path}
                      onClick={(e) => { e.preventDefault(); saveScrollPositionForCurrentUrl(); navigate(path) }}
                      data-org={o.org.slug}
                      className="flex items-center gap-3 border border-gray-200 bg-white p-3 hover:bg-gray-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold">{o.org.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[...o.prefectures.map(areaLabel), `${o.storeNames.length}店舗（${o.storeNames.map(shortStoreName).join('・')}）`].join('・')}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold" style={{ color: PRIVATE_PURPLE }}>空きを見る ›</span>
                    </a>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="mt-2 py-4 text-center text-sm text-muted-foreground">上で作品を選ぶと、貸切できる店舗が出ます。</p>
          )}
        </section>

        <section className="p-4" style={{ backgroundColor: '#F5F3FF' }} data-testid="private-start-flow">
          <h2 className="text-lg font-bold">貸切の流れ</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-6 text-sm">
            <li>遊びたい作品を選ぶ</li>
            <li>店舗を選び、次の画面で候補日を選ぶ</li>
            <li>一緒に行く人をグループに招待</li>
            <li>店舗が日時と会場を決めてお知らせ</li>
          </ol>
        </section>
      </main>
      <Footer organizationSlug={organizationSlug} minimal />
    </div>
  )
}

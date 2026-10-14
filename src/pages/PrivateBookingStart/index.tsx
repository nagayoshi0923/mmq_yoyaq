/**
 * 貸切を始める（店舗を選ぶ → 作品を選ぶ）
 * @path /private-booking/select-organization（?org=組織&stores=店舗ID,…）
 * @path /{org}/private-booking-select（日付なし。組織を選んだ状態で開く）
 *
 * 2026-10-15 社長指摘: MMQ 全体トップの「参加店舗から選ぶ」は、トップの中に枠を開かずこのページへ遷移する。
 * 上で組織を選ぶ（複数店舗なら希望店舗のチップ）と、下にその組織の貸切できる作品の一覧が出る。
 * 作品を押すと作品ページの貸切リクエストのタブへ（希望店舗は ?stores= で渡し、グループ作成の初期値にする）。
 * 日付・時間帯付き（カレンダーの貸切申込チップから）の流れは PrivateBookingScenarioSelect のまま。
 */
import { useEffect, useMemo } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { TopSection } from '@/components/public-top/TopSection'
import { PrivateScenarioGrid, type PrivateScenario } from '@/components/private-booking/PrivateScenarioGrid'
import { usePageMeta } from '@/hooks/usePageMeta'
import { saveScrollPositionForCurrentUrl } from '@/hooks/useScrollRestoration'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { scenarioApi } from '@/lib/api'
import { isScenarioAcceptingPrivateBooking } from '@/lib/privateBookingAcceptance'
import { STATIC_PUBLIC_META } from '@/lib/seo'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { fetchPlatformOrganizations } from '@/pages/PlatformTop/hooks/platformTopData'
import { privateGuidePath } from '@/pages/static/guide/privateGuidePath'
import { OrganizationList, SelectedOrganization } from './components/OrganizationPicker'
import { PRIVATE_BOOKING_START_PATH, parseStoreIdsParam, privateScenarioTabPath } from './paths'
import { scenariosForStores } from './scenariosForStores'

interface PrivateScenarioRow extends PrivateScenario {
  available_stores?: string[] | null
  booking_start_date?: string | null
  booking_end_date?: string | null
}

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

function isBookingOpen(s: PrivateScenarioRow, today: string): boolean {
  if (s.booking_start_date && today < s.booking_start_date) return false
  if (s.booking_end_date && today > s.booking_end_date) return false
  return true
}

interface PrivateBookingStartProps {
  /** /{org}/private-booking-select から開いたときの組織（選んだ状態で開く） */
  organizationSlug?: string
}

export function PrivateBookingStart({ organizationSlug }: PrivateBookingStartProps) {
  const meta = STATIC_PUBLIC_META['private-booking-start']
  usePageMeta({ title: meta.title, description: meta.description, canonicalPath: organizationSlug ? `/${organizationSlug}/private-booking-select` : meta.path })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const fixedOrg = Boolean(organizationSlug)
  const orgSlug = organizationSlug || params.get('org') || ''
  const storeParam = params.get('stores')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['private-booking-start', 'organizations'],
    queryFn: fetchPlatformOrganizations,
    staleTime: 5 * 60_000,
  })
  const organizations = useMemo(() => data?.organizations ?? [], [data])
  const prefectures = data?.prefectures ?? []
  const onlyOne = organizations.length === 1 ? organizations[0] : null
  const org = organizations.find((o) => o.slug === orgSlug) ?? (!orgSlug && onlyOne ? onlyOne : null)
  const storeIds = useMemo(
    () => parseStoreIdsParam(storeParam).filter((id) => org?.stores.some((s) => s.id === id)),
    [storeParam, org],
  )

  const updateParams = (next: { org?: string | null; stores?: string[] }) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (next.org !== undefined) {
        if (next.org && !fixedOrg) p.set('org', next.org); else p.delete('org')
      }
      if (next.stores !== undefined) {
        if (next.stores.length > 0) p.set('stores', next.stores.join(',')); else p.delete('stores')
      }
      return p
    }, { replace: true })
  }
  const chooseAnother = () => {
    if (fixedOrg) navigate(PRIVATE_BOOKING_START_PATH)
    else updateParams({ org: null, stores: [] })
  }

  const scenarioQuery = useQuery({
    queryKey: ['private-booking-start', 'scenarios', org?.id],
    enabled: Boolean(org?.id),
    queryFn: async () => {
      const rows = (await scenarioApi.getPublic(org!.id)) as unknown as PrivateScenarioRow[]
      const today = todayJst()
      return rows
        .filter((s) => isScenarioAcceptingPrivateBooking(s as Parameters<typeof isScenarioAcceptingPrivateBooking>[0]))
        .map((s) => ({ ...s, closed: !isBookingOpen(s, today) }))
    },
  })
  const scenarios = useMemo(() => scenariosForStores(scenarioQuery.data ?? [], storeIds), [scenarioQuery.data, storeIds])

  useReportRouteScrollRestoration('private-booking-start', { isLoading: isLoading || (Boolean(org) && scenarioQuery.isLoading) })

  // 組織を選ぶと一覧が選んだカードと希望店舗に縮むので、店舗の欄の頭に合わせる（スマホで下の方のカードを押したとき用）
  useEffect(() => {
    if (!org || fixedOrg) return
    const el = document.getElementById('private-start-organizations')
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [org?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }
  const missingOrg = Boolean(orgSlug) && !isLoading && !org

  return (
    <PublicLayout organizationSlug={organizationSlug}>
      <section className="relative overflow-hidden py-8 md:py-10" style={{ backgroundColor: THEME.primary }}>
        <div className="absolute top-0 right-0 h-48 w-48 opacity-20" style={{ background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }} />
        <div className="relative mx-auto max-w-4xl px-4">
          <nav aria-label="パンくず" className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
            <Link to={organizationSlug ? `/${organizationSlug}` : '/'} className="hover:text-white">ホーム</Link>
            <ChevronRight className="h-4 w-4" aria-hidden />
            <span>貸切を始める</span>
          </nav>
          <h1 className="text-2xl font-bold text-white md:text-3xl">貸切を始める</h1>
          <p className="mt-2 text-sm text-white/80">貸切は店舗ごとです。店舗を選び、その店舗で貸切できる作品を選んでください。</p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-4xl space-y-3 px-4 py-4 md:py-6">
        <button type="button" onClick={goBack} className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          戻る
        </button>

        <TopSection id="private-start-organizations" title="1. 貸切する店舗を選ぶ" tone="accent" aside={<Link to={privateGuidePath(organizationSlug)} className="underline hover:text-foreground">貸切の流れ</Link>}>
          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">読み込み中...</p>
          ) : isError ? (
            <p className="py-4 text-center text-sm text-muted-foreground">店舗の一覧を読み込めませんでした。時間をおいて開き直してください。</p>
          ) : org ? (
            <SelectedOrganization
              org={org}
              storeIds={storeIds}
              onStoreIdsChange={(ids) => updateParams({ stores: ids })}
              onChangeOrganization={chooseAnother}
            />
          ) : (
            <>
              {missingOrg && <p className="mb-2 text-xs text-muted-foreground">指定の店舗が見つかりませんでした。一覧から選んでください。</p>}
              <p className="mb-2 text-xs text-muted-foreground">店舗を選ぶと、その店舗で貸切できる作品の一覧が開きます。</p>
              <OrganizationList organizations={organizations} prefectures={prefectures} onSelect={(o) => updateParams({ org: o.slug, stores: [] })} />
            </>
          )}
        </TopSection>

        <TopSection id="private-start-scenarios" title="2. 貸切できる作品を選ぶ">
          {org ? (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                作品を押すと、作品ページの「貸切リクエスト」が開きます。そこで「まずはメンバーを招待して貸切グループを作成」からグループを作り、メンバーと候補日を決めて店舗に申し込みます。
              </p>
              <PrivateScenarioGrid
                key={org.id}
                scenarios={scenarios}
                loading={scenarioQuery.isLoading}
                pathFor={(s) => privateScenarioTabPath(org.slug, s, storeIds)}
                onOpen={(s) => {
                  saveScrollPositionForCurrentUrl()
                  navigate(privateScenarioTabPath(org.slug, s, storeIds))
                }}
              />
            </>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">上で店舗を選ぶと、ここに作品が出ます。</p>
          )}
        </TopSection>
      </main>
    </PublicLayout>
  )
}

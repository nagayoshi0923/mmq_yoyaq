// @vitest-environment jsdom
// 組織を切り替えたとき、前の組織の受付締切・受付範囲を使い回さない（Codex 指摘 2026-10-24。架空の組織 A・B、同じ作品 ID）
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ booking: {} as Record<string, unknown>, platform: vi.fn(), getPublic: vi.fn(), pauses: vi.fn(), deadline: vi.fn(), horizon: vi.fn() }))
vi.mock('./hooks/useBookingData', () => ({ useBookingData: () => m.booking }))
vi.mock('./hooks/useStoreTopPerformances', () => ({ useStoreTopPerformances: () => ({ performances: [], storeOptions: [], nextDates: new Map() }) }))
vi.mock('./components/top/StoreSearchSection', () => ({ StoreSearchSection: () => null }))
vi.mock('@/pages/PlatformTop/hooks/platformTopData', () => ({ PLATFORM_RANGE_DAYS: 55, fetchPlatformTopData: m.platform }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: m.getPublic } }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({ publicBookingReadApi: { listPrivatePauses: m.pauses } }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({ privateBookingSlotReadApi: { getEffectiveDeadlineDays: m.deadline, getEffectiveHorizonDays: m.horizon } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isStaff: false }) }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/NavigationBar', () => ({ NavigationBar: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/components/seo/JsonLd', () => ({ JsonLd: () => null }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: vi.fn() }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: vi.fn() }))
vi.mock('@/components/public-top/useScenarioMarks', () => ({ useScenarioMarks: () => ({ marks: null, dialog: null }) }))
import { PublicBookingTop } from './index'
import { PlatformTop } from '@/pages/PlatformTop/index'

// 作品 m1 の公演期間は 12/1 から。A は受付範囲 30 日（〜11/23）で申し込める日が無い、B は 180 日で受付中
const ORGS = { a: { id: 'org-a', slug: 'aaa', store: 'sa' }, b: { id: 'org-b', slug: 'bbb', store: 'sb' } }
const orgOf = (id: string) => (id === 'org-a' ? 'a' : 'b')
function bookingFor(key: 'a' | 'b') {
  const o = ORGS[key]
  return {
    scenarios: [{
      scenario_id: 'm1', scenario_slug: 'm1', scenario_title: '共通作品', key_visual_url: null, author: '', duration: 180,
      player_count_min: 4, player_count_max: 6, genre: [], participation_fee: 4000, status: 'available', is_new: false,
      listed_at: '2026-10-20T03:00:00Z', available_from: '2026-12-01', available_until: null, new_arrival_target: true,
    }],
    allEvents: [], blockedSlots: [], stores: [{ id: o.store, organization_id: o.id, status: 'active', is_temporary: false }],
    privateBookingDeadlineDays: 14, isLoading: false, isFetching: false, loadData: () => Promise.resolve(), organizationNotFound: false,
    organizationId: o.id, organizationName: key.toUpperCase(), organizationHeaderImageUrl: null, organizationPublicBookingHeroDescription: 'x', organizationThemeColor: null,
  }
}
const platformData = {
  prefectures: [], performances: [],
  organizations: Object.values(ORGS).map((o) => ({ id: o.id, slug: o.slug, name: o.slug, logo_url: null, store_names: [], stores: [{ id: o.store, name: o.store }], store_count: 1, prefectures: [], scenario_count: 1 })),
  stores: Object.values(ORGS).map((o) => ({ id: o.store, organization_id: o.id, status: 'active', is_temporary: false })),
  scenarios: [{ id: 'm1', slug: 'm1', title: '共通作品', author: '', key_visual_url: null, genres: [], player_count_min: 4, player_count_max: 6, release_date: null, listed_at: '2026-10-20T03:00:00Z', is_recommended: false, new_arrival_target: true,
    organizations: [{ organization_id: 'org-a', available_from: '2026-12-01', available_until: null }] }],
}

let root: Root
let host: HTMLDivElement
let client: QueryClient
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Element.prototype.scrollIntoView = vi.fn()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00+09:00'))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  m.platform.mockResolvedValue(platformData)
  m.getPublic.mockResolvedValue([{ id: 'm1', accepts_private_booking: true, scenario_kind: 'regular', booking_start_date: null, booking_end_date: null, available_stores: [] }])
  m.pauses.mockResolvedValue({ data: [], error: null })
  m.deadline.mockResolvedValue({ data: 1, error: null })
  m.horizon.mockImplementation(async ({ organizationId }: { organizationId: string }) => ({ data: orgOf(organizationId) === 'a' ? 30 : 180, error: null }))
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.useRealTimers() })

async function show(page: 'top' | 'a' | 'b') {
  if (page !== 'top') m.booking = bookingFor(page)
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{page === 'top' ? <PlatformTop /> : <PublicBookingTop key={page} organizationSlug={ORGS[page].slug} />}</MemoryRouter>
    </QueryClientProvider>,
  ))
  await vi.waitFor(() => expect(host.querySelector('#new-arrivals')).not.toBeNull())
  // 読み込みが落ち着くまで待つ
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const badge = () => host.querySelector('#new-arrivals [data-testid="private-booking-badge"]')

describe('受付締切・受付範囲の読み込みを組織ごとに分ける', () => {
  it('組織 A → B → A: 同じ作品 ID でもそれぞれの組織の日数で判定する', async () => {
    await show('a')
    expect(badge()).toBeNull()
    await show('b')
    await vi.waitFor(() => expect(badge()).not.toBeNull())
    await show('a')
    expect(badge()).toBeNull()
  })

  it('全体トップ（A だけが公開）→ 組織 B → 全体トップ: B の結果を全体に持ち込まない', async () => {
    await show('top')
    expect(badge()).toBeNull()
    await show('b')
    await vi.waitFor(() => expect(badge()).not.toBeNull())
    await show('top')
    expect(badge()).toBeNull()
  })
})

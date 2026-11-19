// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const booking = vi.hoisted(() => ({ value: {} as Record<string, unknown>, getPublic: vi.fn(), pauses: vi.fn(), deadline: vi.fn(), horizon: vi.fn() }))
vi.mock('@/components/public-top/FeatureBannerSection', () => ({ FeatureBannerSection: () => null }))
vi.mock('./hooks/useNewArrivalNextEvents', () => ({ useNewArrivalNextEvents: () => ({ events: [], stateOf: () => 'ready', retry: () => {} }) }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({ privateBookingSlotReadApi: { getEffectiveDeadlineDays: booking.deadline, getEffectiveHorizonDays: booking.horizon } }))
vi.mock('./hooks/useBookingData', () => ({ useBookingData: () => booking.value }))
vi.mock('./hooks/useStoreTopPerformances', () => ({ useStoreTopPerformances: () => ({ performances: [], storeOptions: [], nextDates: new Map() }) }))
vi.mock('./components/top/StoreSearchSection', () => ({ StoreSearchSection: () => null }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: booking.getPublic } }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({ publicBookingReadApi: { listPrivatePauses: booking.pauses } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isStaff: false }) }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/NavigationBar', () => ({ NavigationBar: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: vi.fn() }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: vi.fn() }))
vi.mock('@/components/public-top/useScenarioMarks', () => ({ useScenarioMarks: () => ({ marks: null, dialog: null }) }))
import { PublicBookingTop } from './index'

const scenario = (id: string, over: Record<string, unknown>) => ({
  scenario_id: id, scenario_slug: id, scenario_title: id, key_visual_url: null, author: '', duration: 180,
  player_count_min: 4, player_count_max: 6, genre: [], participation_fee: 4000, status: 'available', is_new: false,
  release_date: undefined, listed_at: '2026-10-20T03:00:00Z', available_from: null, available_until: null, new_arrival_target: true, ...over,
})
const row = (id: string, over: Record<string, unknown> = {}) => ({ id, accepts_private_booking: true, scenario_kind: 'regular', booking_start_date: null, booking_end_date: null, available_stores: [], ...over })

let root: Root
let host: HTMLDivElement
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output> }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00+09:00'))
  booking.value = {
    scenarios: [
      scenario('古い', { listed_at: '2026-08-01T03:00:00Z' }),
      scenario('期間外', { listed_at: '2026-01-22T03:00:00Z' }),
      scenario('新しいタグなし', { listed_at: '2026-10-13T03:00:00Z' }),
      scenario('中間', { listed_at: '2026-09-16T03:00:00Z', is_new: true }),
    ],
    allEvents: [], blockedSlots: [], stores: [{ id: 'st1', organization_id: 'org-qw', status: 'active', is_temporary: false }],
    privateBookingDeadlineDays: 14, isLoading: false, isFetching: false,
    loadData: () => Promise.resolve(), organizationNotFound: false, organizationId: 'org-qw', organizationName: 'クインズワルツ',
    organizationHeaderImageUrl: null, organizationPublicBookingHeroDescription: 'x', organizationThemeColor: null,
  }
  booking.getPublic.mockResolvedValue([])
  booking.pauses.mockResolvedValue({ data: [], error: null })
  booking.deadline.mockResolvedValue({ data: 1, error: null })
  booking.horizon.mockResolvedValue({ data: 30, error: null })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.useRealTimers() })

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/queens-waltz']}>
        <Routes><Route path="*" element={<><PublicBookingTop organizationSlug="queens-waltz" /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  ))
}
const cardsIn = (id: string) => [...(host.querySelector(`#${id}`)?.querySelectorAll('li') ?? [])]

describe('店舗トップの新作一覧とカタログ（QW-20261023-001）', () => {
  it('その組織の公開作品を掲載登録日から 90 日以内だけ新しい順に出し、すべて見るはその組織の新作一覧へ', async () => {
    await render()
    const section = host.querySelector('#new-arrivals')
    expect([...(section?.querySelectorAll('h3') ?? [])].map((h) => h.textContent)).toEqual(['新しいタグなし', '中間', '古い'])
    expect(section?.textContent).toContain('この組織で遊べる、新しく掲載された作品')
    expect(section?.querySelector('a')?.getAttribute('href')).toBe('/queens-waltz/catalog?genre=%E6%96%B0%E4%BD%9C')
  })
})

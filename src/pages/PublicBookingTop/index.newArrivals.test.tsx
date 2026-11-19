// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const booking = vi.hoisted(() => ({ value: {} as Record<string, unknown>, getPublic: vi.fn(), pauses: vi.fn(), deadline: vi.fn(), horizon: vi.fn() }))
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
const badgeOf = (t: string) => cardsIn('new-arrivals').find((li) => li.querySelector('h3')?.textContent === t)?.querySelector('[data-testid="private-booking-badge"]') ?? null

describe('店舗トップの新作一覧とカタログ（QW-20261023-001）', () => {
  it('その組織の公開作品を掲載登録日から 90 日以内だけ新しい順に出し、すべて見る・カタログはその組織のカタログへ', async () => {
    await render()
    const section = host.querySelector('#new-arrivals')
    expect([...(section?.querySelectorAll('h3') ?? [])].map((h) => h.textContent)).toEqual(['新しいタグなし', '中間', '古い'])
    expect(section?.textContent).toContain('この組織で遊べる、新しく掲載された作品')
    expect(section?.querySelector('a')?.getAttribute('href')).toBe('/queens-waltz/catalog?genre=%E6%96%B0%E4%BD%9C')
    const catalog = [...host.querySelectorAll('a')].find((a) => a.textContent === 'カタログ')
    expect(catalog?.getAttribute('href')).toBe('/queens-waltz/catalog')
  })
})

describe('店舗トップの貸切受付中（架空の組織 org-qw）', () => {
  it('受付可は出す（公演予定なしでも）。休止・受付期間終了・公演期間終了・非公開・店舗停止・列の欠落は出さない', async () => {
    booking.value = {
      ...booking.value,
      scenarios: ['受付可', '休止', '期間終了', '公演期間終了', '非公開', '列欠落'].map((t) => scenario(t, t === '公演期間終了' ? { available_until: '2026-10-23' } : {})),
    }
    booking.getPublic.mockResolvedValue([
      row('受付可'), row('休止', { accepts_private_booking: false }), row('期間終了', { booking_end_date: '2026-10-23' }), row('公演期間終了'),
      { id: '列欠落', accepts_private_booking: true, scenario_kind: 'regular', available_stores: [] },
    ])
    await render()
    await vi.waitFor(() => expect(badgeOf('受付可')).not.toBeNull())
    expect(booking.getPublic).toHaveBeenCalledWith('org-qw')
    for (const t of ['休止', '期間終了', '公演期間終了', '非公開', '列欠落']) expect(badgeOf(t), t).toBeNull()
    await act(async () => (badgeOf('受付可') as HTMLButtonElement).click())
    expect(host.querySelector('[data-testid="where"]')?.textContent).toBe('/queens-waltz/scenario/%E5%8F%97%E4%BB%98%E5%8F%AF?tab=private')
  })

  it('組織の店舗が受付対象期間（締切 1 日・範囲 30 日 → 10/25〜11/23）をすべて貸切の募集停止なら出さない。今日だけの停止なら出す', async () => {
    booking.value = { ...booking.value, scenarios: [scenario('全期間停止', {}), scenario('今日だけ停止', {})] }
    booking.getPublic.mockResolvedValue([row('全期間停止'), row('今日だけ停止')])
    booking.pauses.mockResolvedValue({ data: [{ store_id: 'st1', organization_id: 'org-qw', pause_type: 'private', starts_on: '2026-10-24', ends_on: '2026-11-23' }], error: null })
    await render()
    await vi.waitFor(() => expect(booking.horizon).toHaveBeenCalled())
    await act(async () => { await Promise.resolve() })
    expect(badgeOf('全期間停止')).toBeNull()
    expect(badgeOf('今日だけ停止')).toBeNull()
    // 同じ店舗の停止が今日だけなら、明日以降で受付中
    await act(async () => root.unmount())
    root = createRoot(host)
    booking.pauses.mockResolvedValue({ data: [{ store_id: 'st1', organization_id: 'org-qw', pause_type: 'private', starts_on: '2026-10-24', ends_on: '2026-10-24' }], error: null })
    await render()
    await vi.waitFor(() => expect(badgeOf('今日だけ停止')).not.toBeNull())
  })

  it('受付締切・受付範囲を読めなければ出さない', async () => {
    booking.value = { ...booking.value, scenarios: [scenario('受付可', {})] }
    booking.getPublic.mockResolvedValue([row('受付可')])
    booking.horizon.mockResolvedValue({ data: null, error: new Error('x') })
    await render()
    await vi.waitFor(() => expect(booking.horizon).toHaveBeenCalled())
    await act(async () => { await Promise.resolve() })
    expect(badgeOf('受付可')).toBeNull()
  })
})

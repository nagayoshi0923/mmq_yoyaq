// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const booking = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('./hooks/useBookingData', () => ({ useBookingData: () => booking.value }))
vi.mock('./hooks/useStoreTopPerformances', () => ({ useStoreTopPerformances: () => ({ performances: [], storeOptions: [], nextDates: new Map() }) }))
vi.mock('./components/top/StoreSearchSection', () => ({ StoreSearchSection: () => null }))
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
  release_date: undefined, listed_at: null, ...over,
})

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  booking.value = {
    scenarios: [
      scenario('古い', { listed_at: '2026-01-22T03:00:00Z' }),
      scenario('新しいタグなし', { listed_at: '2026-10-13T03:00:00Z' }),
      scenario('中間', { listed_at: '2026-09-16T03:00:00Z', is_new: true }),
    ],
    allEvents: [], blockedSlots: [], stores: [], privateBookingDeadlineDays: 14, isLoading: false, isFetching: false,
    loadData: () => Promise.resolve(), organizationNotFound: false, organizationId: 'org-qw', organizationName: 'クインズワルツ',
    organizationHeaderImageUrl: null, organizationPublicBookingHeroDescription: 'x', organizationThemeColor: null,
  }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('店舗トップの新作一覧とカタログ（QW-20261023-001）', () => {
  it('その組織の公開作品を掲載登録日の新しい順に出し、すべて見る・カタログはその組織のカタログへ', async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={['/queens-waltz']}><PublicBookingTop organizationSlug="queens-waltz" /></MemoryRouter>))
    const section = host.querySelector('#new-arrivals')
    expect([...(section?.querySelectorAll('h3') ?? [])].map((h) => h.textContent)).toEqual(['新しいタグなし', '中間', '古い'])
    expect(section?.textContent).toContain('この組織で遊べる、新しく掲載された作品')
    expect(section?.querySelector('a')?.getAttribute('href')).toBe('/queens-waltz/catalog')
    const catalog = [...host.querySelectorAll('a')].find((a) => a.textContent === 'カタログ')
    expect(catalog?.getAttribute('href')).toBe('/queens-waltz/catalog')
  })
})

// @vitest-environment jsdom
// トップの新作一覧「すべて見る ›」の行き先（新作だけの一覧）。架空の作品・組織だけ。時計は 2026-10-24 JST に固定
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ platform: vi.fn(), booking: {} as Record<string, unknown> }))
vi.mock('@/pages/PlatformTop/hooks/platformTopData', () => ({ PLATFORM_RANGE_DAYS: 55, fetchPlatformTopData: m.platform }))
vi.mock('@/pages/PublicBookingTop/hooks/useBookingData', () => ({ useBookingData: () => m.booking }))
vi.mock('@/pages/PublicBookingTop/hooks/useStoreTopPerformances', () => ({ useStoreTopPerformances: () => ({ performances: [], storeOptions: [], nextDates: new Map() }) }))
vi.mock('@/components/layout/PublicLayout', () => ({ PublicLayout: ({ children }: { children: unknown }) => <>{children}</> }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/components/seo/JsonLd', () => ({ JsonLd: () => null }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: vi.fn() }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: vi.fn() }))
vi.mock('@/components/public-top/useScenarioMarks', () => ({ useScenarioMarks: () => ({ marks: null, dialog: null }) }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({ publicBookingReadApi: { listPrivatePauses: vi.fn().mockResolvedValue({ data: [], error: null }) } }))
import { NewArrivalsPage } from './index'
import { CatalogFilterSwitch } from './CatalogFilterSwitch'
import { newArrivalsPath, catalogPath } from './paths'
import { PlatformTop } from '@/pages/PlatformTop/index'

// 2026-10-24 から: 経過 89 日 = 2026-07-27、経過 90 日 = 2026-07-26
const sc = (id: string, over: Record<string, unknown> = {}) => ({
  id, slug: id, title: id, author: '', key_visual_url: null, genres: [], player_count_min: 4, player_count_max: 6,
  release_date: null, listed_at: '2026-10-20T03:00:00Z', organizations: [{ organization_id: 'o1', available_from: null, available_until: null }], is_recommended: false, ...over,
})
const fourteen = Array.from({ length: 14 }, (_, i) => sc(`新作${String(i + 1).padStart(2, '0')}`, { listed_at: `2026-10-${String(i + 1).padStart(2, '0')}T03:00:00Z` }))
const platformData = (scenarios: unknown[]) => ({
  prefectures: [], performances: [], stores: [],
  organizations: [{ id: 'o1', slug: 'aaa', name: '架空', logo_url: null, store_names: [], stores: [], store_count: 1, prefectures: [], scenario_count: 1 }],
  scenarios,
})
const orgScenario = (id: string, listed: string) => ({
  scenario_id: id, scenario_slug: id, scenario_title: id, key_visual_url: null, author: '', duration: 180, player_count_min: 4, player_count_max: 6,
  genre: [], participation_fee: 4000, status: 'available', is_new: false, listed_at: listed, available_from: null, available_until: null,
})

let root: Root
let host: HTMLDivElement
let client: QueryClient
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output> }
function Back() { const n = useNavigate(); return <button type="button" data-testid="back" onClick={() => n(-1)}>back</button> }
async function mount(path: string) {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter key={path} initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<PlatformTop />} />
          <Route path="/scenario" element={<CatalogFilterSwitch newArrivals={<NewArrivalsPage />} catalog={<p data-testid="catalog">全作品のカタログ</p>} />} />
          <Route path="/:org/catalog" element={<CatalogFilterSwitch newArrivals={<NewArrivalsPage organizationSlug="aaa" />} catalog={<p data-testid="catalog">組織の全作品のカタログ</p>} />} />
        </Routes>
        <Where /><Back />
      </MemoryRouter>
    </QueryClientProvider>,
  ))
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const titles = (sel: string) => [...host.querySelectorAll(`${sel} h3`)].map((h) => h.textContent)
const where = () => host.querySelector('[data-testid="where"]')?.textContent

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Element.prototype.scrollIntoView = vi.fn()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00+09:00'))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  m.platform.mockResolvedValue(platformData(fourteen))
  m.booking = {
    scenarios: [orgScenario('組織の新作', '2026-10-10T03:00:00Z'), orgScenario('組織の古い作品', '2026-01-22T03:00:00Z')],
    allEvents: [], stores: [], isLoading: false, isFetching: false, loadData: () => Promise.resolve(),
    organizationNotFound: false, organizationId: 'o1', organizationName: '架空組織',
  }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.useRealTimers() })

describe('新作一覧の URL', () => {
  it('全体は /scenario?filter=new、組織は /{org}/catalog?filter=new。全作品のカタログは filter なし', () => {
    expect(newArrivalsPath()).toBe('/scenario?filter=new')
    expect(newArrivalsPath('aaa')).toBe('/aaa/catalog?filter=new')
    expect(catalogPath()).toBe('/scenario')
    expect(catalogPath('aaa')).toBe('/aaa/catalog')
  })
})

describe('全体の新作一覧', () => {
  it('13 件以上: トップは 12 件、すべて見るの先は全件。並びは同じ', async () => {
    await mount('/')
    const top = titles('#new-arrivals')
    expect(top).toHaveLength(12)
    expect(host.querySelector('#new-arrivals a')?.getAttribute('href')).toBe('/scenario?filter=new')
    expect([...host.querySelectorAll('a')].find((a) => a.textContent === 'カタログ')?.getAttribute('href')).toBe('/scenario')
    await act(async () => (host.querySelector('#new-arrivals a') as HTMLAnchorElement).click())
    for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(where()).toBe('/scenario?filter=new')
    const all = titles('#new-arrivals-all')
    expect(all).toHaveLength(14)
    expect(all.slice(0, 12)).toEqual(top)
    expect(host.textContent).toContain('新作（掲載から 90 日）')
    expect(host.querySelector('[data-testid="new-arrivals-filter-chip"]')?.textContent).toContain('新作のみ表示中')
    expect(host.textContent).toContain('14 作品')
  })

  it('境界の日（経過 89 日は入り、90 日と未来日は外れる）はトップと一覧で一致する', async () => {
    m.platform.mockResolvedValue(platformData([
      sc('経過89', { listed_at: '2026-07-26T15:00:00Z' }), sc('経過90', { listed_at: '2026-07-26T14:59:59Z' }), sc('未来', { release_date: '2026-10-25' }), sc('当日', { release_date: '2026-10-24' }),
    ]))
    await mount('/')
    expect(titles('#new-arrivals')).toEqual(['当日', '経過89'])
    await mount('/scenario?filter=new')
    expect(titles('#new-arrivals-all')).toEqual(['当日', '経過89'])
  })

  it('直接 URL で開く・再読み込み・解除・戻る', async () => {
    await mount('/scenario?filter=new')
    expect(titles('#new-arrivals-all')).toHaveLength(14)
    // 再読み込み（同じ URL で開き直す）
    await act(async () => root.unmount()); root = createRoot(host)
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await mount('/scenario?filter=new')
    expect(titles('#new-arrivals-all')).toHaveLength(14)
    // 札から解除すると全作品のカタログ、戻ると新作一覧
    await act(async () => (host.querySelector('[data-testid="new-arrivals-filter-chip"]') as HTMLAnchorElement).click())
    expect(where()).toBe('/scenario')
    expect(host.querySelector('[data-testid="catalog"]')).not.toBeNull()
    await act(async () => (host.querySelector('[data-testid="back"]') as HTMLButtonElement).click())
    for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(where()).toBe('/scenario?filter=new')
    expect(titles('#new-arrivals-all')).toHaveLength(14)
  })

  it('0 件なら「いま新作はありません」と全作品のカタログへの案内', async () => {
    m.platform.mockResolvedValue(platformData([sc('古い', { listed_at: '2026-01-22T03:00:00Z' })]))
    await mount('/scenario?filter=new')
    expect(host.querySelector('[data-testid="new-arrivals-empty"]')?.textContent).toContain('いま新作はありません')
    expect(host.querySelector('[data-testid="new-arrivals-empty"] a')?.getAttribute('href')).toBe('/scenario')
  })

  it('filter が無いカタログの URL は従来の全作品のカタログ', async () => {
    await mount('/scenario')
    expect(host.querySelector('[data-testid="catalog"]')).not.toBeNull()
    expect(host.querySelector('#new-arrivals-all')).toBeNull()
  })
})

describe('組織の新作一覧', () => {
  it('組織が保たれる（その組織の作品だけ。解除・トップへ戻るはその組織へ）', async () => {
    await mount('/aaa/catalog?filter=new')
    expect(titles('#new-arrivals-all')).toEqual(['組織の新作'])
    expect(host.textContent).toContain('架空組織の公開作品')
    expect(host.querySelector('[data-testid="new-arrivals-filter-chip"]')?.getAttribute('href')).toBe('/aaa/catalog')
    expect([...host.querySelectorAll('a')].find((a) => a.textContent?.includes('トップへ戻る'))?.getAttribute('href')).toBe('/aaa')
    await act(async () => (host.querySelector('[data-testid="new-arrivals-filter-chip"]') as HTMLAnchorElement).click())
    expect(where()).toBe('/aaa/catalog')
    expect(host.querySelector('[data-testid="catalog"]')?.textContent).toBe('組織の全作品のカタログ')
  })
})

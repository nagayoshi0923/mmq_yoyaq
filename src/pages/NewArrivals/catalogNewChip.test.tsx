// @vitest-environment jsdom
// カタログの「新作」チップ（2026-10-24 社長: 新作一覧は既存のカタログのチップで）。架空の作品・組織だけ。時計は 2026-10-24 JST に固定
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  platform: vi.fn(), booking: {} as Record<string, unknown>,
  views: vi.fn(), keys: vi.fn(), categories: vi.fn(), publicStores: vi.fn(),
  orgScenarios: vi.fn(), catalogStores: vi.fn(), resolveOrg: vi.fn(),
}))
vi.mock('@/pages/PlatformTop/hooks/platformTopData', () => ({ PLATFORM_RANGE_DAYS: 55, fetchPlatformTopData: m.platform }))
vi.mock('@/pages/PublicBookingTop/hooks/useBookingData', () => ({ useBookingData: () => m.booking }))
vi.mock('@/pages/PublicBookingTop/hooks/useStoreTopPerformances', () => ({ useStoreTopPerformances: () => ({ performances: [], storeOptions: [], nextDates: new Map() }) }))
vi.mock('@/pages/PublicBookingTop/components/top/StoreSearchSection', () => ({ StoreSearchSection: () => null }))
vi.mock('@/lib/api/platformPageReadApi', () => ({ platformPageReadApi: {
  listAvailableScenarioViews: m.views, getPublicAvailableScenarioKeys: m.keys, getAllPublicCategories: m.categories, getAllPublicStores: m.publicStores,
} }))
vi.mock('@/lib/api/scenarioPageReadApi', () => ({
  scenarioCatalogReadApi: { listAvailableScenarios: m.orgScenarios },
  scenarioPageReadApi: { listStoresForCatalog: m.catalogStores },
}))
vi.mock('@/lib/organization', () => ({ resolveOrganizationFromPathSegment: m.resolveOrg, getCurrentOrganizationId: async () => null }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({ publicBookingReadApi: { listPrivatePauses: vi.fn().mockResolvedValue({ data: [], error: null }) } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, isStaff: false }) }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: null }) }))
vi.mock('@/hooks/useOrgThemePreset', () => ({ useOrgThemePreset: () => ({ primary: '#e60012', accent: '#ffd400' }) }))
vi.mock('@/hooks/useFavorites', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }))
vi.mock('@/hooks/usePlayedScenarios', () => ({ usePlayedScenarios: () => ({ isPlayed: () => false }) }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/NavigationBar', () => ({ NavigationBar: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/components/seo/JsonLd', () => ({ JsonLd: () => null }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: vi.fn() }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: vi.fn() }))
vi.mock('@/components/public-top/useScenarioMarks', () => ({ useScenarioMarks: () => ({ marks: null, dialog: null }) }))
import { PlatformTop } from '@/pages/PlatformTop/index'
import { PublicBookingTop } from '@/pages/PublicBookingTop/index'
import { PlatformScenarioSearch } from '@/pages/PlatformScenarioSearch/index'
import { ScenarioCatalog } from '@/pages/ScenarioCatalog/index'
import { CatalogFilterSwitch } from './CatalogFilterSwitch'
import { newArrivalsPath } from './paths'

// 架空の作品: 今日 2026-10-24。経過 89 日 = 掲載 UTC 7/26 15:00（JST 7/27）、経過 90 日 = UTC 7/26 14:59:59（JST 7/26）
type Fx = { id: string; listed: string; release?: string | null; genre?: string[] }
const FRESH: Fx[] = Array.from({ length: 13 }, (_, i) => ({ id: `新作${String(i + 1).padStart(2, '0')}`, listed: `2026-10-${String(i + 1).padStart(2, '0')}T03:00:00Z` }))
const ALL: Fx[] = [
  ...FRESH,
  { id: '新作短時間', listed: '2026-10-20T05:00:00Z', genre: ['3時間以内'] },
  { id: '経過89', listed: '2026-07-26T15:00:00Z' },
  { id: '経過90', listed: '2026-07-26T14:59:59Z' },
  { id: '未来リリース', listed: '2026-10-01T03:00:00Z', release: '2026-10-25' },
  { id: '古い短時間', listed: '2026-01-22T03:00:00Z', genre: ['3時間以内'] },
  { id: '古いタグ新作', listed: '2026-01-22T03:00:00Z', genre: ['新作'] },
]
const view = (f: Fx, org = 'o1') => ({
  id: f.id, org_scenario_id: `${org}-${f.id}`, slug: f.id, title: f.id, author: '', key_visual_url: null, duration: 180,
  player_count_min: 4, player_count_max: 6, genre: f.genre ?? [], participation_fee: 4000, difficulty: null, release_date: f.release ?? null,
  organization_id: org, status: 'available', scenario_master_id: f.id, available_stores: [], created_at: f.listed, is_recommended: false, scenario_type: 'normal',
  organizations: { slug: org === 'o1' ? 'aaa' : 'bbb', name: org },
})
const platformScenario = (f: Fx) => ({
  id: f.id, slug: f.id, title: f.id, author: '', key_visual_url: null, genres: f.genre ?? [], player_count_min: 4, player_count_max: 6,
  release_date: f.release ?? null, listed_at: f.listed, organizations: [{ organization_id: 'o1', available_from: null, available_until: null }], is_recommended: false,
})
const orgScenario = (f: Fx) => ({
  scenario_id: f.id, scenario_slug: f.id, scenario_title: f.id, key_visual_url: null, author: '', duration: 180, player_count_min: 4, player_count_max: 6,
  genre: f.genre ?? [], participation_fee: 4000, status: 'available', is_new: false, release_date: f.release ?? undefined, listed_at: f.listed, available_from: null, available_until: null,
})

let root: Root
let host: HTMLDivElement
let client: QueryClient
function Where() { const l = useLocation(); return <output data-testid="where">{decodeURIComponent(l.pathname + l.search)}</output> }
function Back() { const n = useNavigate(); return <button type="button" data-testid="back" onClick={() => n(-1)}>back</button> }
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
async function mount(path: string) {
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter key={path} initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<PlatformTop />} />
          <Route path="/scenario" element={<CatalogFilterSwitch catalog={<PlatformScenarioSearch />} />} />
          <Route path="/aaa" element={<PublicBookingTop organizationSlug="aaa" />} />
          <Route path="/aaa/catalog" element={<CatalogFilterSwitch catalog={<ScenarioCatalog organizationSlug="aaa" />} />} />
        </Routes>
        <Where /><Back />
      </MemoryRouter>
    </QueryClientProvider>,
  ))
  await settle()
}
const where = () => host.querySelector('[data-testid="where"]')?.textContent
const chips = () => [...host.querySelectorAll('[data-testid="category-chips"] [data-chip]')].map((c) => c.getAttribute('data-chip'))
const selectedChips = () => [...host.querySelectorAll('[data-testid="category-chips"] [data-selected]')].map((c) => c.getAttribute('data-chip'))
const chip = (name: string) => host.querySelector(`[data-testid="category-chips"] [data-chip="${name}"]`) as HTMLElement
const catalogTitles = () => [...host.querySelectorAll('h3')].map((h) => h.textContent)
const topTitles = () => [...host.querySelectorAll('#new-arrivals h3')].map((h) => h.textContent)
const click = async (el: Element | null) => { await act(async () => (el as HTMLElement).click()); await settle() }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00+09:00'))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  m.platform.mockResolvedValue({
    prefectures: [], performances: [], stores: [],
    organizations: [{ id: 'o1', slug: 'aaa', name: 'o1', logo_url: null, store_names: [], stores: [], store_count: 1, prefectures: [], scenario_count: 1 }],
    scenarios: ALL.map(platformScenario),
  })
  m.views.mockResolvedValue({ data: ALL.map((f) => view(f)), error: null })
  m.keys.mockResolvedValue({ data: [], error: null })
  m.categories.mockResolvedValue({ data: [{ id: 'c1', name: '3時間以内', sort_order: 1 }, { id: 'c2', name: '新作', sort_order: 2 }, { id: 'c3', name: 'LARP', sort_order: 3 }], error: null })
  m.publicStores.mockResolvedValue({ data: [], error: null })
  m.orgScenarios.mockImplementation(async (orgId: string) => ({ data: ALL.slice(0, 3).concat(ALL.slice(13)).map((f) => view(f, orgId)), error: null }))
  m.catalogStores.mockResolvedValue({ data: [], error: null })
  m.resolveOrg.mockResolvedValue({ id: 'o1' })
  m.booking = {
    scenarios: ALL.slice(0, 3).concat(ALL.slice(13)).map(orgScenario), allEvents: [], blockedSlots: [], stores: [], privateBookingDeadlineDays: 14,
    isLoading: false, isFetching: false, loadData: () => Promise.resolve(), organizationNotFound: false, organizationId: 'o1', organizationName: 'o1',
    organizationHeaderImageUrl: null, organizationPublicBookingHeroDescription: 'x', organizationThemeColor: null,
  }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.useRealTimers() })

const EXPECTED_NEW = ['新作短時間', ...FRESH.map((f) => f.id).reverse(), '経過89']

describe('全体のカタログ（/scenario）の「新作」チップ', () => {
  it('チップ列の先頭（すべての次）に「新作」が 1 つだけ。最初は選ばれていない', async () => {
    await mount('/scenario')
    expect(chips()).toEqual(['すべて', '新作', '3時間以内', 'LARP'])
    expect(selectedChips()).toEqual([])
    expect(catalogTitles()).toHaveLength(ALL.length)
  })

  it('選ぶと 90 日以内だけ（経過 89 日は入り、90 日・未来・タグだけの新作は外れる）をトップと同じ並びで。外すと全作品', async () => {
    await mount('/scenario')
    await click(chip('新作'))
    expect(where()).toBe('/scenario?genre=新作')
    expect(selectedChips()).toEqual(['新作'])
    expect(catalogTitles()).toEqual(EXPECTED_NEW)
    await click(chip('新作'))
    expect(where()).toBe('/scenario')
    expect(catalogTitles()).toHaveLength(ALL.length)
  })

  it('ほかのチップとの組み合わせは既存の規則（どれか 1 つに当てはまれば出す）。新作が先、残りは元の並び', async () => {
    await mount('/scenario?genre=新作')
    await click(chip('3時間以内'))
    expect(where()).toBe('/scenario?genre=3時間以内&genre=新作')
    expect(selectedChips()).toEqual(['新作', '3時間以内'])
    expect(catalogTitles()).toEqual([...EXPECTED_NEW, '古い短時間'])
    await click(chip('新作'))
    expect(new Set(catalogTitles())).toEqual(new Set(['新作短時間', '古い短時間']))
  })

  it('13 件以上: トップは 12 件、すべて見るから開くと「新作」が選ばれ全件。先頭 12 件はトップと同じ。戻るとトップ', async () => {
    await mount('/')
    expect(topTitles()).toHaveLength(12)
    expect(topTitles()).toEqual(EXPECTED_NEW.slice(0, 12))
    const link = host.querySelector('#new-arrivals a') as HTMLAnchorElement
    expect(decodeURIComponent(link.getAttribute('href')!)).toBe('/scenario?genre=新作')
    expect([...host.querySelectorAll('a')].find((a) => a.textContent === 'カタログ')?.getAttribute('href')).toBe('/scenario')
    await click(link)
    expect(where()).toBe('/scenario?genre=新作')
    expect(selectedChips()).toEqual(['新作'])
    expect(catalogTitles()).toEqual(EXPECTED_NEW)
    await click(host.querySelector('[data-testid="back"]'))
    expect(where()).toBe('/')
  })

  it('直接 URL・再読み込みでも選んだ状態。前の版の ?filter=new も「新作」のチップへ', async () => {
    await mount('/scenario?genre=新作')
    expect(selectedChips()).toEqual(['新作'])
    expect(catalogTitles()).toEqual(EXPECTED_NEW)
    await act(async () => root.unmount()); root = createRoot(host)
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await mount('/scenario?genre=新作')
    expect(catalogTitles()).toEqual(EXPECTED_NEW)
    await mount('/scenario?filter=new')
    expect(where()).toBe('/scenario?genre=新作')
    expect(selectedChips()).toEqual(['新作'])
  })

  it('0 件なら既存の「該当するシナリオが見つかりませんでした」', async () => {
    m.views.mockResolvedValue({ data: [view(ALL[ALL.length - 1])], error: null })
    await mount('/scenario?genre=新作')
    expect(catalogTitles()).toEqual([])
    expect(host.textContent).toContain('該当するシナリオが見つかりませんでした')
  })

  it('一般のカタログ（filter なし）は全作品のまま', async () => {
    await mount('/scenario')
    expect(selectedChips()).toEqual([])
    expect(catalogTitles()).toHaveLength(ALL.length)
  })
})

describe('組織のカタログ（/{org}/catalog）の「新作」チップ', () => {
  it('組織トップのすべて見るから開くと、その組織の新作だけが「新作」選択中で出る。カタログボタンは全作品', async () => {
    await mount('/aaa')
    const orgExpected = ['新作短時間', '新作03', '新作02', '新作01', '経過89']
    expect(topTitles()).toEqual(orgExpected)
    const link = host.querySelector('#new-arrivals a') as HTMLAnchorElement
    expect(decodeURIComponent(link.getAttribute('href')!)).toBe('/aaa/catalog?genre=新作')
    expect([...host.querySelectorAll('a')].find((a) => a.textContent === 'カタログ')?.getAttribute('href')).toBe('/aaa/catalog')
    await click(link)
    expect(where()).toBe('/aaa/catalog?genre=新作')
    expect(m.orgScenarios).toHaveBeenCalledWith('o1')
    expect(selectedChips()).toEqual(['新作'])
    expect(catalogTitles()).toEqual(orgExpected)
    await click(chip('新作'))
    expect(where()).toBe('/aaa/catalog')
    expect(catalogTitles()).toHaveLength(9)
  })

  it('全体と組織の違い: 全体の新作（13 件以上）と組織の新作（その組織の作品だけ）', async () => {
    await mount('/scenario?genre=新作')
    expect(catalogTitles()).toHaveLength(EXPECTED_NEW.length)
    await mount('/aaa/catalog?genre=新作')
    expect(catalogTitles()).toHaveLength(5)
  })

  it('新作のチップは組織カタログでも重ならない', async () => {
    await mount('/aaa/catalog')
    expect(chips().filter((c) => c === '新作')).toHaveLength(1)
    expect(chips()[0]).toBe('すべて')
    expect(chips()[1]).toBe('新作')
  })
})

describe('URL', () => {
  it('すべて見るの行き先は既存のカテゴリのクエリ（genre）', () => {
    expect(decodeURIComponent(newArrivalsPath())).toBe('/scenario?genre=新作')
    expect(decodeURIComponent(newArrivalsPath('aaa'))).toBe('/aaa/catalog?genre=新作')
  })
})

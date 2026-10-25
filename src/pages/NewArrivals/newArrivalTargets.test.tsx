// @vitest-environment jsdom
// 新作の対象をトップとカタログで一致させる（Codex 最終レビュー 2026-10-24）。
// 実際の取得処理（fetchPlatformTopData・useBookingData・カタログの取得）を通し、API だけを架空の行で置き換える。時計は 2026-10-24 JST に固定
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- 架空の行（公開ビュー organization_scenarios_with_master の 1 行 = 組織 × 作品） ----
type Row = { id: string; org: 'o1' | 'o2' | 'o3'; listed: string; type?: string; master?: string; inKeys?: boolean; genre?: string[] }
const ROWS: Row[] = [
  { id: 'o1通常1', org: 'o1', listed: '2026-10-20T03:00:00Z' },
  { id: 'o1通常2', org: 'o1', listed: '2026-10-10T03:00:00Z' },
  { id: 'gm新作', org: 'o1', listed: '2026-10-22T03:00:00Z', type: 'gm_test' },        // 新しい gm_test の行
  { id: 'ガイド用', org: 'o2', listed: '2026-10-21T05:00:00Z', type: 'gm_test' },       // ガイド用の作品
  { id: 'キー外', org: 'o1', listed: '2026-10-21T03:00:00Z', inKeys: false },           // 公開キーに含まれない行
  { id: '未承認', org: 'o1', listed: '2026-10-19T03:00:00Z', master: 'pending', inKeys: false }, // 未承認のマスタ
  { id: 'o2通常', org: 'o2', listed: '2026-10-15T03:00:00Z' },                          // 他の組織の行
  { id: 'o3休止', org: 'o3', listed: '2026-10-23T03:00:00Z' },                          // 稼働していない組織の行
  { id: '共有', org: 'o1', listed: '2026-10-05T03:00:00Z' },
  { id: '共有', org: 'o2', listed: '2026-10-18T03:00:00Z' },
  { id: '共有', org: 'o3', listed: '2026-10-23T05:00:00Z' },
  { id: 'o1古い', org: 'o1', listed: '2026-01-22T03:00:00Z' },
]
const ACTIVE = { o1: 'aaa', o2: 'bbb' } as Record<string, string>
const viewRow = (r: Row) => ({
  id: r.id, org_scenario_id: `${r.org}-${r.id}`, slug: r.id, title: r.id, author: '', key_visual_url: null, duration: 180, weekend_duration: null,
  player_count_min: 4, player_count_max: 6, genre: r.genre ?? [], participation_fee: 4000, participation_costs: null, difficulty: null, release_date: null,
  status: 'available', scenario_type: r.type ?? 'normal', master_status: r.master ?? 'approved', is_shared: false, is_recommended: false,
  organization_id: r.org, scenario_master_id: r.id, available_stores: [], created_at: r.listed, available_from: null, available_until: null,
})
// サーバー側の絞り込みを再現する（各 API の .eq/.neq と同じ）
const nonGm = (r: Row) => (r.type ?? 'normal') !== 'gm_test'
const KEYS = ROWS.filter((r) => r.inKeys !== false && (r.master ?? 'approved') === 'approved').map((r) => ({ organization_id: r.org, scenario_master_id: r.id, org_status: 'available' }))

const m = vi.hoisted(() => ({ api: {} as Record<string, (...args: any[]) => any> }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }))
vi.mock('@/lib/api/platformPageReadApi', () => ({ platformPageReadApi: new Proxy({}, { get: (_t, k: string) => m.api[`platform.${k}`] }) }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({
  publicBookingReadApi: new Proxy({}, { get: (_t, k: string) => m.api[`booking.${k}`] }),
  publicBookingListReadApi: new Proxy({}, { get: (_t, k: string) => m.api[`list.${k}`] }),
}))
vi.mock('@/lib/api/scenarioPageReadApi', () => ({
  scenarioCatalogReadApi: { listAvailableScenarios: (...a: unknown[]) => m.api['catalog.listAvailableScenarios'](...a) },
  scenarioPageReadApi: { listStoresForCatalog: (...a: unknown[]) => m.api['catalog.listStoresForCatalog'](...a) },
}))
vi.mock('@/lib/organization', () => ({
  resolveOrganizationFromPathSegment: async (slug: string) => (slug === 'aaa' ? { id: 'o1', name: '組織1', slug: 'aaa', is_active: true } : null),
  getCurrentOrganizationId: async () => null,
}))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: vi.fn().mockResolvedValue([]) } }))
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
vi.mock('@/pages/PublicBookingTop/components/top/StoreSearchSection', () => ({ StoreSearchSection: () => null }))
import { PlatformTop } from '@/pages/PlatformTop/index'
import { PublicBookingTop } from '@/pages/PublicBookingTop/index'
import { PlatformScenarioSearch } from '@/pages/PlatformScenarioSearch/index'
import { ScenarioCatalog } from '@/pages/ScenarioCatalog/index'

const ok = <T,>(data: T) => Promise.resolve({ data, error: null })
let root: Root
let host: HTMLDivElement
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
async function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter key={path} initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<PlatformTop />} />
          <Route path="/scenario" element={<PlatformScenarioSearch />} />
          <Route path="/aaa" element={<PublicBookingTop organizationSlug="aaa" />} />
          <Route path="/aaa/catalog" element={<ScenarioCatalog organizationSlug="aaa" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  ))
  await settle()
}
const titles = (sel: string) => [...host.querySelectorAll(`${sel} h3`)].map((h) => h.textContent)

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  window.sessionStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00+09:00'))
  m.api = {
    // 全体トップ・組織トップ
    'platform.listActiveOrganizations': vi.fn(() => ok(Object.entries(ACTIVE).map(([id, slug]) => ({ id, slug, name: id, logo_url: null })))),
    'platform.getPublicAvailableScenarioKeys': vi.fn(() => ok(KEYS)),
    'list.listAvailableScenarios': vi.fn((orgId: string | null) => ok(ROWS.filter(nonGm).filter((r) => !orgId || r.org === orgId).map(viewRow))),
    'list.listPublicStores': vi.fn(() => ok([])),
    'list.listAllPublicEventsInRange': vi.fn(() => ok([])),
    'list.listPublicEventsInRange': vi.fn(() => ok([])),
    'list.latestPublicOpenEventDate': vi.fn(async () => ({ date: null, error: null })),
    'booking.listPerformancePauses': vi.fn(() => ok([])),
    'booking.listPrivatePauses': vi.fn(() => ok([])),
    'booking.getPrivateBookingDeadlineDays': vi.fn(() => ok(14)),
    'booking.getScenarioLikesCount': vi.fn(() => ok([])),
    // 全体カタログ（gm_test を除かない既存の取得。休止中の組織は組織の結合が読めない）
    'platform.listAvailableScenarioViews': vi.fn(() => ok(ROWS.map((r) => ({ ...viewRow(r), organizations: ACTIVE[r.org] ? { slug: ACTIVE[r.org], name: r.org } : null })))),
    'platform.getAllPublicStores': vi.fn(() => ok([])),
    'platform.getAllPublicCategories': vi.fn(() => ok([{ id: 'c1', name: 'SF', sort_order: 1 }])),
    // 組織カタログ
    'catalog.listAvailableScenarios': vi.fn((orgId: string | null) => ok(ROWS.filter(nonGm).filter((r) => !orgId || r.org === orgId).map(viewRow))),
    'catalog.listStoresForCatalog': vi.fn(() => ok([])),
  }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.useRealTimers() })

// 対象: 稼働中（o1・o2）・公開キーに含まれる・gm_test でない・承認済み。全体の「共有」は o1 の 10/05（o3 の行は数えない）
const GLOBAL_NEW = ['o1通常1', 'o2通常', 'o1通常2', '共有']
const ORG_NEW = ['o1通常1', 'o1通常2', '共有']

describe('新作の対象（トップとカタログの「新作」チップで一致）', () => {
  it('全体: トップの新作とカタログの「新作」チップが件数・作品・並びまで一致（gm_test・キー外・未承認・休止組織を除く）', async () => {
    await mount('/')
    expect(titles('#new-arrivals')).toEqual(GLOBAL_NEW)
    await mount('/scenario?genre=新作')
    expect(titles('main, body')).toEqual(GLOBAL_NEW)
  })

  it('組織: 組織トップの新作と組織カタログの「新作」チップが一致（他の組織の行を含まない）', async () => {
    await mount('/aaa')
    expect(titles('#new-arrivals')).toEqual(ORG_NEW)
    await mount('/aaa/catalog?genre=新作')
    expect(titles('main, body')).toEqual(ORG_NEW)
  })

  it('一般の全体カタログ「すべて」は既存のまま（gm_test の行も含む。キー外・未承認・休止組織は既存の絞り込みで出ない）', async () => {
    await mount('/scenario')
    expect(new Set(titles('main, body'))).toEqual(new Set(['o1通常1', 'o1通常2', 'gm新作', 'ガイド用', 'o2通常', '共有', 'o1古い']))
  })

  it('一般の組織カタログ「すべて」は既存のまま', async () => {
    await mount('/aaa/catalog')
    expect(new Set(titles('main, body'))).toEqual(new Set(['o1通常1', 'o1通常2', '共有', 'o1古い']))
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformTopData } from './hooks/platformTopData'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), getPublic: vi.fn(), pauses: vi.fn(), deadline: vi.fn(), horizon: vi.fn() }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({ privateBookingSlotReadApi: { getEffectiveDeadlineDays: mocks.deadline, getEffectiveHorizonDays: mocks.horizon } }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: mocks.getPublic } }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({ publicBookingReadApi: { listPrivatePauses: mocks.pauses } }))
vi.mock('./hooks/platformTopData', () => ({ PLATFORM_RANGE_DAYS: 55, fetchPlatformTopData: mocks.fetch }))
vi.mock('./hooks/usePlatformNewArrivalNext', () => ({ usePlatformNewArrivalNext: () => ({ performances: [], stateOf: () => 'ready', retry: () => {} }) }))
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/components/seo/JsonLd', () => ({ JsonLd: () => null }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: vi.fn() }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: vi.fn() }))
vi.mock('@/components/public-top/useScenarioMarks', () => ({ useScenarioMarks: () => ({ marks: null, dialog: null }) }))
import { PlatformTop } from './index'

const data: PlatformTopData = {
  performances: [],
  scenarios: [],
  prefectures: ['東京都'],
  organizations: [
    { id: 'o1', slug: 'queens-waltz', name: 'クインズワルツ', logo_url: null, store_names: ['大塚店'], stores: [{ id: 's1', name: '大塚店' }], store_count: 1, prefectures: ['東京都'], scenario_count: 12 },
  ],
} as unknown as PlatformTopData

let root: Root
let host: HTMLDivElement
function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}
async function render(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="*" element={<><PlatformTop /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  ))
  await vi.waitFor(() => expect(host.querySelector('#organizations a')).not.toBeNull())
}
const where = () => host.querySelector('[data-testid="where"]')?.textContent
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label)
const section = (id: string) => host.querySelector(`#${id}`)
const cardHrefs = (id: string) => [...(section(id)?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  // 時計は固定（JST 2026-10-24）。新作の期間（90 日）の判定に使う
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00+09:00'))
  mocks.getPublic.mockResolvedValue([])
  mocks.pauses.mockResolvedValue({ data: [], error: null })
  mocks.deadline.mockResolvedValue({ data: 1, error: null })
  mocks.horizon.mockResolvedValue({ data: 30, error: null })
  Element.prototype.scrollIntoView = vi.fn()
  mocks.fetch.mockResolvedValue(data)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.useRealTimers() })

describe('友だちと貸切で遊ぶ →「貸切できる作品を探す」', () => {
  it('トップの中に枠は開かず、貸切を始めるページへ遷移する。通常の参加店舗は組織トップのまま', async () => {
    await render()
    const link = [...host.querySelectorAll('#private-booking a')].find((a) => a.textContent === '貸切できる作品を探す')
    expect(link?.getAttribute('href')).toBe('/private-booking/select-organization')
    expect(button('参加店舗から選ぶ')).toBeUndefined()
    expect(section('private-organizations')).toBeNull()
    expect(cardHrefs('organizations')).toEqual(['/queens-waltz'])
    expect(section('organizations')?.textContent).toContain('今月の空きはありません')
    await act(async () => (link as HTMLAnchorElement).click())
    expect(where()).toBe('/private-booking/select-organization')
  })

  it('前の作りの /?pick=private で来ても、トップに貸切用の枠は出さない', async () => {
    await render('/?pick=private')
    expect(section('private-organizations')).toBeNull()
    expect(host.textContent).not.toContain('貸切する店舗を選ぶ')
  })
})

describe('新作一覧とカタログ（QW-20261023-001）', () => {
  const sc = (id: string, over: Record<string, unknown>) => ({
    id, slug: id, title: id, author: '', key_visual_url: null, genres: ['新作'], player_count_min: 4, player_count_max: 6,
    release_date: null, listed_at: null, organizations: [{ organization_id: 'o1', available_from: null, available_until: null }], is_recommended: false, new_arrival_target: true, ...over,
  })

  it('残りわずかの直後に、公開作品をリリース日（無ければ掲載登録日）から 90 日以内だけ新しい順で出す（新作タグの無い作品も含む）。すべて見る・カタログは全体カタログへ', async () => {
    mocks.fetch.mockResolvedValue({
      ...data,
      scenarios: [
        sc('古い新作', { listed_at: '2026-08-14T03:00:00Z' }),
        sc('期間外', { listed_at: '2026-06-14T03:00:00Z' }),
        sc('未来', { release_date: '2026-11-01' }),
        sc('タグなし', { genres: [], listed_at: '2026-10-20T03:00:00Z' }),
        sc('日付なし', {}),
        sc('最新', { listed_at: '2026-10-13T03:00:00Z' }),
        sc('リリース日あり', { release_date: '2026-10-01', listed_at: '2026-01-22T03:00:00Z' }),
      ],
    })
    await render()
    const titles = [...(section('new-arrivals')?.querySelectorAll('h3') ?? [])].map((h) => h.textContent)
    expect(titles).toEqual(['タグなし', '最新', 'リリース日あり', '古い新作'])
    expect(section('new-arrivals')?.textContent).toContain('10/20 掲載')
    expect(section('new-arrivals')?.textContent).toContain('10/1 公演開始')
    expect(section('new-arrivals')?.textContent).toContain('全国の店舗で、新しく遊べるようになった作品')
    // 「すべて見る」は新作だけの一覧へ（全作品のカタログではない）。一般の「カタログ」は全作品のまま
    expect(section('new-arrivals')?.querySelector('a')?.getAttribute('href')).toBe('/scenario?genre=%E6%96%B0%E4%BD%9C')
    const catalog = [...host.querySelectorAll('section a')].find((a) => a.textContent === '作品一覧')
    expect(catalog?.getAttribute('href')).toBe('/scenario')
  })
})

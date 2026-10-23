// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformTopData } from './hooks/platformTopData'

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('./hooks/platformTopData', () => ({ PLATFORM_RANGE_DAYS: 55, fetchPlatformTopData: mocks.fetch }))
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
  Element.prototype.scrollIntoView = vi.fn()
  mocks.fetch.mockResolvedValue(data)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks() })

describe('友だちと貸切で遊ぶ →「参加店舗から選ぶ」', () => {
  it('トップの中に枠は開かず、貸切を始めるページへ遷移する。通常の参加店舗は組織トップのまま', async () => {
    await render()
    const link = [...host.querySelectorAll('#private-booking a')].find((a) => a.textContent === '参加店舗から選ぶ')
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
    release_date: null, listed_at: null, is_recommended: false, ...over,
  })

  it('残りわずかの直後に、公開作品をリリース日（無ければ掲載登録日）の新しい順で出す（新作タグの無い作品も含む）。すべて見る・カタログは全体カタログへ', async () => {
    mocks.fetch.mockResolvedValue({
      ...data,
      scenarios: [
        sc('古い新作', { listed_at: '2026-06-14T03:00:00Z' }),
        sc('タグなし', { genres: [], listed_at: '2026-10-20T03:00:00Z' }),
        sc('日付なし', {}),
        sc('最新', { listed_at: '2026-10-13T03:00:00Z' }),
        sc('リリース日あり', { release_date: '2026-10-01', listed_at: '2026-01-22T03:00:00Z' }),
      ],
    })
    await render()
    const titles = [...(section('new-arrivals')?.querySelectorAll('h3') ?? [])].map((h) => h.textContent)
    expect(titles).toEqual(['タグなし', '最新', 'リリース日あり', '古い新作'])
    expect(section('new-arrivals')?.textContent).toContain('掲載登録日：2026.10.20')
    expect(section('new-arrivals')?.textContent).not.toContain('公開日')
    expect(section('new-arrivals')?.textContent).toContain('全国の公開作品から、新しい物語を見つけよう')
    expect(section('new-arrivals')?.querySelector('a')?.getAttribute('href')).toBe('/scenario')
    const catalog = [...host.querySelectorAll('section a')].find((a) => a.textContent === 'カタログ')
    expect(catalog?.getAttribute('href')).toBe('/scenario')
    const order = [...host.querySelectorAll('main > section')].map((s) => s.id)
    expect(order.indexOf('new-arrivals')).toBe(order.indexOf('private-booking') - 1)
  })
})

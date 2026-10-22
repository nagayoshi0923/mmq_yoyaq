// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformOrganization } from '@/pages/PlatformTop/hooks/platformTopData'

const mocks = vi.hoisted(() => ({ orgs: vi.fn(), scenarios: vi.fn() }))
vi.mock('@/pages/PlatformTop/hooks/platformTopData', () => ({ fetchPlatformOrganizations: mocks.orgs }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getPublic: mocks.scenarios } }))
vi.mock('@/components/layout/PublicLayout', () => ({ PublicLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: vi.fn() }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: vi.fn() }))
import { PrivateBookingStart } from './index'
import { scenariosForStores } from './scenariosForStores'
import { parseStoreIdsParam, privateGroupCreatePath, privateScenarioTabPath } from './paths'

const qw: PlatformOrganization = {
  id: 'o1', slug: 'queens-waltz', name: 'クインズワルツ', logo_url: null,
  store_names: ['大塚店', '高田馬場店'], stores: [{ id: 's1', name: '大塚店' }, { id: 's2', name: '高田馬場店' }],
  store_count: 2, prefectures: ['東京都'], scenario_count: 12,
}
const other: PlatformOrganization = {
  id: 'o2', slug: 'saitama-mm', name: '埼玉ミステリー', logo_url: null,
  store_names: ['大宮店'], stores: [{ id: 's3', name: '大宮店' }], store_count: 1, prefectures: ['埼玉県'], scenario_count: 3,
}
const scenarios = [
  { id: 'sc1', slug: 'factor', title: 'ファクター', author: '作者A', duration: 210, player_count_min: 6, player_count_max: 8, participation_fee: 4500, accepts_private_booking: true, available_stores: [] },
  { id: 'sc2', slug: null, title: '馬場だけ', author: '作者B', duration: 120, player_count_min: 4, player_count_max: 4, accepts_private_booking: true, available_stores: ['s2'] },
  { id: 'sc3', slug: 'off', title: '受付停止', author: '作者C', duration: 120, player_count_min: 4, player_count_max: 4, accepts_private_booking: false },
]

let root: Root
let host: HTMLDivElement
function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}
async function render(path: string, organizationSlug?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="*" element={<><PrivateBookingStart organizationSlug={organizationSlug} /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  ))
  await vi.waitFor(() => expect(host.textContent).not.toContain('読み込み中'))
}
const where = () => host.querySelector('[data-testid="where"]')?.textContent
const buttons = (label: string) => [...host.querySelectorAll('button')].filter((b) => b.textContent === label)
const orgCard = (slug: string) => host.querySelector(`[data-org="${slug}"]`) as HTMLButtonElement | null
const scenarioCards = () => [...host.querySelectorAll('[data-testid="private-scenario-grid"] > [aria-label]')] as HTMLElement[]
const titles = () => scenarioCards().map((c) => c.getAttribute('aria-label'))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Element.prototype.scrollIntoView = vi.fn()
  mocks.orgs.mockResolvedValue({ organizations: [qw, other], prefectures: ['東京都', '埼玉県'] })
  mocks.scenarios.mockResolvedValue(scenarios)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks() })

describe('貸切を始める（/private-booking/select-organization）', () => {
  it('見出し・説明・エリアのチップ・組織カード（ロゴ・名前・店舗名・作品数）と「戻る」を出す', async () => {
    await render('/private-booking/select-organization')
    expect(host.querySelector('h1')?.textContent).toBe('貸切を始める')
    expect(host.textContent).toContain('1. 貸切する店舗を選ぶ')
    expect(host.textContent).toContain('店舗を選ぶと、その店舗で貸切できる作品の一覧が開きます')
    expect(buttons('戻る')).toHaveLength(1)
    expect(buttons('全国')).toHaveLength(1)
    expect(buttons('東京')).toHaveLength(1)
    expect(orgCard('queens-waltz')?.textContent).toContain('大塚店・高田馬場店 2 店舗 ・ 12 作品')
    expect(host.textContent).toContain('上で店舗を選ぶと、ここに作品が出ます')
    expect(mocks.scenarios).not.toHaveBeenCalled()
  })

  it('エリアのチップで組織を絞れる', async () => {
    await render('/private-booking/select-organization')
    await act(async () => buttons('埼玉')[0].click())
    expect(orgCard('queens-waltz')).toBeNull()
    expect(orgCard('saitama-mm')).not.toBeNull()
  })

  it('組織を押すと選択状態になり、希望店舗のチップと貸切できる作品の一覧が同じページに出る', async () => {
    await render('/private-booking/select-organization')
    await act(async () => orgCard('queens-waltz')!.click())
    await vi.waitFor(() => expect(titles()).toEqual(['ファクター', '馬場だけ']))
    expect(where()).toBe('/private-booking/select-organization?org=queens-waltz')
    expect(mocks.scenarios).toHaveBeenCalledWith('o1')
    expect(host.querySelector('[data-testid="selected-organization"]')?.textContent).toContain('クインズワルツ')
    expect(buttons('どれでも可')[0].getAttribute('aria-pressed')).toBe('true')
    // 作品を押すと作品ページの貸切タブへ（希望店舗なし）
    await act(async () => scenarioCards()[0].click())
    expect(where()).toBe('/queens-waltz/scenario/factor?tab=private')
  })

  it('希望店舗を選ぶと URL に残り、その店舗で上演できる作品に絞って、作品ページへ stores で渡す', async () => {
    await render('/private-booking/select-organization?org=queens-waltz')
    await vi.waitFor(() => expect(titles()).toHaveLength(2))
    await act(async () => buttons('大塚店')[0].click())
    expect(where()).toBe('/private-booking/select-organization?org=queens-waltz&stores=s1')
    expect(titles()).toEqual(['ファクター'])
    await act(async () => buttons('高田馬場店')[0].click())
    expect(titles()).toEqual(['ファクター', '馬場だけ'])
    await act(async () => scenarioCards()[1].click())
    expect(where()).toBe('/queens-waltz/scenario/sc2?tab=private&stores=s1,s2')
  })

  it('「別の店舗を選ぶ」で同じページの組織の一覧に戻る', async () => {
    await render('/private-booking/select-organization?org=queens-waltz&stores=s1')
    await act(async () => (host.querySelector('[data-testid="choose-another-store"]') as HTMLButtonElement).click())
    expect(where()).toBe('/private-booking/select-organization')
    expect(orgCard('queens-waltz')).not.toBeNull()
    expect(host.querySelector('[data-testid="selected-organization"]')).toBeNull()
  })

  it('組織が 1 つしか無いときは選んだ状態で開く。店舗が 1 つなら希望店舗のチップは出さない', async () => {
    mocks.orgs.mockResolvedValue({ organizations: [other], prefectures: ['埼玉県'] })
    await render('/private-booking/select-organization')
    expect(host.querySelector('[data-testid="selected-organization"]')?.textContent).toContain('埼玉ミステリー')
    expect(buttons('どれでも可')).toHaveLength(0)
    await vi.waitFor(() => expect(titles().length).toBeGreaterThan(0))
  })
})

describe('強制スクロールしない（QW-20261022-013）', () => {
  const above = () => vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: -800 } as DOMRect)

  it('URL で組織が決まった状態で開いた・戻ったとき（読込完了）は、店舗の欄へ自動で送らない', async () => {
    const rect = above()
    await render('/private-booking/select-organization?org=queens-waltz&stores=s1')
    await vi.waitFor(() => expect(titles()).toEqual(['ファクター']))
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    // 希望店舗のチップを押しても送らない（選んだ店舗が見えたまま）
    await act(async () => buttons('高田馬場店')[0].click())
    expect(decodeURIComponent(where() ?? '')).toBe('/private-booking/select-organization?org=queens-waltz&stores=s1,s2')
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    rect.mockRestore()
  })

  it('一覧から組織を押したときだけ、店舗の欄の頭に合わせる', async () => {
    const rect = above()
    await render('/private-booking/select-organization')
    await act(async () => orgCard('queens-waltz')!.click())
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1))
    rect.mockRestore()
  })
})

describe('組織トップから（/{org}/private-booking-select、日付なし）', () => {
  it('組織を選んだ状態で開き、「別の店舗を選ぶ」は貸切を始めるページへ', async () => {
    await render('/queens-waltz/private-booking-select', 'queens-waltz')
    expect(host.querySelector('[data-testid="selected-organization"]')?.textContent).toContain('クインズワルツ')
    await vi.waitFor(() => expect(titles()).toEqual(['ファクター', '馬場だけ']))
    await act(async () => buttons('高田馬場店')[0].click())
    expect(where()).toBe('/queens-waltz/private-booking-select?stores=s2')
    await act(async () => (host.querySelector('[data-testid="choose-another-store"]') as HTMLButtonElement).click())
    expect(where()).toBe('/private-booking/select-organization')
  })
})

describe('部品', () => {
  it('作品ページの URL と stores の読み取り', () => {
    expect(privateScenarioTabPath('qw', { id: 'x', slug: 'a b' })).toBe('/qw/scenario/a%20b?tab=private')
    expect(privateScenarioTabPath('qw', { id: 'x' }, ['s1', 's2'])).toBe('/qw/scenario/x?tab=private&stores=s1,s2')
    expect(parseStoreIdsParam(' s1,,s2,s1 ')).toEqual(['s1', 's2'])
    expect(parseStoreIdsParam(null)).toEqual([])
  })
  it('希望店舗で作品を絞る（対応店舗の指定が無い作品は全店舗）', () => {
    const rows = [{ id: 'a', available_stores: [] }, { id: 'b', available_stores: ['s2'] }, { id: 'c', available_stores: null }]
    expect(scenariosForStores(rows, []).map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(scenariosForStores(rows, ['s1']).map((r) => r.id)).toEqual(['a', 'c'])
  })
})

describe('privateGroupCreatePath', () => {
  it('作品ページのどの入口のボタンでも、選んでいる希望店舗を stores で引き継ぐ', () => {
    expect(privateGroupCreatePath({ scenarioMasterId: 'm1', organizationSlug: 'queens-waltz', storeIds: ['s1', 's2', 's1'], noDates: true }))
      .toBe('/group/create?scenarioId=m1&org=queens-waltz&mode=no-dates&stores=s1,s2')
    expect(privateGroupCreatePath({ scenarioMasterId: 'm1', organizationSlug: 'queens-waltz', storeIds: ['s1'] }))
      .toBe('/group/create?scenarioId=m1&org=queens-waltz&stores=s1')
  })
  it('店舗を選んでいなければ stores を付けない', () => {
    expect(privateGroupCreatePath({ scenarioMasterId: 'm1', storeIds: [] })).toBe('/group/create?scenarioId=m1')
  })
})

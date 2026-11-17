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
vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }))
vi.mock('@/hooks/usePageMeta', () => ({ usePageMeta: vi.fn() }))
vi.mock('@/contexts/RouteScrollRestorationContext', () => ({ useReportRouteScrollRestoration: vi.fn() }))
vi.mock('@/hooks/useScrollRestoration', () => ({ saveScrollPositionForCurrentUrl: vi.fn() }))
import { PrivateBookingStart, buildPrivateWorks, matchesWorkQuery, FEATURED_WORK_COUNT } from './index'
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
const qwRows = [
  { id: 'sc1', slug: 'factor', title: 'ファクター', duration: 210, player_count_min: 6, player_count_max: 8, accepts_private_booking: true, available_stores: [] },
  { id: 'sc2', slug: null, title: '馬場だけ', duration: 120, player_count_min: 4, player_count_max: 4, accepts_private_booking: true, available_stores: ['s2'] },
  { id: 'sc3', slug: 'off', title: '受付停止', duration: 120, player_count_min: 4, player_count_max: 4, accepts_private_booking: false },
]
const otherRows = [
  { id: 'sc1', slug: 'factor', title: 'ファクター', duration: 210, player_count_min: 6, player_count_max: 8, accepts_private_booking: true, available_stores: [] },
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
const workRows = () => [...host.querySelectorAll('[data-testid="private-start-work"]')] as HTMLButtonElement[]
const titles = () => workRows().map((b) => b.querySelector('p')?.textContent)
const orgRow = (slug: string) => host.querySelector(`[data-org="${slug}"]`) as HTMLAnchorElement | null

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.orgs.mockResolvedValue({ organizations: [qw, other], prefectures: ['東京都', '埼玉県'] })
  mocks.scenarios.mockImplementation(async (orgId: string) => (orgId === 'o1' ? qwRows : otherRows))
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks() })

describe('貸切を始める（見本: 作品を選ぶ → 会社を選ぶ）', () => {
  it('貸切を受け付けている作品だけを出し、遊べる会社が多い作品を上にする。会社は作品を選ぶまで出さない', async () => {
    await render('/private-booking/select-organization')
    expect(host.textContent).toContain('1. 遊びたい作品を選ぶ')
    await vi.waitFor(() => expect(titles()).toEqual(['ファクター', '馬場だけ']))
    expect(workRows()[0].textContent).toContain('6〜8人・3時間30分')
    expect(host.textContent).toContain('上で作品を選ぶと、貸切できる会社が出ます。')
    expect(host.textContent).not.toContain('先にグループを作る')
  })

  it('作品を選ぶと URL に残り、その作品を遊べる会社と店舗が出て、「空きを見る」は作品ページの貸切タブへ', async () => {
    await render('/private-booking/select-organization')
    await vi.waitFor(() => expect(workRows()).toHaveLength(2))
    await act(async () => workRows()[0].click())
    expect(where()).toBe('/private-booking/select-organization?work=sc1')
    expect(workRows()[0].textContent).toContain('✓ 選択中')
    expect(orgRow('queens-waltz')?.textContent).toContain('東京・2店舗（大塚・高田馬場）')
    expect(orgRow('saitama-mm')?.textContent).toContain('埼玉・1店舗（大宮）')
    await act(async () => orgRow('queens-waltz')!.click())
    expect(where()).toBe('/queens-waltz/scenario/factor?tab=private')
  })

  it('地域のチップで会社を絞れる', async () => {
    await render('/private-booking/select-organization?work=sc1')
    await vi.waitFor(() => expect(orgRow('saitama-mm')).not.toBeNull())
    const chip = [...host.querySelectorAll('button')].find((b) => b.textContent === '埼玉')!
    await act(async () => chip.click())
    expect(where()).toBe('/private-booking/select-organization?work=sc1&area=%E5%9F%BC%E7%8E%89%E7%9C%8C')
    expect(orgRow('queens-waltz')).toBeNull()
    expect(orgRow('saitama-mm')).not.toBeNull()
  })

  it('上演店舗の指定がある作品は、その店舗だけを出す', async () => {
    await render('/private-booking/select-organization?work=sc2')
    await vi.waitFor(() => expect(orgRow('queens-waltz')).not.toBeNull())
    expect(orgRow('queens-waltz')?.textContent).toContain('1店舗（高田馬場）')
    expect(orgRow('saitama-mm')).toBeNull()
  })

  it('組織のページから開いたときは、その組織の作品・会社だけ', async () => {
    await render('/queens-waltz/private-booking-select?work=sc1', 'queens-waltz')
    await vi.waitFor(() => expect(orgRow('queens-waltz')).not.toBeNull())
    expect(orgRow('saitama-mm')).toBeNull()
    expect(mocks.scenarios).toHaveBeenCalledTimes(1)
  })

  it('作品名で探せる', async () => {
    await render('/private-booking/select-organization')
    await vi.waitFor(() => expect(workRows()).toHaveLength(2))
    const input = host.querySelector('input[type="search"]') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'ばば')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(titles()).toEqual([])
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'ふぁくたー')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(titles()).toEqual(['ファクター'])
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'ファク')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(titles()).toEqual(['ファクター'])
  })
})

describe('作品のまとめ方', () => {
  it('募集期間の外の作品は出さない。何も探していないときは人気の数件だけ出す前提の並び', () => {
    const works = buildPrivateWorks([
      { org: qw, rows: [{ ...qwRows[0], booking_end_date: '2026-01-01' }, qwRows[1]] },
    ], '2026-11-18')
    expect(works.map((w) => w.id)).toEqual(['sc2'])
    expect(FEATURED_WORK_COUNT).toBeGreaterThan(0)
  })
  it('作品名の検索は空白・全角半角・カタカナひらがなの違いを気にしない', () => {
    expect(matchesWorkQuery('ファクター', 'ふぁく')).toBe(true)
    expect(matchesWorkQuery('GLORIA MEMORIES', 'gloriamem')).toBe(true)
    expect(matchesWorkQuery('ファクター', '馬場')).toBe(false)
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

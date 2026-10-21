// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/layout/Header', () => ({ Header: () => null }))
vi.mock('@/components/layout/NavigationBar', () => ({ NavigationBar: () => null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'qa@example.test' } }) }))
vi.mock('@/hooks/usePrivateGroup', () => ({ usePrivateGroup: () => ({ createGroup: vi.fn(), loading: false, error: null }) }))
vi.mock('@/lib/organization', () => ({
  resolveOrganizationFromPathSegment: vi.fn(async () => ({ id: 'org1' })),
  getCurrentOrganizationId: vi.fn(async () => 'org1'),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/privateGroupChat', () => ({ announceNextGroup: vi.fn() }))
vi.mock('@/lib/api', () => ({ scenarioApi: { getByIdOrSlug: vi.fn() } }))
vi.mock('@/lib/api/privateGroupPageReadApi', () => ({
  privateGroupPageReadApi: {
    findScenarioForGroup: vi.fn(async () => ({ data: { scenario_master_id: '10000000-0000-0000-0000-000000000001', title: 'ファクター', player_count_max: 8, available_stores: ['s1', 's2'] }, error: null })),
    listActiveStoresForGroup: vi.fn(async () => ({ data: [
      { id: 's1', name: '大塚店', address: '東京都豊島区' },
      { id: 's2', name: '高田馬場店', address: '東京都新宿区' },
      { id: 's3', name: '大宮店', address: '埼玉県さいたま市' },
    ], error: null })),
  },
}))
import { PrivateGroupCreate } from './index'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks() })

const checked = () => [...host.querySelectorAll('[role="checkbox"]')]
  .filter((c) => c.getAttribute('data-state') === 'checked')
  .map((c) => c.closest('div.cursor-pointer')?.textContent)

describe('貸切グループ作成の希望店舗の初期値（?stores=）', () => {
  it('作品ページから渡された店舗を選んだ状態で開き、作品が上演できない店舗は外す', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/group/create?scenarioId=10000000-0000-0000-0000-000000000001&org=queens-waltz&mode=no-dates&stores=s2,s3']}>
          <PrivateGroupCreate />
        </MemoryRouter>
      </QueryClientProvider>,
    ))
    await vi.waitFor(() => expect(host.textContent).toContain('高田馬場店'))
    expect(checked()).toEqual(['高田馬場店東京都新宿区'])
  })

  it('stores が無ければ何も選ばない（従来どおり）', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/group/create?scenarioId=10000000-0000-0000-0000-000000000001&org=queens-waltz&mode=no-dates']}>
          <PrivateGroupCreate />
        </MemoryRouter>
      </QueryClientProvider>,
    ))
    await vi.waitFor(() => expect(host.textContent).toContain('高田馬場店'))
    expect(checked()).toEqual([])
  })
})

async function renderCreate(query: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/group/create?scenarioId=10000000-0000-0000-0000-000000000001&org=queens-waltz&mode=no-dates${query}`]}>
        <PrivateGroupCreate />
      </MemoryRouter>
    </QueryClientProvider>,
  ))
}

const storesWithTemporary = [
  { id: 's1', name: '大塚店', address: '東京都豊島区', ownership_type: 'corporate', is_temporary: false, status: 'active' },
  { id: 't1', name: '臨時会場A', address: '東京都渋谷区', ownership_type: 'corporate', is_temporary: true, status: 'active' },
  { id: 't2', name: '臨時会場B', address: '東京都港区', ownership_type: 'corporate', is_temporary: true, status: 'active' },
  { id: 'o1', name: '事務所', address: '東京都千代田区', ownership_type: 'office', is_temporary: false, status: 'active' },
]

describe('貸切グループ作成で選べる店舗（監査 C2: 作品ページ・DB と同じ条件）', () => {
  it('作品の上演店舗に明示した臨時会場は選べ、URL で渡されても外さない。指定外の臨時会場とオフィスは出さない', async () => {
    vi.mocked(privateGroupPageReadApi.findScenarioForGroup).mockResolvedValueOnce({ data: { scenario_master_id: '10000000-0000-0000-0000-000000000001', title: 'ファクター', player_count_max: 8, available_stores: ['s1', 't1', 'o1'] }, error: null } as never)
    vi.mocked(privateGroupPageReadApi.listActiveStoresForGroup).mockResolvedValueOnce({ data: storesWithTemporary, error: null } as never)
    await renderCreate('&stores=t1,t2')
    await vi.waitFor(() => expect(host.textContent).toContain('臨時会場A'))
    expect(host.textContent).not.toContain('臨時会場B')
    expect(host.textContent).not.toContain('事務所')
    expect(checked()).toEqual(['臨時会場A東京都渋谷区'])
  })

  it('作品に上演店舗の指定が無ければ、臨時会場は従来どおり出さない', async () => {
    vi.mocked(privateGroupPageReadApi.findScenarioForGroup).mockResolvedValueOnce({ data: { scenario_master_id: '10000000-0000-0000-0000-000000000001', title: 'ファクター', player_count_max: 8, available_stores: [] }, error: null } as never)
    vi.mocked(privateGroupPageReadApi.listActiveStoresForGroup).mockResolvedValueOnce({ data: storesWithTemporary, error: null } as never)
    await renderCreate('&stores=t1,s1')
    await vi.waitFor(() => expect(host.textContent).toContain('大塚店'))
    expect(host.textContent).not.toContain('臨時会場')
    expect(host.textContent).not.toContain('事務所')
    expect(checked()).toEqual(['大塚店東京都豊島区'])
  })
})

describe('公開停止の作品（監査 C3）', () => {
  it('作品が取れない（公開停止・貸切受付外）ときは、いま受け付けていないと出してグループを作らせない', async () => {
    vi.mocked(privateGroupPageReadApi.findScenarioForGroup).mockResolvedValueOnce({ data: null, error: null } as never)
    await renderCreate('')
    await vi.waitFor(() => expect(host.textContent).toContain('この作品はいま貸切を受け付けていません'))
    expect(host.textContent).not.toContain('グループを作成する')
  })
})

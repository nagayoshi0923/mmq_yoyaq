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

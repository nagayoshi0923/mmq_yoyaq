// @vitest-environment jsdom
// 作品ページの公演: 今日以降をすべて読む（以前は今日から 3 か月で切っていて、トップ・カレンダーから開いた 2027/2/7 の公演を選べなかった。2026-10-26 社長報告）
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as Array<[string, ...unknown[]]>)
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/organization', () => ({ resolveOrganizationFromPathSegment: async () => ({ id: 'org-1', name: '架空の組織' }) }))
vi.mock('@/lib/scenarioRelatedPublic', () => ({ fetchPublicRelatedScenariosByAuthor: async () => [] }))
vi.mock('@/lib/api', () => ({
  scenarioApi: { getByIdOrSlug: async () => ({ id: 'sm1', scenario_master_id: 'sm1', title: '架空の作品', author: '', player_count_max: 8 }) },
  storeApi: { getAllPublic: async () => [{ id: 'st1', name: '架空の店舗', short_name: '架空', color: 'blue' }] },
  scheduleApi: {},
}))
vi.mock('@/lib/api/scenarioPageReadApi', () => ({
  scenarioDetailEventsReadApi: {
    startPublicEventsQuery: () => {
      const b: Record<string, unknown> = {}
      for (const m of ['eq', 'gte', 'lte', 'order', 'in']) b[m] = (...args: unknown[]) => { calls.push([m, ...args]); return b }
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({
        data: [{ id: 'ev-0207', date: '2027-02-07', start_time: '19:30:00', end_time: '22:00:00', category: 'open', is_reservation_enabled: true, is_private_booking: false, published: true, is_cancelled: false, scenario_master_id: 'sm1', organization_id: 'org-1', store_id: 'st1', current_participants: 0, max_participants: 20, capacity: 20, reservation_deadline_hours: 0, venue: null }],
        error: null,
      }).then(resolve)
      return b
    },
  },
}))
import { useScenarioDetail } from './useScenarioDetail'

let latest: ReturnType<typeof useScenarioDetail> | null = null
function Probe() { latest = useScenarioDetail('sm1', 'kaku-org'); return null }
let root: ReturnType<typeof createRoot>, host: HTMLDivElement, client: QueryClient
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-26T10:00:00+09:00'))
  calls.length = 0
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement('div'); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); vi.useRealTimers() })

describe('作品ページの公演の期間', () => {
  it('今日以降をすべて読む（終わりの日で切らない）。3 か月より先の 2/7 の公演も選べる公演に入る', async () => {
    await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
    for (let i = 0; i < 30 && latest!.events.length === 0; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(calls).toContainEqual(['gte', 'date', '2026-10-26'])
    expect(calls.some((c) => c[0] === 'lte' && c[1] === 'date')).toBe(false)
    expect(latest!.events.map((e) => e.date)).toContain('2027-02-07')
  })
})

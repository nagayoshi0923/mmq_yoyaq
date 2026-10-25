// @vitest-environment jsdom
// 最初の 3 か月の公演が途中のページ（1000 件目以降）で読めなかったとき: 途中までの行は使わず「読めなかった」とし、
// 月ごとの読み直しで重ならないようにする（2026-10-25 Codex レビュー）。読めたときは読んだ期間の終わりと上限の日を返す
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ eventsError: null as unknown, latestError: null as unknown }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }))
vi.mock('@/lib/organization', () => ({ resolveOrganizationFromPathSegment: async () => ({ id: 'org-1', name: '架空の組織', is_active: true }) }))
vi.mock('../utils/bookingDataSnapshot', () => ({ readBookingDataSnapshot: () => null, writeBookingDataSnapshot: vi.fn() }))
vi.mock('@/lib/api/platformPageReadApi', () => ({ platformPageReadApi: { getPublicAvailableScenarioKeys: async () => ({ data: [], error: null }) } }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({
  publicBookingListReadApi: {
    listAvailableScenarios: async () => ({ data: [{ id: 'sm1', title: '架空の作品', status: 'available', organization_id: 'org-1', player_count_max: 6 }], error: null }),
    listPublicStores: async () => ({ data: [{ id: 'st1', name: '架空の店舗' }], error: null }),
    // 2 ページ目で失敗: 途中までの 1000 件（ここでは代表の 1 件）と error
    listPublicEventsInRange: async () => ({ data: [{ id: 'ev-partial', date: '2026-11-01', start_time: '19:00:00', category: 'open', scenario_master_id: 'sm1', store_id: 'st1' }], error: m.eventsError }),
    latestPublicOpenEventDate: async () => ({ date: m.latestError ? null : '2027-02-07', error: m.latestError }),
  },
  publicBookingReadApi: {
    getPrivateBookingDeadlineDays: async () => ({ data: 7, error: null }),
    getScenarioLikesCount: async () => ({ data: [], error: null }),
    listPerformancePauses: async () => ({ data: [], error: null }),
  },
}))
import { useBookingData } from './useBookingData'

let latest: ReturnType<typeof useBookingData> | null = null
function Probe() { latest = useBookingData('kaku-org'); return null }
let root: ReturnType<typeof createRoot>, host: HTMLDivElement, client: QueryClient
async function render() {
  await act(async () => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  for (let i = 0; i < 30 && latest!.isLoading; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-25T10:00:00+09:00'))
  m.eventsError = null; m.latestError = null
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement('div'); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); vi.useRealTimers() })

describe('最初の 3 か月の公演', () => {
  it('読めたら、読んだ期間の終わり（今月を含む 3 か月の月末）と、予約を受け付けている公開の公演のいちばん先の日', async () => {
    await render()
    expect(latest!.loadedUntil).toBe('2026-12-31')
    expect(latest!.eventsError).toBe(false)
    expect(latest!.latestPublicDate).toBe('2027-02-07')
    expect(latest!.allEvents.map((e) => e.id)).toEqual(['ev-partial'])
    expect(latest!.scenarioRows?.map((s) => s.id)).toEqual(['sm1'])
  })
  it('途中のページで失敗したら、途中までの行は使わず「読めなかった」（読めた期間の終わり＝昨日。月ごとに今月から読み直す）', async () => {
    m.eventsError = { message: 'boom' }
    await render()
    expect(latest!.eventsError).toBe(true)
    expect(latest!.loadedUntil).toBe('2026-10-24')
    expect(latest!.allEvents).toEqual([])
  })
  it('上限の日を読めなかったら、それが分かるように返す（上限を狭めない）', async () => {
    m.latestError = { message: 'boom' }
    await render()
    expect(latest!.latestPublicDate).toBeNull()
    expect(latest!.latestPublicDateError).toBe(true)
  })
})

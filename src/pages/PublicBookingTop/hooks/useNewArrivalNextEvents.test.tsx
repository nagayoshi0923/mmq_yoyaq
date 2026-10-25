// @vitest-environment jsdom
// 店舗トップの新作のカード: 最初の 3 か月より先（2027/2/7）の次回公演を読む。募集停止・締切・別の組織の作品は既存の判定で外す（2026-10-26 社長報告）
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ calls: [] as unknown[][] }))
const ev = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id, date, start_time: '19:30:00', end_time: '22:00:00', category: 'open', is_reservation_enabled: true, published: true, is_private_booking: false, is_cancelled: false,
  scenario_master_id: 'sm1', scenario: '架空の作品', store_id: 'st1', venue: null, organization_id: 'org-1', current_participants: 0, max_participants: 20, capacity: 20, reservation_deadline_hours: 0, ...extra,
})
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({
  publicBookingListReadApi: {
    listNextPublicOpenEvents: vi.fn(async (...args: unknown[]) => {
      api.calls.push(args)
      const offset = args[3] as number
      // 1 ページ目: 今日の開始済み（締切）・募集停止の店舗・募集停止の店舗・締切（48 時間前）。2 ページ目に 2027/2/7 と 3/1
      const page0 = [ev('ev-started', '2026-10-26', { start_time: '09:00:00' }), ev('ev-paused1', '2026-11-03', { store_id: 'st-paused' }), ev('ev-paused2', '2026-11-04', { store_id: 'st-paused' }), ev('ev-deadline', '2026-10-27', { start_time: '10:00:00', reservation_deadline_hours: 48 })]
      const page1 = [ev('ev-0207', '2027-02-07'), ev('ev-0301', '2027-03-01'), ev('ev-0302', '2027-03-02')]
      return { data: offset === 0 ? page0 : offset === 4 ? page1 : [], error: null }
    }),
  },
  publicBookingReadApi: {
    listPerformancePauses: vi.fn(async () => ({ data: [{ store_id: 'st-paused', pause_type: 'performance', starts_on: '2026-11-01', ends_on: '2026-11-30' }], error: null })),
  },
}))
import { useNewArrivalNextEvents } from './useNewArrivalNextEvents'

const scenarioRows = [{ id: 'sm1', title: '架空の作品', player_count_max: 20, player_count_min: 4, participation_fee: 4000, key_visual_url: null }] as never
const stores = [{ id: 'st1', name: '架空の店舗', short_name: '架空', color: null }, { id: 'st-paused', name: '休みの店舗', short_name: '休み', color: null }] as never
let latest: ReturnType<typeof useNewArrivalNextEvents> = []
function Probe({ ids }: { ids: string[] }) { latest = useNewArrivalNextEvents({ organizationId: 'org-1', scenarioIds: ids, today: '2026-10-26', scenarioRows, stores }); return null }
let root: ReturnType<typeof createRoot>, host: HTMLDivElement, client: QueryClient
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-26T10:00:00+09:00'))
  api.calls.length = 0
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement('div'); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); vi.useRealTimers() })

describe('店舗トップの新作のカードの次回公演', () => {
  it('外れる公演の先にある 2027/2/7 と次の 1 件だけを返す（全部は読まない）', async () => {
    await act(async () => root.render(<QueryClientProvider client={client}><Probe ids={['sm1']} /></QueryClientProvider>))
    for (let i = 0; i < 30 && latest.length === 0; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(latest.map((e) => e.id)).toEqual(['ev-0207', 'ev-0301'])
    expect(latest[0].store_name).toBe('架空の店舗')
    expect(api.calls).toEqual([['sm1', 'org-1', '2026-10-26', 0, 4], ['sm1', 'org-1', '2026-10-26', 4, 50]])
  })
})

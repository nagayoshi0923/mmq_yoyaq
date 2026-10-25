// @vitest-environment jsdom
// 先の月を月ごとに読む（2026-10-25）: 要る月だけ・戻っても読み直さない・読めなかった月は「失敗」で、再試行できる
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ calls: [] as string[], fail: new Set<string>() }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({
  publicBookingListReadApi: {
    listPublicEventsInRange: vi.fn(async (from: string, to: string) => {
      const month = from.slice(0, 7)
      api.calls.push(`${from}..${to}`)
      if (api.fail.has(month)) return { data: [], error: { message: 'boom' } }
      // 架空の公演: 2027-02-07 19:30 のオープン公演が 1 件（1 月は 0 件）
      const rows = month === '2027-02'
        ? [{ id: 'ev-0207', date: '2027-02-07', start_time: '19:30:00', category: 'open', is_reservation_enabled: true, published: true, is_private_booking: false, scenario_master_id: 'sm1', scenario: '架空の作品', store_id: 'st1', venue: null },
           { id: 'pv-0210', date: '2027-02-10', start_time: '13:00:00', category: 'private', is_reservation_enabled: true, published: true, is_private_booking: true, scenario_master_id: 'sm1', scenario: '架空の作品', store_id: 'st1', venue: null }]
        : []
      return { data: rows, error: null }
    }),
  },
  publicBookingReadApi: { listPerformancePauses: vi.fn(async () => ({ data: [], error: null })) },
}))
import { useExtraBookingMonths } from './useExtraBookingMonths'

const scenarioRows = [{ id: 'sm1', title: '架空の作品', player_count_max: 6, key_visual_url: null }] as never
const stores = [{ id: 'st1', name: '架空の店舗', short_name: '架空', color: null }] as never
let latest: ReturnType<typeof useExtraBookingMonths> | null = null
function Probe({ months }: { months: string[] }) {
  latest = useExtraBookingMonths({ organizationId: 'org-1', months, today: '2026-10-25', scenarioRows, stores })
  return null
}
let root: ReturnType<typeof createRoot>, host: HTMLDivElement, client: QueryClient
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 10)) })
async function render(months: string[]) { await act(async () => root.render(<QueryClientProvider client={client}><Probe months={months} /></QueryClientProvider>)); await flush() }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  api.calls.length = 0; api.fail.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement('div'); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); client.clear() })

describe('先の月を月ごとに読む', () => {
  it('要る月だけ 1 か月ずつ読む（1 月は 0 件でも「読めた」、2 月は 2/7 の公演が出る。貸切は表示しない公演に分ける）', async () => {
    await render(['2027-01', '2027-02'])
    expect(api.calls).toEqual(['2027-01-01..2027-01-31', '2027-02-01..2027-02-28'])
    expect(latest!.status.get('2027-01')).toBe('ready')
    expect(latest!.status.get('2027-02')).toBe('ready')
    expect(latest!.events.map((e) => e.id)).toEqual(['ev-0207'])
    expect(latest!.events[0].store_name).toBe('架空の店舗')
    expect(latest!.blocked.map((e) => e.id)).toEqual(['pv-0210'])
  })
  it('1 月 → 2 月 → 1 月 → 2 月と行き来しても、同じ月は読み直さない', async () => {
    await render(['2027-01'])
    await render(['2027-01', '2027-02'])
    await render(['2027-01'])
    await render(['2027-01', '2027-02'])
    expect(api.calls).toEqual(['2027-01-01..2027-01-31', '2027-02-01..2027-02-28'])
  })
  it('読めなかった月は「失敗」（空の月と見せない）。再試行で読めたら公演が出る', async () => {
    api.fail.add('2027-02')
    await render(['2027-01', '2027-02'])
    // 自動の再試行（1 回）が終わるまで待つ
    for (let i = 0; i < 40 && latest!.status.get('2027-02') !== 'error'; i++) await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    expect(latest!.status.get('2027-01')).toBe('ready')
    expect(latest!.status.get('2027-02')).toBe('error')
    expect(latest!.events).toEqual([])
    api.fail.clear()
    await act(async () => latest!.retry('2027-02'))
    await flush()
    expect(latest!.status.get('2027-02')).toBe('ready')
    expect(latest!.events.map((e) => e.id)).toEqual(['ev-0207'])
  })
  it('今月を読み足すとき（最初の取得に失敗したとき）は今日から読む', async () => {
    await render(['2026-10'])
    expect(api.calls).toEqual(['2026-10-25..2026-10-31'])
  })
})

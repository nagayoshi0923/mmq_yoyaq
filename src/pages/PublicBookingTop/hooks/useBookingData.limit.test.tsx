// @vitest-environment jsdom
// 月送りの上限は「今回の取得」で確かめてから使う（2026-10-26 Codex レビュー #1244）。同じ組織の古いキャッシュ（上限 12 月）が残っていると、
// 最新の応答の前から「取得済み」になり、保存していた 2 月を 12 月へ戻していた。遅い・失敗・組織の切り替えでも古い上限を確定としない
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ latest: '2027-02-07' as string | null, latestError: null as unknown, gate: null as Promise<void> | null, calls: 0, orgThrow: false }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }))
vi.mock('@/lib/organization', () => ({ resolveOrganizationFromPathSegment: async (slug: string) => { if (m.orgThrow) throw new Error('network'); return { id: `org-${slug}`, name: '架空の組織', is_active: true } } }))
vi.mock('../utils/bookingDataSnapshot', () => ({ readBookingDataSnapshot: () => null, writeBookingDataSnapshot: vi.fn() }))
vi.mock('@/lib/api/platformPageReadApi', () => ({ platformPageReadApi: { getPublicAvailableScenarioKeys: async () => ({ data: [], error: null }) } }))
vi.mock('@/lib/api/publicBookingReadApi', () => ({
  publicBookingListReadApi: {
    listAvailableScenarios: async () => ({ data: [], error: null }),
    listPublicStores: async () => ({ data: [], error: null }),
    listPublicEventsInRange: async () => ({ data: [], error: null }),
    latestPublicOpenEventDate: async () => {
      m.calls++
      if (m.gate) await m.gate
      return { date: m.latestError ? null : m.latest, error: m.latestError }
    },
  },
  publicBookingReadApi: {
    getPrivateBookingDeadlineDays: async () => ({ data: 7, error: null }),
    getScenarioLikesCount: async () => ({ data: [], error: null }),
    listPerformancePauses: async () => ({ data: [], error: null }),
  },
}))
import { useBookingData } from './useBookingData'

let latest: ReturnType<typeof useBookingData> | null = null
function Probe({ slug }: { slug: string }) { latest = useBookingData(slug); return null }
let root: ReturnType<typeof createRoot>, host: HTMLDivElement, client: QueryClient
const flush = async (n = 10) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)) }) }
const render = (slug = 'kaku-org') => act(async () => root.render(<QueryClientProvider client={client}><Probe slug={slug} /></QueryClientProvider>))
// 前回の訪問で残った古いキャッシュ（上限 12 月）
const seedOld = (slug = 'kaku-org') => client.setQueryData(['booking-data', slug], {
  scenarios: [], allEvents: [], blockedSlots: [], stores: [], privateBookingDeadlineDays: 7, organizationId: `org-${slug}`, organizationName: '架空の組織',
  organizationNotFound: false, loadedUntil: '2026-12-31', eventsError: false, latestPublicDate: '2026-12-20', latestPublicDateError: false,
})

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-26T10:00:00+09:00'))
  m.latest = '2027-02-07'; m.latestError = null; m.gate = null; m.calls = 0; m.orgThrow = false
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement('div'); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); vi.useRealTimers() })

describe('月送りの上限を今回の取得で確かめる', () => {
  it('古いキャッシュ（上限 12 月）があり最新の応答が遅い間は「確かめ中」。応答が来たら 2 月で確定', async () => {
    seedOld()
    let open!: () => void
    m.gate = new Promise((r) => { open = r })
    await render(); await flush(3)
    expect(latest!.latestPublicDate).toBe('2026-12-20')
    expect(latest!.limitState).toBe('pending')
    open(); await flush()
    expect(latest!.latestPublicDate).toBe('2027-02-07')
    expect(latest!.limitState).toBe('ready')
  })
  it('今回の取得で上限の日を読めなかったら「失敗」（古い上限で確定しない）', async () => {
    seedOld()
    m.latestError = { message: 'boom' }
    await render(); await flush()
    expect(latest!.limitState).toBe('error')
  })
  it('取得そのものが失敗しても「失敗」（キャッシュは古いまま、確定としない）', async () => {
    seedOld()
    m.orgThrow = true
    await render(); await flush()
    expect(latest!.limitState).toBe('error')
    expect(latest!.latestPublicDate).toBe('2026-12-20')
  })
  it('失敗のあと再試行（3 秒かかる）している間は「確かめ中」（古い上限 12 月で確定しない）。成功したら 2 月で確定', async () => {
    seedOld()
    m.orgThrow = true
    await render(); await flush()
    expect(latest!.limitState).toBe('error')
    m.orgThrow = false
    let open!: () => void
    m.gate = new Promise((r) => { open = r })
    await act(async () => { void latest!.loadData() }); await flush(3)
    expect(latest!.latestPublicDate).toBe('2026-12-20')
    expect(latest!.limitState).toBe('pending')
    open(); await flush()
    expect(latest!.latestPublicDate).toBe('2027-02-07')
    expect(latest!.limitState).toBe('ready')
  })
  it('同じ画面で組織を切り替えたとき、切り替え先のキャッシュが新しくても今回の取得をしてから確定する', async () => {
    await render('kaku-a'); await flush()
    expect(latest!.limitState).toBe('ready')
    seedOld('kaku-b')
    let open!: () => void
    m.gate = new Promise((r) => { open = r })
    const before = m.calls
    await render('kaku-b'); await flush(3)
    expect(latest!.organizationId).toBe('org-kaku-b')
    expect(latest!.limitState).toBe('pending')
    expect(m.calls).toBe(before + 1)
    open(); await flush()
    expect(latest!.latestPublicDate).toBe('2027-02-07')
    expect(latest!.limitState).toBe('ready')
  })
})

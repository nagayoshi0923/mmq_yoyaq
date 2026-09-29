// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ mine: vi.fn() }))
vi.mock('@/lib/gmResponseApi', () => ({ getMyGmResponses: mocks.mine, getGmResponses: async () => [] }))
vi.mock('@/lib/api', () => ({ storeApi: { getAll: async () => [] } }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn() } }))
import { useGMRequests } from './useGMRequests'
let root: Root, host: HTMLDivElement, state: ReturnType<typeof useGMRequests>, client: QueryClient
function Probe() { state = useGMRequests({ userId: 'staff-user' }); return null }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement('div'); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove() })
async function mount(candidates: unknown) {
  mocks.mine.mockResolvedValue({ staffId: 'staff', staffName: 'GM', responses: [{
    id: 'answer', reservation_id: 'reservation', available_candidates: [0, 2],
    reservations: { candidate_datetimes: candidates },
  }] })
  await act(async () => { root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
}
it('保存位置から表示番号を復元し、同じ描画中の複数選択を失わない', async () => {
  await mount({ candidates: [{ order: 3, date: '2026-09-29' }, { order: 8, date: '2026-09-30' }, { order: 2, date: '2026-10-01' }] })
  expect(state.selectedCandidates.answer).toEqual([3, 2])
  await act(async () => { state.toggleCandidate('answer', 3); state.toggleCandidate('answer', 8) })
  expect(state.selectedCandidates.answer).toEqual([2, 8])
})
it('候補が欠けた旧データがあっても画面をクラッシュさせない', async () => {
  await mount({})
  expect(state.selectedCandidates.answer).toEqual([])
  expect(state.isError).toBe(false)
})

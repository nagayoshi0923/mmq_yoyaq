// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ responses: vi.fn(), holiday: () => false }))
vi.mock('@/lib/gmResponseApi', () => ({ getGmResponses: mocks.responses }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: async () => 'org' }))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: () => ({ isCustomHoliday: mocks.holiday }) }))
vi.mock('@/utils/logger', () => ({ privateBookingTrace: vi.fn(), logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => {
  const query: any = { then: (resolve: any) => Promise.resolve({ data: [{ id: 'reservation', status: 'pending', candidate_datetimes: { candidates: [] } }], error: null }).then(resolve) }
  for (const name of ['select', 'eq', 'in', 'order']) query[name] = () => query
  return query
} } }))
import { useBookingRequests } from './useBookingRequests'
let root: Root | undefined
let client: QueryClient
let state: ReturnType<typeof useBookingRequests>
function Probe() { state = useBookingRequests({ userId: 'user', userRole: 'admin' }); return null }
afterEach(async () => { if (root) await act(async () => root!.unmount()); client?.clear() })
it('GM回答の取得失敗を空の正常結果と区別し、再試行で予約を復元する', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.responses.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValue([])
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(state.isError).toBe(true)
  await act(async () => { await state.retryRequests(); await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(state.isError).toBe(false)
  expect(state.requests).toHaveLength(1)
  expect(mocks.responses).toHaveBeenCalledTimes(2)
})

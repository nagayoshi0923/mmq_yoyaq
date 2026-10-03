// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ responses: vi.fn(), holiday: () => false, rows: [] as any[], ranges: [] as number[][] }))
vi.mock('@/lib/gmResponseApi', () => ({ getGmResponses: mocks.responses, getGmReadiness: async (ids: string[]) => Object.fromEntries(ids.map(id => [id, false])) }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: async () => 'org' }))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: () => ({ isCustomHoliday: mocks.holiday }) }))
vi.mock('@/utils/logger', () => ({ privateBookingTrace: vi.fn(), logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => {
  let from=0, to=999
  const query: any = { range: (start:number,end:number) => { from=start;to=end;mocks.ranges.push([start,end]);return query }, then: (resolve: any) => Promise.resolve({ data: mocks.rows.slice(from,to+1), error: null }).then(resolve) }
  for (const name of ['select', 'eq', 'in', 'order']) query[name] = () => query
  return query
} } }))
import { useBookingRequests } from './useBookingRequests'
let root: Root | undefined
let client: QueryClient
let state: ReturnType<typeof useBookingRequests>
function Probe() { state = useBookingRequests({ userId: 'user', userRole: 'admin' }); return null }
beforeEach(() => { vi.clearAllMocks(); mocks.ranges=[]; mocks.rows=[{id:'reservation',status:'pending',candidate_datetimes:{candidates:[]}}] })
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

it('フックも後続ページの予約をGM回答取得と画面データへ渡す', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.rows=Array.from({length:1040},(_,id)=>({id:String(id),status:'pending',candidate_datetimes:{candidates:[]}}))
  mocks.responses.mockResolvedValue([])
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(state.isError).toBe(false)
  expect(state.requests).toHaveLength(1040)
  expect(mocks.responses).toHaveBeenCalledWith(mocks.rows.map(row=>row.id)) // 全件が対応中なので先に読む
  expect(mocks.ranges).toEqual([[0,999],[1000,1999]])
})

it('読込失敗でデータが無い間も同じ配列を返し、画面の再描画ループを起こさない', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.responses.mockRejectedValue(new Error('network unavailable'))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  expect(state.isError).toBe(true)
  const first = state.requests
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  expect(state.requests).toBe(first)
  expect(state.requests).toHaveLength(0)
})

it('対応中の申込のGM回答を先に読み、過去分は後から読んで表示に加える（#835）', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.rows=[{id:'active',status:'pending',candidate_datetimes:{candidates:[]}},{id:'done',status:'confirmed',candidate_datetimes:{candidates:[]}}]
  mocks.responses.mockImplementation(async (ids: string[]) => ids.map(id => ({ id: `gm-${id}`, reservation_id: id, gm_name: 'えいきち', response_status: 'available' })))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  expect(mocks.responses.mock.calls[0][0]).toEqual(['active'])
  expect(mocks.responses.mock.calls[1][0]).toEqual(['done'])
  expect(state.requests.find(r => r.id === 'active')?.gm_responses).toHaveLength(1)
  expect(state.requests.find(r => r.id === 'done')?.gm_responses).toHaveLength(1)
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ responses: vi.fn(), holiday: () => false, rows: [] as any[], ranges: [] as number[][], groups: [] as any[] }))
vi.mock('@/lib/privateGroupRead', () => ({ readPrivateGroupList: async () => mocks.groups }))
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
beforeEach(() => { vi.clearAllMocks(); mocks.ranges=[]; mocks.groups=[]; mocks.rows=[{id:'reservation',status:'pending',candidate_datetimes:{candidates:[]}}] })
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

it('確定済みの候補一覧は申請時の候補を並べ、確定した日時は承認で決まった値を出す（整備 5）', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const confirmed = { order: 1, date: '2026-11-01', timeSlot: '午後', startTime: '14:30', endTime: '18:00', status: 'confirmed' }
  const shifted = { order: 1, date: '2026-11-08', timeSlot: '夜', startTime: '19:30', endTime: '23:00', status: 'confirmed' }
  mocks.rows=[
    { id: 'same-slot', status: 'confirmed', private_group_id: 'g1', candidate_datetimes: { candidates: [confirmed] } },
    { id: 'slot-changed', status: 'confirmed', private_group_id: 'g2', candidate_datetimes: { candidates: [shifted] } },
  ]
  mocks.groups=[
    { id: 'g1', members: [], candidate_dates: [
      { group_id: 'g1', date: '2026-11-01', time_slot: '午後', start_time: '13:00', end_time: '16:00' },
      { group_id: 'g1', date: '2026-11-02', time_slot: '午前', start_time: '10:00', end_time: '13:00' },
    ] },
    { id: 'g2', members: [], candidate_dates: [
      { group_id: 'g2', date: '2026-11-08', time_slot: '夜間', start_time: '18:00', end_time: '21:00' },
      { group_id: 'g2', date: '2026-11-09', time_slot: '午後', start_time: '14:00', end_time: '17:00' },
    ] },
  ]
  mocks.responses.mockResolvedValue([])
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  root = createRoot(document.createElement('div'))
  await act(async () => root!.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  const view = (id: string) => state.requests.find(r => r.id === id)!.candidate_datetimes.candidates
    .map(c => `${c.date} ${c.startTime} ${c.status}`)
  // 履歴の行（13:00）ではなく、承認で決まった 14:30 を確定として出す
  expect(view('same-slot')).toEqual(['2026-11-01 14:30 confirmed', '2026-11-02 10:00 pending'])
  // 承認時に時間帯が変わり履歴の行と対応しなくても、確定した日時を落とさない
  expect(view('slot-changed')).toEqual(['2026-11-08 18:00 pending', '2026-11-09 14:00 pending', '2026-11-08 19:30 confirmed'])
})

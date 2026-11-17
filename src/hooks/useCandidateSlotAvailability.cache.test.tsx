// @vitest-environment jsdom
// 作品ページの貸切タブ: 月を行き来しても毎回「読み込み中」で待たせない（2026-11-18 えいきち報告）
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/candidateSlotAvailability', async (orig) => ({
  ...(await orig<typeof import('@/lib/candidateSlotAvailability')>()),
  fetchCandidateSlotAvailability: fetchMock,
}))
import { clearCandidateSlotAvailabilityCache, prefetchCandidateSlotAvailability, useCandidateSlotAvailability } from './useCandidateSlotAvailability'

const target = { kind: 'scenario' as const, organizationId: 'o', scenarioId: 's', storeIds: ['a'] }
const jan = ['2030-01-01', '2030-01-31']
const feb = ['2030-02-01', '2030-02-28']
let state: ReturnType<typeof useCandidateSlotAvailability>
function Probe({ dates, cache }: { dates: string[]; cache?: boolean }) {
  state = useCandidateSlotAvailability(target, dates, { cache })
  return null
}
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  clearCandidateSlotAvailabilityCache()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue([{ date: '2030-01-05', time_slot: 'evening', available: true, reason: null, start_time: '19:00', end_time: '22:00' }])
  root = createRoot(document.createElement('div'))
})
afterEach(async () => { await act(async () => root.unmount()) })

it('一度読んだ月に戻ったときは読み直さず、すぐ出す', async () => {
  await act(async () => root.render(<Probe dates={jan} cache />))
  await act(async () => root.render(<Probe dates={feb} cache />))
  await act(async () => root.render(<Probe dates={jan} cache />))
  expect(state.loading).toBe(false)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('先に読んでおいた次の月は、開いたときに読み込み中を出さない', async () => {
  await act(async () => { prefetchCandidateSlotAvailability(target, feb); await Promise.resolve() })
  await act(async () => root.render(<Probe dates={feb} cache />))
  expect(state.loading).toBe(false)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('cache を指定しない画面（申込の確認など）は毎回読む', async () => {
  await act(async () => root.render(<Probe dates={jan} />))
  await act(async () => root.render(<Probe dates={feb} />))
  await act(async () => root.render(<Probe dates={jan} />))
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('「再読み込み」は覚えた結果を使わず読み直す', async () => {
  await act(async () => root.render(<Probe dates={jan} cache />))
  await act(async () => state.reload())
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

// 2026-11-18: 一度に約2か月までしか読めない（長いと DB が 400）。月ごとに分けて読み、足した月だけ読む
it('長い範囲は月ごとに分けて読み、範囲を1か月広げたときは足した月だけ読む', async () => {
  await act(async () => root.render(<Probe dates={['2030-01-18', '2030-02-28']} cache />))
  expect(fetchMock.mock.calls.map((c) => [c[1], c[2]])).toEqual([['2030-01-18', '2030-01-31'], ['2030-02-01', '2030-02-28']])
  await act(async () => root.render(<Probe dates={['2030-01-18', '2030-03-31']} cache />))
  expect(fetchMock.mock.calls.slice(2).map((c) => [c[1], c[2]])).toEqual([['2030-03-01', '2030-03-31']])
  expect(state.error).toBeNull()
  expect(state.availability.slotsByDate['2030-01-05']).toHaveLength(1)
})

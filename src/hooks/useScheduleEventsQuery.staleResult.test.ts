import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
vi.mock('@/lib/api', () => ({ scheduleApi: {}, scenarioApi: {} }))
vi.mock('@/lib/api/scenarioAliasApi', () => ({ getScenarioAliases: vi.fn() }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: vi.fn() }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({ scheduleEventsQueryReadApi: {} }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }))
import { createScheduleMonthQueryFn, scheduleEventKeys, setScheduleMonthData } from './useScheduleEventsQuery'
import type { ScheduleEvent } from '@/types/schedule'

const key = scheduleEventKeys.month(2026, 11)
const event = (gms: string[]) => ({ id: 'saved', gms }) as unknown as ScheduleEvent
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(res => { resolve = res }); return { promise, resolve } }

describe('月の公演一覧の古い取得結果を捨てる（2026-10-22 hotfix）', () => {
  let queryClient: QueryClient
  beforeEach(() => { vi.useFakeTimers(); queryClient = new QueryClient() })
  afterEach(() => { vi.useRealTimers(); queryClient.clear() })

  it('担当の保存より前に始まった取得が後から届いても、GM 名を空に戻さず取り直す', async () => {
    queryClient.setQueryData(key, [event([])])
    const stale = deferred<ScheduleEvent[]>()
    const fetcher = vi.fn().mockReturnValueOnce(stale.promise).mockResolvedValueOnce([event(['A'])])
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const inflight = queryClient.fetchQuery({ queryKey: key, queryFn: createScheduleMonthQueryFn(queryClient, 2026, 11, fetcher), staleTime: 0 })
    setScheduleMonthData(queryClient, 2026, 11, prev => prev.map(e => ({ ...e, gms: ['A'] })))
    stale.resolve([event([])])
    await inflight
    expect(queryClient.getQueryData<ScheduleEvent[]>(key)?.[0].gms).toEqual(['A'])
    expect(invalidate).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key })
  })
  it('取得中に表示の書き換えが無ければ、取得結果をそのまま使う', async () => {
    queryClient.setQueryData(key, [event([])])
    const fetcher = vi.fn().mockResolvedValue([event(['B'])])
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await queryClient.fetchQuery({ queryKey: key, queryFn: createScheduleMonthQueryFn(queryClient, 2026, 11, fetcher), staleTime: 0 })
    expect(queryClient.getQueryData<ScheduleEvent[]>(key)?.[0].gms).toEqual(['B'])
    vi.runAllTimers()
    expect(invalidate).not.toHaveBeenCalled()
  })
  it('別の月の書き換えでは捨てない', async () => {
    queryClient.setQueryData(key, [event([])])
    const pending = deferred<ScheduleEvent[]>()
    const inflight = queryClient.fetchQuery({ queryKey: key, queryFn: createScheduleMonthQueryFn(queryClient, 2026, 11, () => pending.promise), staleTime: 0 })
    setScheduleMonthData(queryClient, 2026, 12, prev => prev)
    pending.resolve([event(['C'])])
    await inflight
    expect(queryClient.getQueryData<ScheduleEvent[]>(key)?.[0].gms).toEqual(['C'])
  })

  it('先読み（prefetchQuery）も同じ保護付きの取得を使えば、先読みの途中に書き換えても空で上書きしない（P2-2）', async () => {
    queryClient.setQueryData(key, [event([])])
    const stale = deferred<ScheduleEvent[]>()
    const prefetch = queryClient.prefetchQuery({ queryKey: key, queryFn: createScheduleMonthQueryFn(queryClient, 2026, 11, () => stale.promise), staleTime: 0 })
    const active = queryClient.fetchQuery({ queryKey: key, queryFn: createScheduleMonthQueryFn(queryClient, 2026, 11, vi.fn()), staleTime: 0 })
    setScheduleMonthData(queryClient, 2026, 11, [event(['A'])])
    stale.resolve([event([])])
    await Promise.all([prefetch, active])
    expect(queryClient.getQueryData<ScheduleEvent[]>(key)?.[0].gms).toEqual(['A'])
  })
})

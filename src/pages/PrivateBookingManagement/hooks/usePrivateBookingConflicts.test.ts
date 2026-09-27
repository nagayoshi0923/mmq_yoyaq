import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), query: vi.fn(), preparation: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.query }))
vi.mock('@/hooks/usePreparationSettings', () => ({ usePreparationSettings: mocks.preparation }))
import { usePrivateBookingConflicts } from './usePrivateBookingConflicts'
import type { PrivateBookingRequest } from './usePrivateBookingData'
const requests = [{ id: 'request', status: 'pending', scenario_master_id: 'scenario', candidate_datetimes: { candidates: [{ order: 1, date: '2027-01-03', startTime: '14:00', endTime: '17:00' }] } }] as PrivateBookingRequest[]
function table(rows: unknown[] = [], error: unknown = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'is', 'gte', 'lte', 'order']) chain[method] = vi.fn(() => chain)
  chain.range = vi.fn(async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error }))
  return chain
}
describe('貸切競合データの読取と表示状態', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockReturnValue({ data: undefined, isError: false, isFetching: false, refetch: vi.fn() })
    mocks.preparation.mockReturnValue({ data: { organization: 30, stores: {}, scenarios: {}, performances: {} }, isError: false, isFetching: false, refetch: vi.fn() })
  })
  it('組織で限定し前後日を含め500件超も取得する', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ id: `${i}`, date: '2027-01-03', start_time: '17:30', end_time: '20:30', store_id: 'store' }))
    const events = table(rows), reservations = table()
    mocks.from.mockImplementation(name => name === 'reservations' ? reservations : events)
    usePrivateBookingConflicts('org', requests)
    const result = await mocks.query.mock.calls[0][0].queryFn()
    expect(result).toHaveLength(501)
    expect(events.eq).toHaveBeenCalledWith('organization_id', 'org')
    expect(events.gte).toHaveBeenCalledWith('date', '2027-01-01')
    expect(events.lte).toHaveBeenCalledWith('date', '2027-01-05')
    expect(events.range).toHaveBeenCalledTimes(2)
    expect(reservations.is).toHaveBeenCalledWith('schedule_event_id', null)
  })
  it('公演未紐付けの旧確定予約の時間を保持する', async () => {
    const reservations = table([{ id: 'old', store_id: 'store', gm_staff: 'gm', candidate_datetimes: { candidates: [{ status: 'confirmed', date: '2027-01-03', startTime: '14:00', endTime: '17:00' }] } }])
    mocks.from.mockImplementation(name => name === 'reservations' ? reservations : table())
    usePrivateBookingConflicts('org', requests)
    const result = await mocks.query.mock.calls[0][0].queryFn()
    expect(result[0]).toMatchObject({ reservation_id: 'old', gms: ['staff:gm'] })
  })
  it('対象範囲外の古い予約の時刻欠落は現在の承認に影響させない', async () => {
    const reservations = table([{ id: 'old', candidate_datetimes: { candidates: [{ status: 'confirmed', date: '2020-01-01', startTime: '14:00' }] } }])
    mocks.from.mockImplementation(name => name === 'reservations' ? reservations : table())
    usePrivateBookingConflicts('org', requests)
    expect(await mocks.query.mock.calls[0][0].queryFn()).toEqual([])
  })
  it('対象範囲内の時刻欠落は空きとせず確認エラーにする', async () => {
    const reservations = table([{ id: 'old', store_id: 'store', candidate_datetimes: { candidates: [{ status: 'confirmed', date: '2027-01-03', startTime: '14:00' }] } }])
    mocks.from.mockImplementation(name => name === 'reservations' ? reservations : table())
    usePrivateBookingConflicts('org', requests)
    const data = await mocks.query.mock.calls[0][0].queryFn()
    mocks.query.mockReturnValue({ data, isError: false, isFetching: false })
    const state = usePrivateBookingConflicts('org', requests)
    expect(state.storeConflict(requests[0], requests[0].candidate_datetimes!.candidates[0], 'store')).toBeUndefined()
  })
  it('不正な予定は同じ店舗・対象日だけ確認不能にし、別候補を止めない', () => {
    mocks.query.mockReturnValue({ data: [{ id: 'zero', date: '2027-01-03', start_time: '12:00', end_time: '12:00', store_id: 'store', gms: ['GM'] }], isError: false, isFetching: false })
    const state = usePrivateBookingConflicts('org', requests)
    const candidate = requests[0].candidate_datetimes!.candidates[0]
    expect(state.ready).toBe(true)
    expect(state.storeConflict(requests[0], candidate, 'store')).toBeUndefined()
    expect(state.storeConflict(requests[0], candidate, 'other-store')).toBe(false)
    expect(state.storeConflict(requests[0], { ...candidate, date: '2027-02-03' }, 'store')).toBe(false)
    expect(state.gmConflict(requests[0], candidate, 'gm', 'GM')).toBeUndefined()
    expect(state.gmConflict(requests[0], candidate, 'other-gm', 'OTHER')).toBe(false)
  })
  it('読取エラーを空き配列へ変換しない', async () => {
    mocks.from.mockReturnValue(table([], new Error('unavailable')))
    usePrivateBookingConflicts('org', requests)
    await expect(mocks.query.mock.calls[0][0].queryFn()).rejects.toThrow('unavailable')
  })
  it('準備時間またはイベントの取得中は空きと断言しない', () => {
    const result = usePrivateBookingConflicts('org', requests)
    expect(result.ready).toBe(false)
    expect(result.storeConflict(requests[0], requests[0].candidate_datetimes!.candidates[0], 'store')).toBeUndefined()
  })
  it('時刻変更と本人の再承認を同じデータから再判定する', () => {
    mocks.query.mockReturnValue({ data: [{ id: 'other', date: '2027-01-03', start_time: '17:30', end_time: '20:30', store_id: 'store', gms: ['GM'] }], isError: false, isFetching: false })
    const result = usePrivateBookingConflicts('org', requests)
    const candidate = requests[0].candidate_datetimes!.candidates[0]
    expect(result.gmConflict(requests[0], candidate, 'gm', 'GM')).toBe(false)
    expect(result.storeConflict(requests[0], candidate, 'store')).toBe(false)
    expect(result.gmConflict(requests[0], { ...candidate, startTime: '18:00', endTime: '21:00' }, 'gm', 'GM')).toBe(true)
  })
})

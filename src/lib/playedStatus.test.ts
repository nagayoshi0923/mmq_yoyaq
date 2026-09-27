import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }))
import { fetchPlayedReservations, isPlayedReservation, resolvePlayedScenarioIds, PLAYED_RESERVATION_STATUSES } from './playedStatus'
beforeEach(() => vi.resetAllMocks())
describe('体験済みの共通判定', () => {
  it('完了・受付済みを含む確定済みの過去予約だけを採用する', () => {
    const now = Date.parse('2026-09-27T15:00:00Z')
    for (const status of PLAYED_RESERVATION_STATUSES) expect(isPlayedReservation({ status, requested_datetime: '2026-09-27T14:00:00Z' }, now)).toBe(true)
    for (const status of ['pending', 'cancelled', 'no_show', 'rejected', 'unknown']) expect(isPlayedReservation({ status, requested_datetime: '2020-01-01' }, now)).toBe(false)
    expect(isPlayedReservation({ status: 'confirmed', requested_datetime: '2026-09-27T16:00:00Z' }, now)).toBe(false)
    expect(isPlayedReservation({ status: 'completed', requested_datetime: 'invalid' }, now)).toBe(false)
  })
  it('未体験指定は予約と手動より優先し、解除・取消後は残っている根拠で再計算する', () => {
    const reservation = [{ scenario_master_id: 'a' }]
    const manual = [{ scenario_master_id: 'a' }, { scenario_master_id: 'b' }]
    expect(resolvePlayedScenarioIds(reservation, manual, [{ scenario_master_id: 'a' }])).toEqual(new Set(['b']))
    expect(resolvePlayedScenarioIds(reservation, manual, [])).toEqual(new Set(['a', 'b']))
    expect(resolvePlayedScenarioIds([], manual, [])).toEqual(new Set(['a', 'b']))
    expect(resolvePlayedScenarioIds([], [], [])).toEqual(new Set())
  })
})
function page(data: unknown[], error: unknown = null) {
  const builder: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => resolve({ data, error }) }
  for (const method of ['select', 'eq', 'in', 'lte', 'order', 'range']) builder[method] = vi.fn(() => builder)
  return builder
}
it('50件・500件を越えた本人履歴を安定した順序で全ページ取得する', async () => {
  const first = page(Array.from({ length: 500 }, (_, id) => ({ id: String(id) })))
  const second = page([{ id: 'oldest' }])
  mocks.from.mockReturnValueOnce(first).mockReturnValueOnce(second)
  const result = await fetchPlayedReservations('self')
  expect(result).toHaveLength(501)
  expect(first.eq).toHaveBeenCalledWith('customer_id', 'self')
  expect(first.in).toHaveBeenCalledWith('status', PLAYED_RESERVATION_STATUSES)
  expect(first.order).toHaveBeenCalledWith('id', { ascending: false })
  expect(first.range).toHaveBeenCalledWith(0, 499)
  expect(second.range).toHaveBeenCalledWith(500, 999)
})
it('作品詳細の絞り込みを全ページへ適用する', async () => {
  const builder = page([])
  mocks.from.mockReturnValue(builder)
  expect(await fetchPlayedReservations('self', 'scenario')).toEqual([])
  expect(builder.eq).toHaveBeenCalledWith('scenario_master_id', 'scenario')
})
it('後続ページの失敗で部分履歴を体験済み判定へ渡さない', async () => {
  const error = new Error('offline')
  mocks.from.mockReturnValueOnce(page(Array.from({ length: 500 }, (_, id) => ({ id })))).mockReturnValueOnce(page([], error))
  await expect(fetchPlayedReservations('self')).rejects.toBe(error)
})

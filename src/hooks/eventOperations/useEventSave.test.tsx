// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ create: vi.fn(), sync: vi.fn(), neighbors: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('@/hooks/usePreparationSettings', () => ({ usePreparationSettings: () => ({ fetch: async () => () => 0 }) }))
vi.mock('@/lib/preparationNeighborEvents', () => ({ loadPreparationNeighborEvents: mocks.neighbors }))
vi.mock('@/lib/api', () => ({ scheduleApi: { create: mocks.create } }))
vi.mock('@/lib/reservationApi', () => ({ reservationApi: { syncStaffReservations: mocks.sync } }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select() { return this }, eq() { return this }, single: async () => ({ data: { id: 'store', name: '店舗' } }) }) } }))
vi.mock('@/utils/toast', () => ({ showToast: mocks }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api/eventHistoryApi', () => ({ fetchEventSnapshot: async () => null, createEventHistory: vi.fn() }))
vi.mock('@/hooks/eventOperations/eventSyncHelpers', () => ({ confirmSendPrivateBookingChangeEmail: vi.fn(), syncRelatedDataOnEventDateChange: vi.fn() }))
vi.mock('@/lib/privateBookingCustomerChangeEmail', () => ({ diffScheduleSnapshotsForCustomerEmail: vi.fn(), sendPrivateBookingCustomerChangeEmail: vi.fn() }))
import { useEventSave } from './useEventSave'
const data = { date: '2026-11-01', venue: 'store', scenario: '', category: 'open', start_time: '15:30', end_time: '18:30', capacity: 7, max_participants: 7, gms: ['A'], gm_roles: { A: 'staff' } }
let root: Root
let latest: ReturnType<typeof useEventSave>
function Harness() { latest = useEventSave({ events: [], setEvents: vi.fn(), stores: [{ id: 'store', name: '店舗', short_name: '店舗' }], scenarios: [], modalMode: 'add', organizationId: 'org' }); return null }
async function setup() {
  await act(async () => { root.render(<Harness />) })
  return { result: { get current() { return latest } } }
}
afterEach(async () => { await act(async () => root.unmount()) })
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  root = createRoot(document.createElement('div'))
  vi.clearAllMocks()
  mocks.neighbors.mockResolvedValue([])
  mocks.create.mockResolvedValue({ ...data, id: 'saved', store_id: 'store', current_participants: 0 })
  mocks.sync.mockResolvedValue(undefined)
})
describe('公演保存の完了経路', () => {
  it('本体作成後のスタッフ登録失敗は部分成功を警告し、追加モーダルを閉じる結果を返す', async () => {
    mocks.sync.mockRejectedValue(new Error('定員超過'))
    const { result } = await setup()
    let saved: boolean | undefined
    await act(async () => { saved = await result.current.handleSavePerformance(data) })
    expect(saved).toBe(true)
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('未完了'), expect.any(String))
    expect(mocks.success).not.toHaveBeenCalled()
  })
  it('重複警告の続行は元の保存Promiseへ成功を返す', async () => {
    mocks.neighbors.mockResolvedValue([{ ...data, id: 'neighbor', is_cancelled: false }])
    const { result } = await setup()
    let pending!: Promise<boolean>
    await act(async () => { pending = result.current.handleSavePerformance(data); await Promise.resolve(); await Promise.resolve() })
    expect(result.current.isConflictWarningOpen).toBe(true)
    expect(mocks.create).not.toHaveBeenCalled()
    await act(async () => { await result.current.handleConflictContinue() })
    expect(await pending).toBe(true)
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(result.current.isConflictWarningOpen).toBe(false)
  })
  it('重複警告を閉じると元の保存Promiseをfalseで終了する', async () => {
    mocks.neighbors.mockResolvedValue([{ ...data, id: 'neighbor', is_cancelled: false }])
    const { result } = await setup()
    let pending!: Promise<boolean>
    await act(async () => { pending = result.current.handleSavePerformance(data); await Promise.resolve(); await Promise.resolve() })
    act(() => result.current.setIsConflictWarningOpen(false))
    expect(await pending).toBe(false)
    expect(mocks.create).not.toHaveBeenCalled()
  })
})

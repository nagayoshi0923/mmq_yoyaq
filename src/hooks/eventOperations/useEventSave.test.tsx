// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), create: vi.fn(), sync: vi.fn(), neighbors: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(), update: vi.fn(), read: vi.fn(), diff: vi.fn(), notify: vi.fn(), confirm: vi.fn() }))
vi.mock('@/hooks/usePreparationSettings', () => ({ usePreparationSettings: () => ({ fetch: async () => () => 0 }) }))
vi.mock('@/lib/preparationNeighborEvents', () => ({ loadPreparationNeighborEvents: mocks.neighbors }))
vi.mock('@/lib/api', () => ({ scheduleApi: { create: mocks.create, update: mocks.update } }))
vi.mock('@/lib/reservationApi', () => ({ reservationApi: { syncStaffReservations: mocks.sync } }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select() { return this }, eq() { return this }, single: mocks.read }) } }))
vi.mock('@/utils/toast', () => ({ showToast: mocks }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api/eventHistoryApi', () => ({ fetchEventSnapshot: mocks.snapshot, createEventHistory: vi.fn() }))
vi.mock('@/hooks/eventOperations/eventSyncHelpers', () => ({ confirmSendPrivateBookingChangeEmail: mocks.confirm }))
vi.mock('@/lib/privateBookingCustomerChangeEmail', () => ({ diffScheduleSnapshotsForCustomerEmail: mocks.diff, sendPrivateBookingCustomerChangeEmail: mocks.notify }))
import { useEventSave } from './useEventSave'
import type { ScheduleEvent } from '@/types/schedule'
const data = { date: '2026-11-01', venue: 'store', scenario: '', category: 'open', start_time: '15:30', end_time: '18:30', capacity: 7, max_participants: 7, gms: ['A'], gm_roles: { A: 'staff' } }
let root: Root
let latest: ReturnType<typeof useEventSave>
let mode: 'add' | 'edit' = 'add'
let shown: ScheduleEvent[] = []
const setEvents = vi.fn((u: ScheduleEvent[] | ((prev: ScheduleEvent[]) => ScheduleEvent[])) => { shown = typeof u === 'function' ? u(shown) : u })
function Harness() { latest = useEventSave({ events: [], setEvents, stores: [{ id: 'store', name: '店舗', short_name: '店舗' }], scenarios: [], modalMode: mode, organizationId: 'org' }); return null }
async function setup() {
  await act(async () => { root.render(<Harness />) })
  return { result: { get current() { return latest } } }
}
afterEach(async () => { await act(async () => root.unmount()) })
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  root = createRoot(document.createElement('div'))
  vi.clearAllMocks()
  mode = 'add'
  shown = []
  mocks.snapshot.mockResolvedValue(null)
  mocks.read.mockResolvedValue({ data: { id: 'store', name: '店舗', date: '2026-10-01', category: 'private' } })
  mocks.confirm.mockReturnValue(true)
  mocks.diff.mockReturnValue([{ field: 'date', label: '日', oldValue: '旧', newValue: '新' }])
  mocks.notify.mockResolvedValue({ status: 'accepted' })
  mocks.update.mockResolvedValue(undefined)
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

describe('公演保存後の通知結果', () => {
  it.each([{ status: 'failed', reason: 'invoke_error' }, { status: 'skipped', reason: 'recipient_unavailable' }])('通知%sでも保存成功を返し、再保存を誘わない', async outcome => {
    mode = 'edit'; mocks.notify.mockResolvedValue(outcome)
    const { result } = await setup()
    let saved: boolean | undefined
    await act(async () => { saved = await result.current.handleSavePerformance({ ...data, id: 'event', category: 'private', reservation_id: 'r' }) })
    expect(saved).toBe(true); expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('変更は保存しました'), expect.stringContaining('再保存せず'))
    expect(mocks.error).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled()
  })
  it('通知受付時は保存成功を表示する', async () => {
    mode = 'edit'; const { result } = await setup()
    await act(async () => { await result.current.handleSavePerformance({ ...data, id: 'event', category: 'private', reservation_id: 'r' }) })
    expect(mocks.success).toHaveBeenCalledWith('保存しました'); expect(mocks.warning).not.toHaveBeenCalled()
  })
  it('公演保存失敗時は通知せず保存失敗を返す', async () => {
    mode = 'edit'; mocks.update.mockRejectedValueOnce(Error('save failed'))
    const { result } = await setup()
    let saved: boolean | undefined
    await act(async () => { saved = await result.current.handleSavePerformance({ ...data, id: 'event', category: 'private', reservation_id: 'r' }) })
    expect(saved).toBe(false); expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.warning).not.toHaveBeenCalled()
  })
})

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const plan = { entries: [], expected: [], expectedStaff: { gms: [], gm_roles: {} } }

describe('公演の追加で GM 名を消さない（2026-10-22 hotfix）', () => {
  it('作成直後から担当の保存完了まで、入力した GM を表示し続ける', async () => {
    const created = deferred<unknown>(); const synced = deferred<void>()
    mocks.create.mockReturnValue(created.promise); mocks.sync.mockReturnValue(synced.promise)
    const { result } = await setup()
    let pending!: Promise<boolean>
    await act(async () => { pending = result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }); await flush() })
    expect(shown.map(e => e.gms)).toEqual([['A']])
    await act(async () => { created.resolve({ ...data, gms: [], gm_roles: {}, id: 'saved', store_id: 'store', current_participants: 0 }); await flush() })
    expect(shown).toMatchObject([{ id: 'saved', gms: ['A'], gm_roles: { A: 'main' } }])
    await act(async () => { synced.resolve(); await pending })
    expect(shown).toMatchObject([{ id: 'saved', gms: ['A'] }])
    expect(mocks.success).toHaveBeenCalledWith('保存しました')
  })
  it('履歴スナップショットの取得を待たずに担当を保存する', async () => {
    const snapshot = deferred<null>()
    mocks.snapshot.mockReturnValue(snapshot.promise)
    const { result } = await setup()
    let saved: boolean | undefined
    await act(async () => { saved = await result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }) })
    expect(saved).toBe(true)
    expect(mocks.sync).toHaveBeenCalledTimes(1)
    expect(mocks.sync).toHaveBeenCalledWith('saved', ['A'], { A: 'main' }, expect.any(Object), plan)
    await act(async () => { snapshot.resolve(null); await flush() })
  })
  it('担当を保存できなかったら、保存されていない GM を表示し続けない', async () => {
    mocks.sync.mockRejectedValue(new Error('担当スタッフを特定できません'))
    mocks.create.mockResolvedValue({ ...data, gms: [], gm_roles: {}, id: 'saved', store_id: 'store', current_participants: 0 })
    const { result } = await setup()
    await act(async () => { await result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }) })
    expect(shown).toMatchObject([{ id: 'saved', gms: [], gm_roles: {} }])
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('未完了'), expect.any(String))
  })
  it('GM 未指定の追加は、何も変えない担当の同期を呼ばない', async () => {
    const { result } = await setup()
    let saved: boolean | undefined
    await act(async () => { saved = await result.current.handleSavePerformance({ ...data, gms: [], gm_roles: {}, staffParticipation: plan }) })
    expect(saved).toBe(true)
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(shown).toMatchObject([{ id: 'saved', gms: [] }])
    expect(mocks.success).toHaveBeenCalledWith('保存しました')
  })
})

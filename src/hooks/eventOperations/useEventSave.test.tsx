// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ history: vi.fn(), snapshot: vi.fn(), create: vi.fn(), sync: vi.fn(), neighbors: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(), update: vi.fn(), read: vi.fn(), diff: vi.fn(), notify: vi.fn(), confirm: vi.fn() }))
vi.mock('@/hooks/usePreparationSettings', () => ({ usePreparationSettings: () => ({ fetch: async () => () => 0 }) }))
vi.mock('@/lib/preparationNeighborEvents', () => ({ loadPreparationNeighborEvents: mocks.neighbors }))
vi.mock('@/lib/api', () => ({ scheduleApi: { create: mocks.create, update: mocks.update } }))
vi.mock('@/lib/reservationApi', () => ({ reservationApi: { syncStaffReservations: mocks.sync } }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select() { return this }, eq() { return this }, single: mocks.read }) } }))
vi.mock('@/utils/toast', () => ({ showToast: mocks }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api/eventHistoryApi', () => ({ fetchEventSnapshot: mocks.snapshot, createEventHistory: mocks.history }))
vi.mock('@/hooks/eventOperations/eventSyncHelpers', () => ({ confirmSendPrivateBookingChangeEmail: mocks.confirm }))
vi.mock('@/lib/privateBookingCustomerChangeEmail', () => ({ diffScheduleSnapshotsForCustomerEmail: mocks.diff, sendPrivateBookingCustomerChangeEmail: mocks.notify }))
import { useEventSave } from './useEventSave'
import { ApiClientError } from '@/lib/apiClient'
import type { ScheduleEvent } from '@/types/schedule'
import { QueryClient } from '@tanstack/react-query'
import { createScheduleMonthQueryFn, scheduleEventKeys, setScheduleMonthData } from '@/hooks/useScheduleEventsQuery'
vi.mock('@/lib/api/scenarioAliasApi', () => ({ getScenarioAliases: vi.fn() }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: vi.fn() }))
vi.mock('@/lib/api/scheduleHookReadApi', () => ({ scheduleEventsQueryReadApi: {} }))
const data = { date: '2026-11-01', venue: 'store', scenario: '', category: 'open', start_time: '15:30', end_time: '18:30', capacity: 7, max_participants: 7, gms: ['A'], gm_roles: { A: 'staff' } }
let root: Root
let latest: ReturnType<typeof useEventSave>
let mode: 'add' | 'edit' = 'add'
let shown: ScheduleEvent[] = []
const localSetEvents = (u: ScheduleEvent[] | ((prev: ScheduleEvent[]) => ScheduleEvent[])) => { shown = typeof u === 'function' ? u(shown) : u }
const setEvents = vi.fn(localSetEvents)
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
  setEvents.mockImplementation(localSetEvents)
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
  it('担当の保存に失敗したら公演も作られず、保存失敗を返して入力を残す（部分成功にしない）', async () => {
    mocks.create.mockRejectedValue(new ApiClientError(409, '定員6名に対して7名になるため保存できません（公演は作成されていません）'))
    const { result } = await setup()
    let saved: boolean | undefined
    await act(async () => { saved = await result.current.handleSavePerformance(data) })
    expect(saved).toBe(false)
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(shown).toEqual([])
    expect(mocks.error).toHaveBeenCalledWith('定員6名に対して7名になるため保存できません（公演は作成されていません）')
    expect(mocks.warning).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled()
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

describe('公演の追加で GM 名を消さない（2026-10-22 hotfix、PR #1210）', () => {
  it('作成と担当を 1 回で送り、別の担当同期を呼ばない。表示は保存結果の GM', async () => {
    const created = deferred<unknown>()
    mocks.create.mockReturnValue(created.promise)
    const { result } = await setup()
    let pending!: Promise<boolean>
    await act(async () => { pending = result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }); await flush() })
    expect(shown.map(e => e.gms)).toEqual([['A']])
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ gms: [], gm_roles: {}, staff_assignment: { gms: ['A'], gm_roles: { A: 'main' }, entries: [] } }))
    await act(async () => { created.resolve({ ...data, gms: ['A'], gm_roles: { A: 'main' }, id: 'saved', store_id: 'store', current_participants: 0 }); expect(await pending).toBe(true) })
    expect(shown).toMatchObject([{ id: 'saved', gms: ['A'], gm_roles: { A: 'main' } }])
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(mocks.success).toHaveBeenCalledWith('保存しました')
  })
  it('スタッフ参加の追加席も作成と同じ要求で送る', async () => {
    const entries = [{ staff_id: 's2', mode: 'additional' as const, reservation_id: null }]
    const { result } = await setup()
    await act(async () => { await result.current.handleSavePerformance({ ...data, gms: ['B'], gm_roles: { B: 'staff' }, staffParticipation: { ...plan, entries } }) })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ staff_assignment: { gms: ['B'], gm_roles: { B: 'staff' }, entries } }))
    expect(mocks.sync).not.toHaveBeenCalled()
  })
  it('履歴スナップショットの取得を待たずに保存を終える', async () => {
    const snapshot = deferred<null>()
    mocks.snapshot.mockReturnValue(snapshot.promise)
    const { result } = await setup()
    let saved: boolean | undefined
    await act(async () => { saved = await result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }) })
    expect(saved).toBe(true)
    await act(async () => { snapshot.resolve(null); await flush() })
  })
  it('GM 未指定の追加は担当を空で送り（作成履歴を DB で確定するため）、担当の同期は呼ばない', async () => {
    mocks.create.mockResolvedValue({ ...data, gms: [], gm_roles: {}, id: 'saved', store_id: 'store', current_participants: 0 })
    const { result } = await setup()
    let saved: boolean | undefined
    await act(async () => { saved = await result.current.handleSavePerformance({ ...data, gms: [], gm_roles: {}, staffParticipation: plan }) })
    expect(saved).toBe(true)
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ staff_assignment: { gms: [], gm_roles: {}, entries: [] } })
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(shown).toMatchObject([{ id: 'saved', gms: [] }])
  })
  it('作成が競合で失敗しても、他端末で更新された別の公演の表示は消さない（P2-3）', async () => {
    shown = [{ id: 'other', gms: ['B'], gm_roles: { B: 'main' } } as unknown as ScheduleEvent]
    mocks.create.mockRejectedValue(new ApiClientError(409, '担当スタッフが更新されました'))
    const { result } = await setup()
    await act(async () => { await result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }) })
    expect(shown).toEqual([{ id: 'other', gms: ['B'], gm_roles: { B: 'main' } }])
  })
})

describe('保存中の再取得で GM 名を消さない（実際の React Query、PR #1210 Codex レビュー P2-1）', () => {
  it('作成の応答待ちに始まって終わった再取得（まだ公演を含まない）でも、入力した GM の公演を表示し続ける', async () => {
    const qc = new QueryClient()
    const key = scheduleEventKeys.month(2026, 11)
    qc.setQueryData(key, [])
    const bound = (u: ScheduleEvent[] | ((prev: ScheduleEvent[]) => ScheduleEvent[])) => { setScheduleMonthData(qc, 2026, 11, u); shown = qc.getQueryData<ScheduleEvent[]>(key) ?? [] }
    setEvents.mockImplementation(bound)
    const created = deferred<unknown>()
    mocks.create.mockReturnValue(created.promise)
    const { result } = await setup()
    let pending!: Promise<boolean>
    await act(async () => { pending = result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }); await flush() })
    await qc.fetchQuery({ queryKey: key, queryFn: createScheduleMonthQueryFn(qc, 2026, 11, async () => []), staleTime: 0 })
    expect(qc.getQueryData<ScheduleEvent[]>(key)?.map(e => e.gms)).toEqual([['A']])
    await act(async () => { created.resolve({ ...data, gms: ['A'], gm_roles: { A: 'main' }, id: 'saved', store_id: 'store', current_participants: 0 }); await pending })
    // 応答前に実 ID の公演が取得で届いていても二重に並べない
    expect(qc.getQueryData<ScheduleEvent[]>(key)).toMatchObject([{ id: 'saved', gms: ['A'] }])
    await qc.fetchQuery({ queryKey: key, queryFn: createScheduleMonthQueryFn(qc, 2026, 11, async () => [{ id: 'saved', gms: ['A'] } as ScheduleEvent]), staleTime: 0 })
    expect(qc.getQueryData<ScheduleEvent[]>(key)).toEqual([{ id: 'saved', gms: ['A'] }])
    qc.clear()
  })
})

describe('応答待ちの確定公演と作成履歴（PR #1210 Codex 再レビュー 2e24bbf）', () => {
  function bindQueryClient() {
    const qc = new QueryClient()
    const key = scheduleEventKeys.month(2026, 11)
    qc.setQueryData(key, [])
    setEvents.mockImplementation(u => { setScheduleMonthData(qc, 2026, 11, u); shown = qc.getQueryData<ScheduleEvent[]>(key) ?? [] })
    return { qc, key }
  }
  it('1: 応答待ちの間に確定した実 ID の公演が取得で届いたら、仮の公演を残さない（二重表示しない）', async () => {
    const { qc, key } = bindQueryClient()
    const created = deferred<unknown>(); mocks.create.mockReturnValue(created.promise)
    const { result } = await setup()
    let pending!: Promise<boolean>
    await act(async () => { pending = result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }); await flush() })
    const real = { ...shown[0], id: 'saved', start_time: '15:30:00' }
    await qc.fetchQuery({ queryKey: key, queryFn: createScheduleMonthQueryFn(qc, 2026, 11, async () => [real]), staleTime: 0 })
    expect(qc.getQueryData<ScheduleEvent[]>(key)!.map(e => e.id)).toEqual(['saved'])
    await act(async () => { created.resolve({ ...data, id: 'saved', gms: ['A'], gm_roles: { A: 'main' }, store_id: 'store' }); await pending })
    expect(qc.getQueryData<ScheduleEvent[]>(key)!.map(e => e.id)).toEqual(['saved'])
    qc.clear()
  })
  it('1: 同じ枠に前からある別の公演が取得で届いても、保存中の仮の公演は消さない', async () => {
    const { qc, key } = bindQueryClient()
    const existing = { ...data, id: 'existing', venue: 'store', gms: ['X'] } as unknown as ScheduleEvent
    qc.setQueryData(key, [existing]); shown = [existing]
    const created = deferred<unknown>(); mocks.create.mockReturnValue(created.promise)
    const { result } = await setup()
    let pending!: Promise<boolean>
    await act(async () => { pending = result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }); await flush() })
    await qc.fetchQuery({ queryKey: key, queryFn: createScheduleMonthQueryFn(qc, 2026, 11, async () => [existing]), staleTime: 0 })
    expect(qc.getQueryData<ScheduleEvent[]>(key)!.map(e => e.gms)).toEqual([['X'], ['A']])
    await act(async () => { created.resolve({ ...data, id: 'saved', gms: ['A'], gm_roles: { A: 'main' }, store_id: 'store' }); await pending })
    qc.clear()
  })
  it('2: 応答より先に同じ実 ID の公演（他端末 B の更新後）を取得していたら、遅い応答 A で上書きしない', async () => {
    const created = deferred<unknown>(); mocks.create.mockReturnValue(created.promise)
    const { result } = await setup()
    let pending!: Promise<boolean>
    await act(async () => { pending = result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }); await flush() })
    shown = [...shown, { ...shown[0], id: 'saved', gms: ['B'], gm_roles: { B: 'main' } }]
    await act(async () => { created.resolve({ ...data, id: 'saved', gms: ['A'], gm_roles: { A: 'main' }, store_id: 'store' }); await pending })
    expect(shown).toHaveLength(1)
    expect(shown[0]).toMatchObject({ id: 'saved', gms: ['B'], gm_roles: { B: 'main' } })
  })
  it('3: 担当付きの作成では、画面から遅れて作成履歴を記録しない（DB が同じ取引で記録する）', async () => {
    const snapshot = deferred<unknown>(); mocks.snapshot.mockReturnValue(snapshot.promise)
    mocks.create.mockResolvedValue({ ...data, id: 'saved', store_id: 'store', gms: ['A'], gm_roles: { A: 'main' } })
    const { result } = await setup()
    await act(async () => { expect(await result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan })).toBe(true) })
    await act(async () => { snapshot.resolve({ ...data, id: 'saved', gms: ['B'] }); await flush() })
    expect(mocks.snapshot).not.toHaveBeenCalled()
    expect(mocks.history).not.toHaveBeenCalled()
  })
  it('3: GM 未指定の作成も、画面から遅れて作成履歴を記録しない（DB が同じ取引で記録する。Codex 再レビュー 2fa19ac の P2-②）', async () => {
    const snapshot = deferred<unknown>(); mocks.snapshot.mockReturnValue(snapshot.promise)
    mocks.create.mockResolvedValue({ ...data, gms: [], gm_roles: {}, id: 'saved', store_id: 'store' })
    const { result } = await setup()
    await act(async () => { expect(await result.current.handleSavePerformance({ ...data, gms: [], gm_roles: {}, staffParticipation: plan })).toBe(true) })
    await act(async () => { snapshot.resolve({ ...data, id: 'saved', gms: ['B'] }); await flush() })
    expect(mocks.snapshot).not.toHaveBeenCalled()
    expect(mocks.history).not.toHaveBeenCalled()
  })
  it.each([
    ['通信の失敗', new TypeError('Failed to fetch')],
    ['作成されたか不明（502）', new ApiClientError(502, 'x', undefined, { outcome: 'unknown' })],
    ['時間切れ（504）', new ApiClientError(504, 'Gateway Timeout')],
  ])('4: %s は「失敗」と断定せず、確認してから保存し直すよう伝える', async (_label, error) => {
    mocks.create.mockRejectedValue(error)
    const { result } = await setup()
    let saved: boolean | undefined
    await act(async () => { saved = await result.current.handleSavePerformance({ ...data, gm_roles: { A: 'main' }, staffParticipation: plan }) })
    expect(saved).toBe(false)
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('作成されたか確認できませんでした'))
    expect(mocks.error).not.toHaveBeenCalledWith(expect.stringContaining('されていません'))
  })
})

describe('結果が分からなかった作成の保存し直し（PR #1210 Codex 再レビュー 2fa19ac の P2-①）', () => {
  const unknown = () => new ApiClientError(502, '結果不明', undefined, { outcome: 'unknown' })
  const input = { ...data, gm_roles: { A: 'main' }, staffParticipation: plan }
  const requestIds = () => mocks.create.mock.calls.map(call => (call[0] as { client_request_id: string }).client_request_id)
  it('同じ入力で保存し直すと、前回と同じ要求 ID で送る（サーバーが既に作った公演を返し、二重に作らない）', async () => {
    mocks.create.mockRejectedValueOnce(unknown()).mockResolvedValueOnce({ ...data, id: 'created-once', store_id: 'store', gms: ['A'], gm_roles: { A: 'main' } })
    const { result } = await setup()
    await act(async () => { expect(await result.current.handleSavePerformance(input)).toBe(false) })
    await act(async () => { expect(await result.current.handleSavePerformance(input)).toBe(true) })
    const [first, second] = requestIds()
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).toBe(first)
    expect(shown).toMatchObject([{ id: 'created-once' }])
  })
  it('通信の失敗のあとも同じ入力なら同じ要求 ID', async () => {
    mocks.create.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = await setup()
    await act(async () => { await result.current.handleSavePerformance(input) })
    await act(async () => { await result.current.handleSavePerformance(input) })
    expect(new Set(requestIds()).size).toBe(1)
  })
  it('入力を変えた保存、確定した失敗のあと、成功のあとは新しい要求 ID', async () => {
    mocks.create.mockRejectedValueOnce(unknown()).mockRejectedValueOnce(new ApiClientError(409, '定員超過（公演は作成されていません）'))
    const { result } = await setup()
    await act(async () => { await result.current.handleSavePerformance(input) })
    await act(async () => { await result.current.handleSavePerformance({ ...input, notes: '変更' }) })
    await act(async () => { await result.current.handleSavePerformance({ ...input, notes: '変更' }) })
    await act(async () => { await result.current.handleSavePerformance({ ...input, notes: '変更' }) })
    expect(new Set(requestIds()).size).toBe(4)
  })
})


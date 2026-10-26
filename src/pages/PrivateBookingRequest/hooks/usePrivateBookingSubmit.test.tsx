// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrivateBookingSubmit } from './usePrivateBookingSubmit'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from, functions: { invoke: mocks.invoke } } }))
vi.mock('@/lib/organization', () => ({ resolveOrgIdFromPageContext: async () => 'org' }))
vi.mock('@/lib/privateBookingScenarioTime', () => ({ fetchScenarioTimingFromDb: async () => ({ preparation_minutes_by_store: {}, preparation_minutes_by_event: {} }) }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
let root: Root
let result: ReturnType<typeof usePrivateBookingSubmit>
function Harness() {
  result = usePrivateBookingSubmit({ scenarioTitle: 'Fixture', scenarioId: 'scenario', participationFee: 5000, maxParticipants: 6,
    selectedTimeSlots: [{ date: '2030-01-01', slot: { label: '昼', startTime: '14:00', endTime: '17:00' } }],
    selectedStoreIds: ['store'], stores: [{ id: 'store', name: 'Fixture' }], userId: 'user', groupId: 'group' })
  return null
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks()
  mocks.from.mockImplementation(table => {
    const data = table === 'customers' ? { id: 'customer', phone: '00000000000' } : []
    const q: any = { select: () => q, order: () => q, update: () => q, eq: () => q, filter: () => q, in: () => q, gte: () => q, lte: () => q,
      maybeSingle: async () => ({ data, error: null }), then: (resolve: any) => Promise.resolve({ data: table === 'customers' ? [data] : data, error: null }).then(resolve) }
    return q
  })
  mocks.rpc.mockImplementation(async name => ({ data: name === 'get_public_private_booking_availability' ? [] : 'reservation', error: null }))
  mocks.invoke.mockResolvedValue({ data: {}, error: null })
  root = createRoot(document.createElement('div')); await act(async () => root.render(<Harness />))
})
afterEach(async () => { await act(async () => root.unmount()) })
it('通知を含む予約保存だけを呼び、グループ・通知を画面から重複更新しない', async () => {
  await act(async () => { await result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', '') })
  expect(mocks.rpc).toHaveBeenCalledWith('create_private_booking_request_with_notice', expect.objectContaining({ p_private_group_id: 'group' }))
  expect(mocks.from.mock.calls.map(call => call[0])).not.toContain('private_groups')
  expect(mocks.from.mock.calls.map(call => call[0])).not.toContain('private_group_messages')
  expect(mocks.invoke).toHaveBeenCalledTimes(1)
  expect(result.success).toBe(true); expect(result.isSubmitting).toBe(false)
})
it('予約・通知の保存失敗でメール送信と成功表示を行わない', async () => {
  mocks.rpc.mockImplementation(async name => name === 'get_public_private_booking_availability'
    ? { data: [], error: null } : { data: null, error: { message: '通知保存失敗', code: 'P0002' } })
  await act(async () => { await expect(result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', '')).rejects.toThrow('通知保存失敗') })
  expect(mocks.invoke).not.toHaveBeenCalled(); expect(result.success).toBe(false); expect(result.isSubmitting).toBe(false)
})

it.each([{ success: false }, { success: true, skipped: true }, { success: true, email_sent: false }])('通知未送信 %s でも予約保存を保ち、送信済み表示にしない', async data => {
  mocks.invoke.mockResolvedValue({ data, error: null })
  await act(async () => { await result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', '') })
  expect(result.success).toBe(true)
  expect(result.confirmationEmailAccepted).toBe(false)
})
it('通知受付成功を区別する', async () => {
  mocks.invoke.mockResolvedValue({ data: { success: true }, error: null })
  await act(async () => { await result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', '') })
  expect(result.confirmationEmailAccepted).toBe(true)
})
it('同時に 2 回呼ばれても（二度押し）申込は 1 件だけ作る。成功後に同じ画面から 2 件目を作らない（点検 F09）', async () => {
  await act(async () => {
    await Promise.all([
      result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', ''),
      result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', ''),
    ])
  })
  await act(async () => { await result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', '') })
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'create_private_booking_request_with_notice')).toHaveLength(1)
  expect(result.success).toBe(true)
})
describe('点検 F09: 保存後に応答だけ届かなかった送信の再試行', () => {
  const saved = { number: '' as string, status: 'pending', group: 'group', readable: true }
  beforeEach(() => {
    const base = mocks.from.getMockImplementation()!
    mocks.from.mockImplementation((table: string) => {
      expect(table).not.toBe('private_groups') // 貸切グループの表は直接読まない（database.mdc）
      if (table !== 'reservations') return base(table)
      const filters: Record<string, unknown> = {}
      const q: any = { select: () => q, filter: (k: string, _op: string, v: unknown) => { filters[k] = v; return q }, eq: (k: string, v: unknown) => { filters[k] = v; return q }, maybeSingle: async () => {
        const row = { id: 'saved-reservation', reservation_number: saved.number, status: saved.status, private_group_id: saved.group, customer_id: 'customer', organization_id: 'org' }
        const hit = saved.readable && filters.reservation_number === row.reservation_number && filters.private_group_id === row.private_group_id && filters.customer_id === 'customer'
        return { data: hit ? row : null, error: null }
      } }
      return q
    })
  })
  const createCalls = () => mocks.rpc.mock.calls.filter(([name]) => name === 'create_private_booking_request_with_notice')
  it('再試行は同じ予約番号で送り、DB が 2 件目を断っても、その番号の申込が保存済みなら成功にする（新しい申込は作らない）', async () => {
    mocks.rpc.mockImplementation(async (name: string, params: any) => {
      if (name === 'get_public_private_booking_availability') return { data: [], error: null }
      // 1 回目: 保存されたが応答が届かない。2 回目: 同じグループの 2 件目として断られる
      if (createCalls().length === 1) { saved.number = params.p_reservation_number; return { data: null, error: { message: 'Failed to fetch' } } }
      return { data: null, error: { message: '既に申込済み、確定済み、または取消済みです。画面を更新してください', code: '22023' } }
    })
    saved.number = ''; saved.status = 'pending'; saved.group = 'group'; saved.readable = false
    // 1 回目は通信が切れていて、保存済みかを確かめる読み取りもできない → エラー。2 回目（再試行）で確かめられる
    const first = result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', '')
    await act(async () => { await first.catch(() => {}) })
    expect(result.success).toBe(false)
    const numbers = createCalls().map(([, p]) => p.p_reservation_number)
    saved.readable = true
    await act(async () => { await result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', '') })
    expect(createCalls().map(([, p]) => p.p_reservation_number)).toEqual([numbers[0], numbers[0]])
    expect(result.success).toBe(true)
  })
  it.each([['別の番号（別の申込）', 'OTHER-0001', 'pending'], ['取消済み', null, 'cancelled']])('グループの申込が%sなら成功にせず、エラーのまま', async (_label, number, status) => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'get_public_private_booking_availability'
      ? { data: [], error: null } : { data: null, error: { message: '処理中の予約があるため再申込できません。画面を更新してください', code: '22023' } })
    saved.status = status as string; saved.readable = true
    mocks.rpc.mockImplementation(async (name: string, params: any) => {
      if (name === 'get_public_private_booking_availability') return { data: [], error: null }
      saved.number = number ?? params.p_reservation_number
      return { data: null, error: { message: '処理中の予約があるため再申込できません。画面を更新してください', code: '22023' } }
    })
    await act(async () => { await expect(result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', '')).rejects.toThrow() })
    expect(result.success).toBe(false)
  })
})

describe('点検 F09: 内容を変えてから送り直したとき', () => {
  it('保存済みの申込（変更前の内容）を変更後の成功と取り違えず、別の予約番号で送って DB の断りを出す', async () => {
    const saved: string[] = []
    mocks.from.mockImplementation((table: string) => {
      const q: any = { select: () => q, order: () => q, update: () => q, filter: () => q, in: () => q, gte: () => q, lte: () => q }
      const filters: Record<string, unknown> = {}
      q.eq = (k: string, v: unknown) => { filters[k] = v; return q }
      q.filter = (k: string, _op: string, v: unknown) => { filters[k] = v; return q }
      q.maybeSingle = async () => table === 'reservations'
        ? { data: saved.includes(filters.reservation_number as string) ? { id: 'saved', reservation_number: filters.reservation_number, status: 'pending', private_group_id: 'group', customer_id: 'customer', organization_id: 'org' } : null, error: null }
        : { data: { id: 'customer', phone: '00000000000' }, error: null }
      q.then = (resolve: any) => Promise.resolve({ data: table === 'customers' ? [{ id: 'customer', phone: '00000000000' }] : [], error: null }).then(resolve)
      return q
    })
    let calls = 0
    mocks.rpc.mockImplementation(async (name: string, params: any) => {
      if (name === 'get_public_private_booking_availability') return { data: [], error: null }
      calls++
      // 1 回目: 保存されたが応答が届かず、保存済みの確認の読み取りも失敗。2 回目（メモを変えて送信）: 同じグループの 2 件目として断られる
      if (calls === 1) { saved.push(params.p_reservation_number); return { data: null, error: { message: 'Failed to fetch' } } }
      return { data: null, error: { message: '処理中の予約があるため再申込できません。画面を更新してください', code: '22023' } }
    })
    const realFrom = mocks.from.getMockImplementation()!
    mocks.from.mockImplementation((table: string) => {
      if (table === 'reservations' && calls === 1 && saved.length === 1 && !(globalThis as any).__readOnce) { (globalThis as any).__readOnce = true; const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: { message: 'Failed to fetch' } }) }; return q }
      return realFrom(table)
    })
    await act(async () => { await expect(result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', '')).rejects.toThrow() })
    await act(async () => { await expect(result.handleSubmit('Fixture', 'fixture@example.invalid', '00000000000', 'メモを追加')).rejects.toThrow('再申込できません') })
    const numbers = mocks.rpc.mock.calls.filter(([name]) => name === 'create_private_booking_request_with_notice').map(([, p]) => p.p_reservation_number)
    expect(numbers).toHaveLength(2)
    expect(numbers[0]).not.toBe(numbers[1])
    expect(result.success).toBe(false)
    delete (globalThis as any).__readOnce
  })
})

// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organizationId: 'org' }) }))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: () => ({ isCustomHoliday: () => false }) }))
vi.mock('@/utils/toast', () => ({ showToast: { error: mocks.toast } }))
import { useBookingApproval } from './useBookingApproval'
let root: Root
const result = { current: undefined as unknown as ReturnType<typeof useBookingApproval> }
function Harness({ onSuccess }: { onSuccess: () => void }) { result.current = useBookingApproval({ onSuccess }); return null }
async function render(onSuccess: () => void) { root = createRoot(document.createElement('div')); await act(async () => root.render(<Harness onSuccess={onSuccess} />)) }
afterEach(async () => { if (root) await act(async () => root.unmount()) })
describe('貸切申込の完全削除', () => {
  beforeEach(() => { vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }) })
  it('一括削除が完了したときだけ閉じて一覧を更新する', async () => {
    mocks.rpc.mockResolvedValue({ error: null })
    const onSuccess = vi.fn()
    await render(onSuccess)
    act(() => result.current.handleDelete('request'))
    await act(() => result.current.runDelete())
    expect(mocks.rpc).toHaveBeenCalledWith('delete_private_booking_request_atomic', { p_reservation_id: 'request' })
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(result.current.deleteConfirmOpen).toBe(false)
  })
  it('履歴保護や同時更新のエラー理由を表示し、成功扱いにしない', async () => {
    const reason = 'この申込は別の処理で更新中です。少し待って再度お試しください'
    mocks.rpc.mockResolvedValue({ error: { message: reason } })
    const onSuccess = vi.fn()
    await render(onSuccess)
    act(() => result.current.handleDelete('request'))
    await act(() => result.current.runDelete())
    expect(mocks.toast).toHaveBeenCalledWith(reason)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(result.current.deleteConfirmOpen).toBe(true)
    expect(result.current.submitting).toBe(false)
  })
})


describe('貸切承認と通知', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mocks.from.mockImplementation(() => {
      const query: Record<string, unknown> = {}
      for (const method of ['select', 'filter', 'eq', 'neq']) query[method] = () => query
      query.maybeSingle = () => Promise.resolve({ data: null, error: null })
      query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve)
      return query
    })
  })
  it('30分の間隔を画面の60分固定判定で拒否せず、設定を使う承認RPCへ渡す', async () => {
    mocks.from.mockImplementation((table: string) => {
      const query: Record<string, unknown> = {}
      for (const method of ['select', 'filter', 'eq', 'neq']) query[method] = () => query
      query.maybeSingle = () => Promise.resolve({ data: null, error: null })
      query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: table === 'schedule_events_staff_view'
        ? [{ id: 'other', start_time: '10:00', end_time: '13:30', reservation_id: 'other', scenario: '別公演' }] : [], error: null }).then(resolve)
      return query
    })
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0027' } })
    await render(vi.fn())
    let response: { success: boolean; error?: string } | undefined
    await act(async () => {
      response = await result.current.handleApprove('request', {
        candidate_datetimes: { candidates: [{ order: 1, date: '2027-02-11', startTime: '14:00', endTime: '17:00', timeSlot: 'afternoon' }] },
      } as Parameters<typeof result.current.handleApprove>[1], 'gm', null, 'store', 1, [])
    })
    expect(mocks.rpc).toHaveBeenCalledWith('approve_private_booking_with_notice', expect.anything())
    expect(response?.error).toContain('設定された準備時間')
    expect(response?.error).not.toContain('60分')
  })
  it.each([
    ['P0050', '所属組織が一致しない'],
    ['P0051', '別の申込が紐付いている'],
    ['P0052', '作品設定が見つからない'],
  ])('%sは理由を表示し、成功処理や通知を開始しない', async (code, message) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code } })
    const onSuccess = vi.fn()
    await render(onSuccess)
    let response: { success: boolean; error?: string } | undefined
    await act(async () => {
      response = await result.current.handleApprove('request', {
        candidate_datetimes: { candidates: [{ order: 1, date: '2027-02-11', startTime: '14:00', endTime: '17:00', timeSlot: 'afternoon' }] },
      } as Parameters<typeof result.current.handleApprove>[1], 'gm', null, 'store', 1, [])
    })
    expect(mocks.rpc).toHaveBeenCalledWith('approve_private_booking_with_notice', expect.objectContaining({ p_reservation_id: 'request' }))
    expect(response?.success).toBe(false)
    expect(response?.error).toContain(message)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(mocks.from.mock.calls.map(call => call[0])).toEqual(['schedule_blocked_slots', 'schedule_events_staff_view'])
    expect(result.current.submitting).toBe(false)
  })
})

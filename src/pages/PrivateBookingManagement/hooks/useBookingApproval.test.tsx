// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn(), from: vi.fn(), cancel: vi.fn(), invoke: vi.fn(), success: vi.fn(), warning: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from, functions: { invoke: mocks.invoke } } }))
vi.mock('@/hooks/useOrganization', () => ({ useOrganization: () => ({ organizationId: 'org' }) }))
vi.mock('@/hooks/useCustomHolidays', () => ({ useCustomHolidays: () => ({ isCustomHoliday: () => false }) }))
vi.mock('@/utils/toast', () => ({ showToast: { error: mocks.toast, success: mocks.success, warning: mocks.warning } }))
vi.mock('@/lib/reservationApi', () => ({ reservationApi: { cancel: mocks.cancel } }))
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


describe('貸切却下の一括保存と送信結果', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mocks.cancel.mockResolvedValue({ id: 'request', status: 'cancelled' })
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null })
    mocks.from.mockImplementation(() => { throw new Error('却下画面から直接DB操作しない') })
  })
  async function prepare(onSuccess = vi.fn()) {
    await render(onSuccess)
    await act(() => result.current.handleRejectClick('request'))
    act(() => result.current.setRejectionReason('編集した本文'))
    vi.clearAllMocks()
    return onSuccess
  }
  it('一括保存へ全文を渡し、ブラウザから別メールを送らず送信予定として表示する', async () => {
    const refreshed = await prepare()
    await act(() => result.current.handleRejectConfirm())
    expect(mocks.cancel).toHaveBeenCalledWith('request', expect.any(String), expect.objectContaining({ privateRejectionBody: '編集した本文', skipGroupCancel: true, cancelPrivateEvent: true }))
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.success).toHaveBeenLastCalledWith('貸切リクエストを却下しました', expect.stringContaining('送信予定を保存'))
    expect(refreshed).toHaveBeenCalledOnce(); expect(result.current.submitting).toBe(false)
  })
  it('保存失敗ならメールを送らず編集本文を保持する', async () => {
    await prepare(); mocks.cancel.mockRejectedValue(new Error('保存失敗'))
    await act(() => result.current.handleRejectConfirm())
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled()
    expect(result.current.rejectionReason).toBe('編集した本文'); expect(mocks.toast).toHaveBeenCalled()
    expect(result.current.submitting).toBe(false)
  })
  it.each([{ data: { success: false }, error: null }, { data: null, error: new Error('通信失敗') }])('ブラウザの送信サービスが失敗していても別送信せず、保存済み予定を使う', async response => {
    await prepare(); mocks.invoke.mockResolvedValue(response)
    await act(() => result.current.handleRejectConfirm())
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.warning).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalledWith('却下メールを送信しました')
    expect(result.current.showRejectDialog).toBe(false)
  })
  it('送信例外と再取得失敗でも処理中を解除し保存済みと伝える', async () => {
    await prepare(vi.fn().mockRejectedValue(new Error('再取得失敗')))
    mocks.invoke.mockRejectedValue(new Error('送信失敗'))
    await act(() => result.current.handleRejectConfirm())
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.warning).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled()
    expect(result.current.submitting).toBe(false)
  })
})

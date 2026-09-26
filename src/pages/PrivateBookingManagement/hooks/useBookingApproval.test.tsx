// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
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

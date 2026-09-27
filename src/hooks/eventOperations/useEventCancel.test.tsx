// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useEventCancel } from './useEventCancel'
import type { ScheduleEvent } from '@/types/schedule'

const mocks = vi.hoisted(() => ({
  from: vi.fn(), invoke: vi.fn(), cancel: vi.fn(), toggle: vi.fn(), active: vi.fn(),
  success: vi.fn(), error: vi.fn(), refresh: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, functions: { invoke: mocks.invoke } } }))
vi.mock('@/lib/api', () => ({ scheduleApi: { toggleCancel: mocks.toggle } }))
vi.mock('@/lib/apiClient', () => ({ apiClient: { post: vi.fn() } }))
vi.mock('@/lib/reservationApi', () => ({
  reservationApi: { cancelWithLock: mocks.cancel }, markSenshinDiscordCancelled: vi.fn(),
  RESERVATION_WITH_CUSTOMER_SELECT_FIELDS: 'fields',
  joinedCustomerFromReservation: (value: unknown) => value,
}))
vi.mock('@/lib/api/eventHistoryApi', () => ({ fetchEventSnapshot: vi.fn(), createEventHistory: vi.fn() }))
vi.mock('@/lib/apiErrorHandler', () => ({ getSafeErrorMessage: (_error: unknown, fallback: string) => fallback }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }))
vi.mock('@/utils/toast', () => ({ showToast: { success: mocks.success, error: mocks.error, info: vi.fn(), warning: vi.fn() } }))
vi.mock('@/hooks/eventOperations/useEventDelete', () => ({
  DEFAULT_CANCELLATION_REASON: '公演中止', fetchActiveReservations: mocks.active,
  formatCustomerLabel: () => '予約', isPendingSaveEvent: () => false,
  PENDING_SAVE_MESSAGE: '', buildCancelMailComposer: vi.fn(async () => ({})),
}))
const event = { id: 'event', date: '2026-10-01', scenario: '作品' } as ScheduleEvent
const rows = [1, 2, 3].map(i => ({
  id: `r${i}`, reservation_number: `A-${i}`, customer_id: `c${i}`,
  customer_email: `snapshot${i}@example.com`, customer_name: '予約者',
  customers: { email: `current${i}@example.com`, name: '現在名' },
}))
let root: Root
let result: ReturnType<typeof useEventCancel>
let query: Record<string, ReturnType<typeof vi.fn>>
function Harness() {
  result = useEventCancel({ setEvents: vi.fn(), organizationId: 'org', fetchSchedule: mocks.refresh })
  return null
}
beforeEach(async () => {
  vi.resetAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.active.mockResolvedValue(rows)
  mocks.cancel.mockResolvedValue(true)
  mocks.invoke.mockResolvedValue({ data: { success: true }, error: null })
  query = { select: vi.fn(), eq: vi.fn(), neq: vi.fn(), then: vi.fn() }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.neq.mockReturnValue(query)
  query.then.mockImplementation((resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: rows, error: null })))
  mocks.from.mockReturnValue(query)
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<Harness />))
})
afterEach(async () => { await act(async () => root.unmount()) })
async function confirm() {
  let pending: Promise<void>
  await act(async () => { pending = result.handleCancelConfirmPerformance(event) })
  expect(result.cancelEventPrompt).not.toBeNull()
  await act(async () => {
    result.resolveCancelEventPrompt({ reason: '中止', sendMail: true, bodies: {} })
    await pending!
  })
}
describe('公演中止の結果表示', () => {
  it('取消後に予約保存時の宛先へ送り、実際の処理件数を表示する', async () => {
    mocks.active.mockResolvedValue([...rows, { id: 'already-cancelled' }])
    await confirm()
    expect(mocks.cancel).toHaveBeenCalledTimes(3)
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'org')
    expect(mocks.invoke.mock.calls[0]?.[1].body.customerEmail).toBe('snapshot1@example.com')
    expect(mocks.success).toHaveBeenCalledWith('公演を中止し、3件の予約をキャンセルしました（メール送信済み）')
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
  it('一部取消失敗とメール失敗を両方表示し、取消失敗分には送信しない', async () => {
    mocks.cancel.mockImplementation(async (id: string) => id !== 'r2')
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error('送信失敗') })
    await confirm()
    expect(mocks.invoke.mock.calls.map(call => call[1].body.reservationId)).toEqual(['r1', 'r3'])
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/1件の予約キャンセルに失敗.*A-2.*取消済みの1件.*A-1/))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
  it.each([
    { success: false, skipped: true, reason: 'resend_not_configured' },
    { success: true, skipped: true, reason: 'company_or_manual_reply_required' },
    null,
  ])('HTTP成功でも未送信・不明を送信済みと表示しない: %j', async data => {
    mocks.invoke.mockResolvedValue({ data, error: null })
    await confirm()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('取消済みの3件はメールの送信を確認できません'))
  })
  it('宛先なしも無視せず、再取得の失敗でも部分失敗の案内を維持する', async () => {
    query.then.mockImplementation((resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [{ id: 'r1' }], error: null })))
    mocks.refresh.mockRejectedValue(new Error('offline'))
    await confirm()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('取消済みの1件はメールの送信を確認できません'))
    expect(mocks.success).not.toHaveBeenCalled()
  })
})

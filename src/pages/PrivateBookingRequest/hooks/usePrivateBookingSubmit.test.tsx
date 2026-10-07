// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
    const q: any = { select: () => q, update: () => q, eq: () => q, filter: () => q, in: () => q, gte: () => q, lte: () => q,
      maybeSingle: async () => ({ data, error: null }), then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) }
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

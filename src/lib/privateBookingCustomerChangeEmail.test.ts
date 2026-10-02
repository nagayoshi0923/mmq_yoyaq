import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ read: vi.fn(), invoke: vi.fn(), eq: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: () => ({ select() { return this }, eq(...args: unknown[]) { m.eq(...args); return this }, maybeSingle: m.read }),
  functions: { invoke: m.invoke },
} }))
vi.mock('@/utils/logger', () => ({ logger: m }))
import { sendPrivateBookingCustomerChangeEmail } from './privateBookingCustomerChangeEmail'
const input = { reservationId: 'r', organizationId: 'org', changes: [{ field: 'date', label: '日', oldValue: '旧', newValue: '新' }] }
beforeEach(() => {
  vi.resetAllMocks()
  m.read.mockResolvedValue({ data: { id: 'r', organization_id: 'org', customer_email: 'fixture@example.invalid', customer_name: '顧客', schedule_events: null }, error: null })
  m.invoke.mockResolvedValue({ data: { success: true, emailId: 'receipt' }, error: null })
})
it.each([
  { data: { success: false }, error: null },
  { data: { success: true }, error: { message: 'private provider response' } },
  { data: null, error: null },
])('通知失敗応答を保存処理へthrowせず返し、成功ログと自動再送を行わない: %s', async response => {
  m.invoke.mockResolvedValue(response)
  expect(await sendPrivateBookingCustomerChangeEmail(input)).toMatchObject({ status: 'failed' })
  expect(m.invoke).toHaveBeenCalledTimes(1); expect(m.log).not.toHaveBeenCalled()
  expect(JSON.stringify(m.warn.mock.calls)).not.toContain('private provider response')
  expect(m.eq).toHaveBeenCalledWith('organization_id', 'org')
})
it.each(['read', 'invoke'] as const)('%sの通信例外も保存成功と分離する', async method => {
  m[method].mockRejectedValue(Error('transport disconnected'))
  expect(await sendPrivateBookingCustomerChangeEmail(input)).toEqual({ status: 'failed', reason: 'exception' })
  expect(m.log).not.toHaveBeenCalled()
})
it('予約読取失敗では通知しない', async () => {
  m.read.mockResolvedValue({ data: null, error: { message: 'read error' } })
  expect(await sendPrivateBookingCustomerChangeEmail(input)).toMatchObject({ status: 'failed' })
  expect(m.invoke).not.toHaveBeenCalled()
})
it('宛先なしと変更なしを送信成功に見せない', async () => {
  m.read.mockResolvedValue({ data: { id: 'r', customer_email: null }, error: null })
  expect(await sendPrivateBookingCustomerChangeEmail(input)).toMatchObject({ status: 'skipped' })
  expect(await sendPrivateBookingCustomerChangeEmail({ ...input, changes: [] })).toMatchObject({ status: 'skipped' })
  expect(m.invoke).not.toHaveBeenCalled(); expect(m.log).not.toHaveBeenCalled()
})
it('肯定応答だけを受付確認とし、送信本文と宛先を保持する', async () => {
  expect(await sendPrivateBookingCustomerChangeEmail(input)).toEqual({ status: 'accepted' })
  expect(m.invoke).toHaveBeenCalledWith('send-booking-change-confirmation', { body: expect.objectContaining({ reservationId: 'r', organizationId: 'org', customerEmail: 'fixture@example.invalid', changes: input.changes }) })
  expect(m.log).toHaveBeenCalledTimes(1)
})

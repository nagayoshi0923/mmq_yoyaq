import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: m.invoke } } }))
vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn() } }))
import { sendEmail } from './emailApi'
beforeEach(() => vi.resetAllMocks())
it.each([null, {}, { success: false }, { success: true, failedCount: 1 }, { success: true, skipped: true }])('偽成功や部分失敗をsuccessへ上書きしない: %s', async data => {
  m.invoke.mockResolvedValue({ data, error: null })
  expect(await sendEmail({ to: 'fixture@example.invalid', subject: 'subject', body: 'body' })).toMatchObject({ success: false })
})
it('成功レスポンスの受領IDを維持する', async () => {
  m.invoke.mockResolvedValue({ data: { success: true, messageId: 'id' }, error: null })
  expect(await sendEmail({ to: 'fixture@example.invalid', subject: 'subject', body: 'body' })).toMatchObject({ success: true, messageId: 'id' })
})

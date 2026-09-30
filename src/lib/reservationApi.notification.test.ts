import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ read: vi.fn(), invoke: vi.fn(), patch: vi.fn(), warn: vi.fn(), log: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: () => ({ select() { return this }, eq() { return this }, single: m.read }), functions: { invoke: m.invoke } } }))
vi.mock('@/lib/apiClient', () => ({ apiClient: { patch: m.patch } }))
vi.mock('@/utils/logger', () => ({ logger: { log: m.log, warn: m.warn, error: vi.fn() }, generateCorrelationId: vi.fn(), createCorrelatedLogger: vi.fn() }))
import { reservationApi } from './reservationApi'
const saved = { id: 'r', organization_id: 'org', total_price: 2000, customers: { name: '顧客', email: 'fixture@example.invalid' }, schedule_events: null }
beforeEach(() => {
  vi.resetAllMocks()
  m.read.mockResolvedValue({ data: { total_price: 1000 }, error: null })
  m.patch.mockResolvedValue(saved)
})
it.each([{ data: { success: false }, error: null }, { data: null, error: { message: 'HTTP error' } }])('予約の保存結果を維持し通知失敗を成功ログにしない: %s', async response => {
  m.invoke.mockResolvedValue(response)
  expect(await reservationApi.update('r', { total_price: 2000 }, true)).toEqual(saved)
  expect(m.patch).toHaveBeenCalledTimes(1); expect(m.invoke).toHaveBeenCalledTimes(1)
  expect(m.warn).toHaveBeenCalled(); expect(m.log).not.toHaveBeenCalledWith('予約変更確認メール受付確認')
})
it('保存失敗時は通知しない', async () => {
  m.patch.mockRejectedValue(Error('save failed'))
  await expect(reservationApi.update('r', { total_price: 2000 }, true)).rejects.toThrow('save failed')
  expect(m.invoke).not.toHaveBeenCalled()
})

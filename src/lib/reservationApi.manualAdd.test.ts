import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ rpc: vi.fn(), select: vi.fn(), from: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: m }))
vi.mock('@/lib/apiClient', () => ({ apiClient: {} }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }, generateCorrelationId: () => 'fixture', createCorrelatedLogger: () => ({ info: vi.fn() }) }))
import { reservationApi } from './reservationApi'
beforeEach(() => { vi.resetAllMocks(); m.rpc.mockReturnValue({ select: m.select }) })
it('手動参加者追加を認証付きRPCに送り、画面が必要とする関連顧客の読み戻しを保持する', async () => {
  const row = { schedule_event_id: 'event', participant_count: 1, reservation_source: 'staff_participation' }
  const saved = [{ id: 'reservation', customers: { name: 'fixture' } }]
  m.select.mockResolvedValue({ data: saved, error: null })
  expect(await reservationApi.insertDirect(row, 'id,customers(name)')).toEqual({ data: saved, error: null })
  expect(m.rpc).toHaveBeenCalledWith('add_manual_reservations', { p_rows: [row] })
  expect(m.select).toHaveBeenCalledWith('id,customers(name)'); expect(m.from).not.toHaveBeenCalled()
})
it('デモのバッチは1トランザクションで送り、拒否時に直接INSERTへ戻らない', async () => {
  const rows = [{ schedule_event_id: 'one' }, { schedule_event_id: 'two' }]
  const error = { code: '42501', message: '権限がありません' }
  m.select.mockResolvedValue({ data: null, error })
  expect(await reservationApi.insertDirect(rows)).toEqual({ data: null, error })
  expect(m.rpc).toHaveBeenCalledWith('add_manual_reservations', { p_rows: rows })
  expect(m.from).not.toHaveBeenCalled(); expect(m.rpc).toHaveBeenCalledTimes(1)
})

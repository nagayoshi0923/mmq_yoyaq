import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), recalculate: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: vi.fn() }))
vi.mock('@/lib/apiClient', () => ({ apiClient: mocks }))
vi.mock('@/lib/participantUtils', () => ({ recalculateCurrentParticipants: mocks.recalculate }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() }, generateCorrelationId: vi.fn(), createCorrelatedLogger: vi.fn() }))
import { reservationApi } from './reservationApi'
const details = { date: '2026-11-01', start_time: '15:30' }
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue([]) })
describe('スタッフ参加の保存結果', () => {
  it('定員超過を握りつぶさず、保存画面へ返す', async () => {
    const error = new Error('定員7名に対して8名になるため保存できません')
    mocks.post.mockRejectedValue(error)
    await expect(reservationApi.syncStaffReservations('event', ['スタッフA'], { スタッフA: 'staff' }, details)).rejects.toBe(error)
    expect(mocks.recalculate).not.toHaveBeenCalled()
  })
  it('登録済みのスタッフ参加を二重登録しない', async () => {
    mocks.get.mockResolvedValue([{ id: 'reservation', status: 'confirmed', reservation_source: 'staff_participation', participant_names: ['スタッフA'] }])
    await reservationApi.syncStaffReservations('event', ['スタッフA'], { スタッフA: 'staff' }, details)
    expect(mocks.post).not.toHaveBeenCalled()
    expect(mocks.patch).not.toHaveBeenCalled()
  })
  it('満席でのスタッフ交代は旧枠のキャンセル後に追加する', async () => {
    mocks.get.mockResolvedValue([{ id: 'old', status: 'confirmed', reservation_source: 'staff_entry', participant_names: ['旧スタッフ'] }])
    await reservationApi.syncStaffReservations('event', ['新スタッフ'], { 新スタッフ: 'staff' }, details)
    expect(mocks.patch).toHaveBeenCalled()
    expect(mocks.post).toHaveBeenCalled()
    expect(mocks.patch.mock.invocationCallOrder[0]).toBeLessThan(mocks.post.mock.invocationCallOrder[0])
  })
  it('旧枠のキャンセル失敗時は追加しない', async () => {
    mocks.get.mockResolvedValue([{ id: 'old', status: 'confirmed', reservation_source: 'staff_entry', participant_names: ['旧スタッフ'] }])
    mocks.patch.mockRejectedValue(new Error('通信エラー'))
    await expect(reservationApi.syncStaffReservations('event', ['新スタッフ'], { 新スタッフ: 'staff' }, details)).rejects.toThrow('通信エラー')
    expect(mocks.post).not.toHaveBeenCalled()
  })

})

import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), recalculate: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: vi.fn() }))
vi.mock('@/lib/apiClient', () => ({ apiClient: mocks }))
vi.mock('@/lib/participantUtils', () => ({ recalculateCurrentParticipants: mocks.recalculate }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() }, generateCorrelationId: vi.fn(), createCorrelatedLogger: vi.fn() }))
import { reservationApi } from './reservationApi'
const plan = { entries: [{ staff_id: 'staff-a', mode: 'included' as const, reservation_id: 'booking' },{ staff_id: 'staff-b', mode: 'additional' as const, reservation_id: null }], expected: [], expectedStaff: {gms:[],gm_roles:{}} }
beforeEach(() => vi.resetAllMocks())
describe('スタッフ参加を一括保存する', () => {
  it('人数内と追加席を一回のAPIに渡す。先行取消や名前照合はしない', async () => {
    await reservationApi.syncStaffReservations('event', ['A','B'], { A:'staff',B:'staff' },undefined,plan)
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/api/reservations?action=sync-staff-participation',{schedule_event_id:'event',entries:plan.entries,expected:[],expected_staff:plan.expectedStaff,gms:['A','B'],gm_roles:{A:'staff',B:'staff'}})
    expect(mocks.get).not.toHaveBeenCalled();expect(mocks.patch).not.toHaveBeenCalled();expect(mocks.recalculate).not.toHaveBeenCalled()
  })
  it('全員解除も空のentriesと取得時のexpectedを送る', async () => {
    await reservationApi.syncStaffReservations('event', [], {},undefined,{entries:[],expected:plan.entries,expectedStaff:plan.expectedStaff})
    expect(mocks.post).toHaveBeenCalledWith(expect.any(String),{schedule_event_id:'event',entries:[],expected:plan.entries,expected_staff:plan.expectedStaff,gms:[],gm_roles:{}})
  })
  it('競合や定員超過を保存画面へ返し、個別追加を再試行しない', async () => {
    mocks.post.mockRejectedValue(new Error('定員超過'))
    await expect(reservationApi.syncStaffReservations('event', ['A'], {A:'staff'},undefined,plan)).rejects.toThrow('定員超過')
    expect(mocks.post).toHaveBeenCalledTimes(1);expect(mocks.patch).not.toHaveBeenCalled()
  })
  it('参加方法が未取得のまま保存しない',async()=>{
    await expect(reservationApi.syncStaffReservations('event',[],{})).rejects.toThrow('開き直して')
    expect(mocks.post).not.toHaveBeenCalled()
  })
})

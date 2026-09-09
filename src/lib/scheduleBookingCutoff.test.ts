import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ role: 'admin', found: true, update: vi.fn(), eq: vi.fn() }))
vi.mock('../../api/_lib/db.js', () => {
 const chain = { update: (value: unknown) => { state.update(value); return chain }, select: () => chain, eq: (key: string, value: unknown) => { state.eq(key, value); return chain }, maybeSingle: async () => ({ data: state.found ? { id: 'event' } : null, error: null }) }
 return { db: { from: () => chain }, getMissingEnvError: () => null }
})
vi.mock('../../api/_lib/auth.js', () => {
 class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
 return { ApiError, requireAuth: async () => ({ orgId: 'trusted-org', role: state.role }), requireStaff: () => {}, requireAdmin: () => { if (state.role !== 'admin') throw new ApiError(403, '管理者権限が必要です') } }
})
import handler from '../../api/schedule'
async function request(minutes: unknown, action = 'booking-cutoff') {
 const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() }
 res.status.mockReturnValue(res)
 await handler({ method: 'PATCH', headers: {}, query: { action, id: 'event' }, body: { minutes, expected_updated_at: '2026-09-08T00:00:00+09:00', organization_id: 'untrusted' } } as never, res as never)
 return res
}
describe('公演別予約締切API', () => {
 beforeEach(() => { state.role = 'admin'; state.found = true; vi.clearAllMocks() })
 it('認証組織とrevisionに限定して保存する', async () => {
  const res = await request(30)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(state.eq).toHaveBeenCalledWith('organization_id', 'trusted-org')
  expect(state.eq).toHaveBeenCalledWith('updated_at', '2026-09-08T00:00:00+09:00')
  expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ booking_cutoff_minutes: 30 }))
 })
 it('シナリオ設定も認証組織内で保存する', async () => { expect((await request(30, 'scenario-booking-cutoff')).status).toHaveBeenCalledWith(200); expect(state.eq).toHaveBeenCalledWith('scenario_master_id', 'event'); expect(state.eq).toHaveBeenCalledWith('organization_id', 'trusted-org') })
 it('シナリオ設定もスタッフの変更を拒否する', async () => { state.role = 'staff'; expect((await request(30, 'scenario-booking-cutoff')).status).toHaveBeenCalledWith(403) })
 it('標準復帰のnullを保存する', async () => { expect((await request(null)).status).toHaveBeenCalledWith(200); expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ booking_cutoff_minutes: null })) })
 it.each([-1, 1441, 1.5, '30', undefined])('不正値%jを拒否する', async value => { expect((await request(value)).status).toHaveBeenCalledWith(400); expect(state.update).not.toHaveBeenCalled() })
 it('スタッフは変更できない', async () => { state.role = 'staff'; expect((await request(30)).status).toHaveBeenCalledWith(403); expect(state.update).not.toHaveBeenCalled() })
 it('他組織または競合時に保存成功にしない', async () => { state.found = false; expect((await request(30)).status).toHaveBeenCalledWith(409) })
})

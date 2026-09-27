import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./_lib/auth.js', () => ({ requireAuth: async () => ({ orgId: 'verified-org', userId: 'user', role: 'staff' }), requireStaff: () => {}, requireAdmin: () => {}, ApiError: class extends Error {} }))
vi.mock('./_lib/db.js', () => ({ getMissingEnvError: () => null, db: { rpc: mock.rpc } }))
import handler from './customers'
async function request(query: Record<string, string>) {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }
  await handler({ method: 'GET', query: { action: 'listWithStats', ...query }, headers: {} } as any, res)
  return res
}
beforeEach(() => mock.rpc.mockReset().mockResolvedValue({ data: { customers: [], totalCount: 71 }, error: null }))
it('passes validated global filters with the authenticated tenant and preserves empty-page count', async () => {
  const r = await request({ organization_id: 'forged', page: '8', pageSize: '10', sortBy: 'reservation_amount', sortDir: 'asc', minAmount: '0', hasCoupons: 'false', visitFrom: '2026-09-01', visitTo: '2026-09-27' })
  expect(r.status).toHaveBeenCalledWith(200)
  expect(r.json).toHaveBeenCalledWith({ customers: [], totalCount: 71 })
  expect(mock.rpc).toHaveBeenCalledWith('search_org_customers', expect.objectContaining({ p_org_id: 'verified-org', p_offset: 70, p_sort_by: 'reservation_amount', p_sort_dir: 'asc', p_min_amount: 0, p_has_coupons: false, p_visit_from: '2026-09-01', p_visit_to: '2026-09-27' }))
})
it.each([{sortBy:'id;drop table customers'},{sortDir:'up'},{minReservations:'-1'},{minVisits:'1.5'},{minAmount:'9007199254740992'},{visitFrom:'2026-02-30'},{visitFrom:'2026-10-01',visitTo:'2026-09-01'},{hasCoupons:'maybe'}])('rejects malformed conditions before querying: %j', async query => {
  expect((await request(query)).status).toHaveBeenCalledWith(400)
  expect(mock.rpc).not.toHaveBeenCalled()
})
it('returns an error instead of an empty successful list on database failure', async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { message: 'fixture error' } })
  expect((await request({})).status).toHaveBeenCalledWith(500)
})

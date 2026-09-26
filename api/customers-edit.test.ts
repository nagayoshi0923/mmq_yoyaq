import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ role: 'staff', data: { id: 'customer' } as object | null, error: null as object | null, calls: [] as unknown[][], serviceWrite: vi.fn() }))
vi.mock('./_lib/auth.js', () => ({
 requireAuth: async () => ({ orgId: 'verified-org', userId: 'verified-user', jwt: 'verified-jwt', role: mock.role }),
 requireStaff: () => {}, requireAdmin: () => {}, ApiError: class extends Error {},
 createUserScopedClient: (jwt: string) => {
  mock.calls.push(['jwt', jwt]); const q: any = {}
  for (const m of ['from', 'update', 'eq', 'or', 'select']) q[m] = (...args: unknown[]) => { mock.calls.push([m, ...args]); return q }
  q.maybeSingle = async () => ({ data: mock.data, error: mock.error })
  return q
 },
}))
vi.mock('./_lib/db.js', () => ({ getMissingEnvError: () => null, db: { from: mock.serviceWrite } }))
import handler from './customers'
async function request(updates: Record<string, unknown> = { name: 'fixture' }) {
 const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }
 await handler({ method: 'PATCH', query: { id: 'customer', organization_id: 'forged' }, headers: {}, body: { updates } } as any, res)
 return res
}
beforeEach(() => { mock.role='staff'; mock.data={ id: 'customer' }; mock.error=null; mock.calls=[]; mock.serviceWrite.mockClear() })
it('writes with the verified JWT and scopes ordinary staff without service-role bypass', async () => {
 const res = await request()
 expect(res.status).toHaveBeenCalledWith(200)
 expect(mock.calls).toContainEqual(['jwt', 'verified-jwt'])
 expect(mock.calls).toContainEqual(['eq', 'id', 'customer'])
 expect(mock.calls).toContainEqual(['or', 'organization_id.eq.verified-org,organization_id.is.null,user_id.eq.verified-user'])
 expect(mock.serviceWrite).not.toHaveBeenCalled()
})
it('does not report an RLS-filtered or missing row as saved', async () => {
 mock.data=null; expect((await request()).status).toHaveBeenCalledWith(404)
})
it('reports database failures without claiming success', async () => {
 mock.error={ message: 'fixture failure' }; expect((await request()).status).toHaveBeenCalledWith(500)
})
it('does not allow ownership or identity reassignment', async () => {
 await request({ name: 'fixture', organization_id: 'forged', user_id: 'forged', email_verified: true })
 const update = mock.calls.find(c => c[0] === 'update')?.[1] as Record<string, unknown>
 expect(update.organization_id).toBeUndefined(); expect(update.user_id).toBeUndefined()
 expect(update.updated_at).toEqual(expect.any(String))
})
it('retains the existing license-admin RLS policy', async () => {
 mock.role='license_admin'; expect((await request()).status).toHaveBeenCalledWith(200)
 expect(mock.calls.some(c => c[0] === 'or')).toBe(false)
 expect(mock.calls).toContainEqual(['jwt', 'verified-jwt'])
})

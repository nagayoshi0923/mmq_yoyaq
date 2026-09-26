import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ role: 'admin', owner: 'own' as string | null, found: true, failed: false, writes: 0, filters: [] as unknown[][] }))
vi.mock('./_lib/auth.js', () => {
 class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
 return {
  ApiError,
  requireAuth: async () => ({ role: mock.role, orgId: 'own' }),
  requireStaff: () => {},
  requireAdmin: (user: { role: string }) => { if (!['admin', 'license_admin'].includes(user.role)) throw new ApiError(403, 'admin required') },
 }
})
vi.mock('./_lib/db.js', () => ({ getMissingEnvError: () => null, db: { from: () => {
 const q: any = {
  delete: () => { mock.writes++; return q },
  eq: (...args: unknown[]) => { mock.filters.push(args); return q },
  select: () => q,
  maybeSingle: async () => ({ data: mock.found && mock.owner === 'own' ? { id: 'customer' } : null, error: mock.failed ? { message: 'fixture' } : null }),
 }
 return q
} } }))
import handler from './customers'
async function request() {
 const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }
 await handler({ method: 'DELETE', query: { id: 'customer', organization_id: 'forged' }, headers: {} } as any, res)
 return res
}
beforeEach(() => { mock.role='admin'; mock.owner='own'; mock.found=true; mock.failed=false; mock.writes=0; mock.filters=[] })
it('refuses staff before issuing a delete', async () => {
 mock.role='staff'; expect((await request()).status).toHaveBeenCalledWith(403); expect(mock.writes).toBe(0)
})
it.each(['other', null])('does not delete customer owned by %s even with reservation contact', async owner => {
 mock.owner=owner; expect((await request()).status).toHaveBeenCalledWith(404)
 expect(mock.filters).toContainEqual(['organization_id','own'])
})
it.each(['admin','license_admin'])('%s deletes only within the verified organization', async role => {
 mock.role=role; expect((await request()).status).toHaveBeenCalledWith(200)
 expect(mock.filters).toEqual([['id','customer'],['organization_id','own']])
})
it('does not report missing or failed deletes as success', async () => {
 mock.found=false; expect((await request()).status).toHaveBeenCalledWith(404)
 mock.failed=true; expect((await request()).status).toHaveBeenCalledWith(500)
})

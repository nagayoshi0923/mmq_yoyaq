import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ calls: [] as unknown[][], error: null as null | { message: string } }))
vi.mock('./_lib/auth.js', () => ({
  requireAuth: async () => ({ orgId: 'verified-org' }), requireStaff: () => {}, ApiError: class extends Error {},
}))
vi.mock('./_lib/db.js', () => ({ getMissingEnvError: () => null, db: {
  rpc: (name: string, args: unknown) => {
    mock.calls.push(['rpc', name, args])
    const q: any = {}
    for (const method of ['select', 'eq']) q[method] = (...values: unknown[]) => { mock.calls.push([method, ...values]); return q }
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: 'contact', organization_id: 'other-org' }], error: mock.error }).then(resolve)
    return q
  },
  from: (name: string) => {
    mock.calls.push(['from', name])
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: 'contact', organization_id: 'other-org' } }) }
    return q
  },
} }))
import handler from './customers'
async function request(query: Record<string, string>, method = 'GET') {
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }
  await handler({ method, query, headers: {}, body: { name: 'changed' } } as any, res)
  return res
}
beforeEach(() => { mock.calls = []; mock.error = null })
it.each([['findByEmail', 'email'], ['findByPhone', 'phone']])('%s uses the verified organization contact scope', async (action, field) => {
  const res = await request({ action, [field]: 'fixture', organization_id: 'forged-org' })
  expect(res.status).toHaveBeenCalledWith(200)
  expect(mock.calls).toContainEqual(['rpc', 'get_org_customers', { p_org_id: 'verified-org' }])
  expect(mock.calls).toContainEqual(['eq', field, 'fixture'])
  expect(mock.calls.some(c => c[0] === 'from')).toBe(false)
})
it('does not hide contact lookup errors as missing customers', async () => {
  mock.error = { message: 'fixture failure' }
  expect((await request({ action: 'findByEmail', email: 'fixture' })).status).toHaveBeenCalledWith(500)
})
it.each(['PATCH', 'DELETE'])('%s does not acquire cross-organization mutation permission from read access', async method => {
  expect((await request({ id: 'contact' }, method)).status).toHaveBeenCalledWith(404)
  expect(mock.calls.some(c => c[0] === 'rpc')).toBe(false)
})

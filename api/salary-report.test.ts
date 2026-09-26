import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mock = vi.hoisted(() => ({ from: vi.fn(), auth: vi.fn() }))
vi.mock('./_lib/db.js', () => ({ db: { from: mock.from }, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./_lib/auth.js')>(), requireAuth: mock.auth,
}))
import handler from './sales'
import { ApiError } from './_lib/auth'

function query() {
  const chain: Record<string, any> = {}
  for (const name of ['select', 'eq', 'gte', 'lte', 'gt', 'order', 'limit', 'range']) chain[name] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
  return chain
}
async function request(type: string, extra: Record<string, string> = {}) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }
  await handler({ method: 'GET', headers: {}, query: { type, start: '2020-01-01', end: '2020-01-31', ...extra } } as unknown as VercelRequest, res as unknown as VercelResponse)
  return res
}
beforeEach(() => {
  vi.clearAllMocks()
  mock.auth.mockResolvedValue({ orgId: 'jwt-org', role: 'admin' })
  mock.from.mockImplementation(query)
})
describe('給与計算用APIの組織境界', () => {
  for (const type of ['salary-history', 'salary-inputs', 'sales-cost-inputs']) {
    it(`${type}: クライアント指定組織を無視して認証組織だけで取得する`, async () => {
      const chains: ReturnType<typeof query>[] = []
      mock.from.mockImplementation(() => { const q = query(); chains.push(q); return q })
      const res = await request(type, { organization_id: 'other-org' })
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'jwt-org' }))
      expect(chains.length).toBeGreaterThan(0)
      for (const q of chains) expect(q.eq).toHaveBeenCalledWith('organization_id', 'jwt-org')
    })
    it(`${type}: 顧客権限と組織不明を拒否する`, async () => {
      mock.auth.mockResolvedValue({ orgId: 'jwt-org', role: 'customer' })
      expect((await request(type)).status).toHaveBeenCalledWith(403)
      mock.auth.mockResolvedValue({ orgId: '', role: 'staff' })
      expect((await request(type)).status).toHaveBeenCalledWith(403)
      expect(mock.from).not.toHaveBeenCalled()
    })
  }
  it('未認証と不正期間はDBにアクセスしない', async () => {
    mock.auth.mockRejectedValueOnce(new ApiError(401, '認証が必要です'))
    expect((await request('salary-history')).status).toHaveBeenCalledWith(401)
    expect((await request('salary-history', { start: '2020-02-31' })).status).toHaveBeenCalledWith(400)
    expect((await request('salary-history', { start: '2020-02-01' })).status).toHaveBeenCalledWith(400)
    expect(mock.from).not.toHaveBeenCalled()
  })
})

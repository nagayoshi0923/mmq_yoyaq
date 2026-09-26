import { beforeEach, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mock = vi.hoisted(() => ({ role: 'staff', read: vi.fn() }))
vi.mock('./_lib/db.js', () => ({ db: {}, getMissingEnvError: () => null }))
vi.mock('./_lib/gmResponses.js', () => ({ readGmResponses: mock.read }))
vi.mock('./_lib/auth.js', () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
  return {
    ApiError,
    requireAuth: async () => ({ userId: 'verified-user', orgId: 'verified-org', role: mock.role }),
    requireStaff: (user: { role: string }) => { if (user.role === 'customer') throw new ApiError(403, 'staff only') },
    createUserScopedClient: vi.fn(),
  }
})
import handler from './reservations'
beforeEach(() => { vi.clearAllMocks(); mock.role = 'staff'; mock.read.mockResolvedValue({responses:[]}) })
async function read() {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res)
  await handler({ method:'GET', headers:{}, query:{type:'gm-responses',mine:'true',user_id:'forged',organization_id:'forged'} } as unknown as VercelRequest,res as unknown as VercelResponse)
  return res
}
it('顧客はGM回答読取へ到達しない', async () => {
  mock.role = 'customer'; const res = await read()
  expect(res.status).toHaveBeenCalledWith(403); expect(mock.read).not.toHaveBeenCalled()
})
it('スタッフの本人と組織は検証済み認証情報を渡す', async () => {
  const res = await read()
  expect(res.status).toHaveBeenCalledWith(200)
  expect(mock.read.mock.calls[0][1]).toMatchObject({userId:'verified-user',orgId:'verified-org'})
})

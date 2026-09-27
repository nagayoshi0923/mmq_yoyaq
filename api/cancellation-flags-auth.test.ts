import { beforeEach, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mock = vi.hoisted(() => ({ role: 'customer', from: vi.fn(), rpc: vi.fn() }))
vi.mock('./_lib/db.js', () => ({ db: { from: mock.from }, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
  return {
    ApiError,
    requireAuth: async () => ({ userId: 'user', orgId: 'org', role: mock.role }),
    requireStaff: (user: { role: string }) => { if (user.role === 'customer') throw new ApiError(403, 'staff only') },
    createUserScopedClient: () => ({ rpc: mock.rpc }),
  }
})
import handler from './reservations'
beforeEach(() => {
  vi.clearAllMocks(); mock.role = 'customer'
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); mock.from.mockReturnValue(query)
})
async function cancel(body: Record<string, unknown>, action = 'cancel') {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res)
  await handler({ method: 'PATCH', headers: {}, query: { action, id: 'reservation' }, body } as unknown as VercelRequest, res as unknown as VercelResponse)
  return res
}
it.each([{ skip_group_cancel: true }, { cancel_private_event: true }, { skip_group_cancel: true, cancel_private_event: true }])('顧客の店舗専用取消フラグを予約取得・変更前に拒否する %j', async body => {
  const res = await cancel(body)
  expect(res.status).toHaveBeenCalledWith(403); expect(mock.from).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled()
})
it.each(['staff', 'admin', 'license_admin'])('既存の%s取消フローは予約確認へ進む', async role => {
  mock.role = role; const res = await cancel({ skip_group_cancel: true, cancel_private_event: true })
  expect(res.status).toHaveBeenCalledWith(404); expect(mock.from).toHaveBeenCalledWith('reservations')
})
it('顧客の通常取消は既存の予約確認へ進む', async () => {
  const res = await cancel({ skip_group_cancel: false, cancel_private_event: false })
  expect(res.status).toHaveBeenCalledWith(404); expect(mock.from).toHaveBeenCalledWith('reservations')
})

it('顧客の予約だけ取消入口は取得・変更前に拒否する', async () => {
  const res = await cancel({}, 'cancel-with-lock')
  expect(res.status).toHaveBeenCalledWith(403); expect(mock.from).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled()
})
it.each(['staff', 'admin', 'license_admin'])('予約だけ取消の%s入口は従来の予約確認へ進む', async role => {
  mock.role = role; const res = await cancel({}, 'cancel-with-lock')
  expect(res.status).toHaveBeenCalledWith(404); expect(mock.from).toHaveBeenCalledWith('reservations')
})

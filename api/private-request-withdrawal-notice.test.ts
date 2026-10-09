// お客様が申込中の貸切リクエストを取り下げたとき、打診先GM・共有チャンネル向けの通知を積む（失敗してもキャンセルは成功）。
import { beforeEach, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mock = vi.hoisted(() => ({
  from: vi.fn(), userRpc: vi.fn(), dbRpc: vi.fn(), billing: vi.fn(),
  user: { userId: 'user', orgId: '', role: 'customer', jwt: 'fixture' },
  row: {} as Record<string, unknown>,
}))
vi.mock('./_lib/db.js', () => ({ db: { from: mock.from, rpc: mock.dbRpc }, getMissingEnvError: () => null }))
vi.mock('./_lib/cancellation-payments/intake.js', () => ({ recordCancellationIntake: mock.billing }))
vi.mock('./_lib/customerCancellation.js', () => ({ assertCustomerSelfCancelAllowed: async () => ({ ok: true }) }))
vi.mock('./_lib/auth.js', () => ({
  ApiError: class extends Error {}, requireAuth: async () => mock.user,
  requireStaff: vi.fn(), createUserScopedClient: () => ({ rpc: mock.userRpc }),
}))
import handler from './reservations'

const pendingRequest = { id: 'reservation', organization_id: 'org', customer_id: 'customer', private_group_id: 'group',
  reservation_source: 'web_private', payment_method: 'card', schedule_event_id: null, status: 'pending_gm' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mock.user = { userId: 'user', orgId: '', role: 'customer', jwt: 'fixture' }
  mock.row = { ...pendingRequest }
  mock.userRpc.mockResolvedValue({ data: true, error: null })
  mock.dbRpc.mockResolvedValue({ data: null, error: null })
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: mock.row, error: null })) }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); mock.from.mockReturnValue(query)
})
async function withdraw() {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res)
  await handler({ method: 'PATCH', headers: {}, query: { action: 'cancel-with-group-lock', id: 'reservation' },
    body: { cancellation_reason: 'お客様による貸切申込の取り下げ' } } as unknown as VercelRequest, res as unknown as VercelResponse)
  return res
}

it.each(['pending', 'pending_gm', 'gm_confirmed', 'pending_store'])('お客様が申込中（%s）を取り下げると通知を積む', async status => {
  mock.row = { ...pendingRequest, status }
  const res = await withdraw()
  expect(res.status).toHaveBeenCalledWith(200)
  expect(mock.dbRpc).toHaveBeenCalledExactlyOnceWith('enqueue_private_request_withdrawal', { p_reservation_id: 'reservation' })
})

it('通知の登録に失敗してもキャンセルは成功として返す', async () => {
  mock.dbRpc.mockResolvedValue({ data: null, error: { message: 'fixture' } })
  const failed = await withdraw()
  mock.dbRpc.mockRejectedValue(new Error('network'))
  const thrown = await withdraw()
  for (const res of [failed, thrown]) {
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
  }
  expect(console.error).toHaveBeenCalled()
})

it.each([
  ['スタッフの操作', { role: 'staff', orgId: 'org' }, {}],
  ['公演確定後', {}, { schedule_event_id: 'event' }],
  ['確定済みの状態', {}, { status: 'confirmed' }],
  ['貸切以外', {}, { private_group_id: null, reservation_source: 'web' }],
])('%sでは取り下げ通知を積まない', async (_label, user, row) => {
  mock.user = { ...mock.user, ...user }
  mock.row = { ...pendingRequest, ...row }
  const res = await withdraw()
  expect(res.status).toHaveBeenCalledWith(200)
  expect(mock.dbRpc).not.toHaveBeenCalled()
})

it('キャンセル自体が失敗したら通知を積まない', async () => {
  mock.userRpc.mockResolvedValue({ data: null, error: { code: '55P03', message: 'fixture' } })
  const res = await withdraw()
  expect(res.status).toHaveBeenCalledWith(409)
  expect(mock.dbRpc).not.toHaveBeenCalled()
})

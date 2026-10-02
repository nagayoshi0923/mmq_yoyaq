import { beforeEach, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mock = vi.hoisted(() => ({
  user: { userId: 'owner', role: 'customer', orgId: '', jwt: 'fixture-jwt' },
  from: vi.fn(), rpc: vi.fn(), scopes: [] as Array<[string, unknown]>,
  reservation: { organization_id: 'event-org', customer_id: 'customer' } as Record<string, unknown> | null,
  customer: { id: 'customer', user_id: 'owner', organization_id: null } as Record<string, unknown> | null,
  readError: null as { message: string } | null,
  staff: [] as Array<{ id: string }>, staffError: null as { message: string } | null,
}))
vi.mock('./_lib/db.js', () => ({ db: { from: mock.from }, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
  return { ApiError, requireAuth: async () => mock.user, requireStaff: vi.fn(), createUserScopedClient: () => ({ rpc: mock.rpc }) }
})
import handler from './reservations'
beforeEach(() => {
  vi.clearAllMocks(); mock.scopes = []
  mock.user = { userId: 'owner', role: 'customer', orgId: '', jwt: 'fixture-jwt' }
  mock.reservation = { organization_id: 'event-org', customer_id: 'customer' }
  mock.customer = { id: 'customer', user_id: 'owner', organization_id: null }
  mock.readError = null; mock.staffError = null; mock.staff = []
  mock.rpc.mockResolvedValue({ data: true, error: null })
  mock.from.mockImplementation((table: string) => {
    const q = {
      select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), limit: vi.fn(), single: vi.fn(),
    }
    q.select.mockReturnValue(q)
    q.eq.mockImplementation((key: string, value: unknown) => { mock.scopes.push([key, value]); return q })
    q.maybeSingle.mockImplementation(async () => ({
      data: table === 'customers' ? mock.customer : table === 'schedule_events' ? { id: 'event', organization_id: 'event-org' } : mock.reservation,
      error: mock.readError,
    }))
    q.limit.mockResolvedValue({ data: mock.staff, error: mock.staffError })
    q.single.mockResolvedValue({ data: { id: 'saved', organization_id: 'event-org' }, error: null })
    return q
  })
})
async function request(body: Record<string, unknown> = { new_count: 1, customer_id: 'customer' }, create = false) {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res)
  await handler({ method: create ? 'POST' : 'PATCH', headers: {}, query: { id: 'reservation', action: create ? 'create' : 'update-participants-with-lock' }, body } as unknown as VercelRequest, res as unknown as VercelResponse)
  return res
}
it.each(['', 'legacy-other-org'])('本人は顧客の所属%sに依存せず人数変更できる', async orgId => {
  mock.user.orgId = orgId
  const res = await request()
  expect(res.status).toHaveBeenCalledWith(200)
  expect(mock.rpc).toHaveBeenCalledWith('update_reservation_participants', { p_reservation_id: 'reservation', p_new_count: 1, p_customer_id: 'customer' })
})
it('旧clientがcustomer_idを省略しても本人で判断する', async () => {
  const res = await request({ new_count: 1 })
  expect(res.status).toHaveBeenCalledWith(200)
  expect(mock.rpc.mock.calls[0][1].p_customer_id).toBeNull()
})
it('同じ顧客IDを渡しても別利用者はRPC前に拒否する', async () => {
  mock.user.userId = 'other'
  const res = await request()
  expect(res.status).toHaveBeenCalledWith(403); expect(mock.rpc).not.toHaveBeenCalled()
})
it('誤ったcustomer_idは本人でも拒否する', async () => {
  const res = await request({ new_count: 1, customer_id: 'wrong' })
  expect(res.status).toHaveBeenCalledWith(403); expect(mock.rpc).not.toHaveBeenCalled()
})
it('ゲスト行のIDを知っていても本人にならない', async () => {
  mock.customer!.user_id = null
  const res = await request()
  expect(res.status).toHaveBeenCalledWith(403); expect(mock.rpc).not.toHaveBeenCalled()
})
it.each(['admin', 'staff', 'license_admin'])('同組織%sの正当業務を維持する', async role => {
  mock.user = { ...mock.user, userId: 'operator', orgId: 'event-org', role }; mock.staff = [{ id: 'staff' }]
  const res = await request()
  expect(res.status).toHaveBeenCalledWith(200); expect(mock.rpc).toHaveBeenCalledOnce()
})
it.each(['admin', 'staff', 'license_admin'])('別組織%sは本人以外を操作できない', async role => {
  mock.user = { ...mock.user, userId: 'operator', orgId: 'other-org', role }; mock.staff = [{ id: 'staff' }]
  const res = await request()
  expect(res.status).toHaveBeenCalledWith(403); expect(mock.rpc).not.toHaveBeenCalled()
})
it('停止者がrequireAuthで顧客に降格した場合は他人を操作できない', async () => {
  mock.user.userId = 'former-staff'
  const res = await request()
  expect(res.status).toHaveBeenCalledWith(403); expect(mock.rpc).not.toHaveBeenCalled()
})
it('ライセンス権限だけでは店舗の予約操作を許可しない', async () => {
  mock.user = { ...mock.user, userId: 'license', orgId: 'event-org', role: 'license_admin' }
  const res = await request()
  expect(res.status).toHaveBeenCalledWith(403); expect(mock.rpc).not.toHaveBeenCalled()
})
it('確認用読取の失敗は許可へ変換しない', async () => {
  mock.readError = { message: 'fixture error' }
  const res = await request()
  expect(res.status).toHaveBeenCalledWith(503); expect(mock.rpc).not.toHaveBeenCalled()
})
it('スタッフ状態の取得失敗は許可へ変換しない', async () => {
  mock.user = { ...mock.user, userId: 'staff', orgId: 'event-org', role: 'staff' }; mock.staffError = { message: 'fixture error' }
  const res = await request()
  expect(res.status).toHaveBeenCalledWith(503); expect(mock.rpc).not.toHaveBeenCalled()
})
it('APIで本人と判定後もDB拒否を403として返す', async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { code: 'P0011', message: 'UNAUTHORIZED' } })
  const res = await request()
  expect(res.status).toHaveBeenCalledWith(403); expect(res.json).toHaveBeenCalledWith({ error: 'この予約を操作する権限がありません', code: 'P0011' })
})
const createBody = { schedule_event_id: 'event', customer_id: 'customer', participant_count: 1, reservation_number: 'known-number' }
it('別組織管理者の代理作成はRPC前に拒否する', async () => {
  mock.user = { ...mock.user, userId: 'admin', orgId: 'other-org', role: 'admin' }
  const res = await request(createBody, true)
  expect(res.status).toHaveBeenCalledWith(403); expect(mock.rpc).not.toHaveBeenCalled()
})
it('同組織管理者の代理作成はDB本人確認付き経路へ進む', async () => {
  mock.user = { ...mock.user, userId: 'admin', orgId: 'event-org', role: 'admin' }
  mock.rpc.mockResolvedValue({ data: null, error: { code: 'P0003' } })
  const res = await request(createBody, true)
  expect(res.status).toHaveBeenCalledWith(400); expect(mock.rpc.mock.calls[0][0]).toBe('create_reservation_with_lock_v2')
})
it('旧org付き顧客本人は予約作成RPCへ進む', async () => {
  mock.customer!.organization_id = 'legacy-other-org'
  mock.rpc.mockResolvedValue({ data: null, error: { code: 'P0003' } })
  const res = await request(createBody, true)
  expect(res.status).toHaveBeenCalledWith(400); expect(mock.rpc).toHaveBeenCalledOnce()
})
it('番号重複後の読戻しを組織・本人顧客・公演・人数に限定する', async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { code: '23505' } }); mock.reservation = null
  const res = await request(createBody, true)
  expect(mock.scopes).toEqual(expect.arrayContaining([
    ['reservation_number', 'known-number'], ['organization_id', 'event-org'], ['customer_id', 'customer'], ['schedule_event_id', 'event'], ['participant_count', 1],
  ]))
  expect(res.status).toHaveBeenCalledWith(500)
})

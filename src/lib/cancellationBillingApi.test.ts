import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), rpc: vi.fn() }))
vi.mock('../../api/_lib/db.js', () => ({ db: { from: mocks.from, rpc: mocks.rpc } }))
vi.mock('../../api/_lib/auth.js', () => ({
  requireAuth: mocks.auth,
  ApiError: class extends Error { constructor(public status: number, message: string) { super(message) } },
}))
import handler from '../../api/cancellation-billing'

function response() {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }
  res.status.mockReturnValue(res)
  return res
}
function request(body: unknown, action = 'intake', method = 'POST') {
  return { method, headers: {}, query: { action }, body } as unknown as VercelRequest
}
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ userId: 'user', orgId: 'org-A', role: 'admin' }) })

describe('キャンセル料金APIの境界', () => {
  it('一般顧客・スタッフ・他レーンの管理者は台帳へアクセスしない', async () => {
    for (const role of ['customer', 'staff', 'license_admin']) {
      mocks.auth.mockResolvedValue({ userId: 'user', orgId: 'org-A', role })
      const res = response()
      await handler(request({}, '', 'GET'), res as unknown as VercelResponse)
      expect(res.status).toHaveBeenLastCalledWith(403)
    }
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('組織はリクエストから取得せず、認証ユーザーの組織で予約を絞る', async () => {
    const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q); mocks.from.mockReturnValue(q)
    const res = response()
    await handler(request({ organizationId: 'org-B', reservationId: '10000000-0000-4000-8000-000000000001',
      receivedAt: null, receiptEvidence: '電話受付', cause: 'customer', payerName: '', revision: 0, apply: true }), res as unknown as VercelResponse)
    expect(q.eq).toHaveBeenCalledWith('organization_id', 'org-A')
    expect(q.eq).not.toHaveBeenCalledWith('organization_id', 'org-B')
    expect(res.status).toHaveBeenLastCalledWith(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('不正な入力から書き込みを行わない', async () => {
    const res = response()
    await handler(request({ reservationId: 'bad', amount: -100, cause: 'transport_confirmed' }), res as unknown as VercelResponse)
    expect(res.status).toHaveBeenLastCalledWith(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('自動実行の認証なしでは読み取りも行わない', async () => {
    const res = response()
    await handler(request({}, 'run'), res as unknown as VercelResponse)
    expect(res.status).toHaveBeenLastCalledWith(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})


it('会社メールの料金案内は元メールの返信待ちとして返し、MMQ配信を呼ばない', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  mocks.from.mockImplementation((table: string) => {
    const data = table === 'cancellation_billing_settings' ? { revision: 1, data: {
      accounts: [{ id: 'account1', bankName: '銀行', branchName: '支店', accountType: '普通', accountNumber: '1234567', accountHolder: 'テスト', freeeCompanyId: 1, freeeWalletableId: 2 }],
      activeAccountId: 'account1', operatorEmail: 'operator@example.test', notificationsEnabled: true,
    } } : table === 'cancellation_billing_claims' ? [{ id: 'claim1', reservation_id: 'reservation1', revision: 1,
      data: { assessment: { status: 'payable', amount: 3000, reason: '料金' }, amount: 3000, contact: { channel: 'company_email', messageId: 'abc', threadId: 'thread1' }, notifiedAt: null } }] : table === 'cancellation_billing_reconciliations' ? null : []
    const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), maybeSingle: vi.fn(), limit: vi.fn() }
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.order.mockReturnValue(q)
    q.maybeSingle.mockResolvedValue({ data, error: null }); q.limit.mockResolvedValue({ data, error: null })
    return q
  })
  const res = response()
  await handler(request({ apply: true }, 'notices'), res as unknown as VercelResponse)
  expect(res.status).toHaveBeenLastCalledWith(200)
  expect(res.json.mock.calls[0][0]).toMatchObject({ sent: [], companyReplies: [{ deliveryChannel: 'company_email', contact: { messageId: 'abc' } }] })
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(mocks.rpc).not.toHaveBeenCalled()
  fetchSpy.mockRestore()
})

import { beforeEach, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), billing: vi.fn() }))
vi.mock('./_lib/db.js', () => ({ db: { from: mock.from }, getMissingEnvError: () => null }))
vi.mock('./_lib/cancellation-payments/intake.js', () => ({ recordCancellationIntake: mock.billing }))
vi.mock('./_lib/auth.js', () => ({
  ApiError: class extends Error {}, requireAuth: async () => ({ userId: 'user', orgId: 'org', role: 'staff', jwt: 'fixture' }),
  requireStaff: vi.fn(), createUserScopedClient: () => ({ rpc: mock.rpc }),
}))
import handler from './reservations'
beforeEach(() => {
  vi.clearAllMocks(); mock.rpc.mockResolvedValue({ data: true, error: null })
  const row = { id: 'reservation', organization_id: 'org', customer_id: 'customer', private_group_id: 'group', payment_method: 'staff', schedule_event_id: null, status: 'confirmed' }
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }), single: vi.fn().mockResolvedValue({data:{...row,status:'cancelled'},error:null}) }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); mock.from.mockReturnValue(query)
})
async function cancel(action: string) {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res)
  await handler({ method: 'PATCH', headers: {}, query: { action, id: 'reservation' }, body: { cancellation_reason: 'reason' } } as unknown as VercelRequest, res as unknown as VercelResponse)
  return res
}
it.each(['cancel','cancel-with-group-lock'])('%s は原子的な通知RPCを使い、生の通知保存をしない', async action => {
  const res=await cancel(action)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(mock.rpc).toHaveBeenCalledWith('cancel_reservation_and_group_with_notice',expect.objectContaining({p_reservation_id:'reservation',p_cancellation_reason:'reason'}))
  expect(mock.from).not.toHaveBeenCalledWith('private_group_messages')
})
it.each(['P0050','P0051','55P03'])('整合性/競合エラー%sでは保存されていないことを返す',async code=>{
  mock.rpc.mockResolvedValue({data:null,error:{code,message:'fixture'}})
  const res=await cancel('cancel')
  expect(res.status).toHaveBeenCalledWith(409);expect(mock.billing).not.toHaveBeenCalled();expect(mock.from).not.toHaveBeenCalledWith('private_group_messages')
})

it.each([['P0052',400,'キャンセル期限'],['P0053',409,'キャンセル規定']])('DBの顧客規定エラー%sを案内し料金保存をしない',async(code,status,message)=>{
 mock.rpc.mockResolvedValue({data:null,error:{code,message:'internal'}})
 const res=await cancel('cancel')
 expect(res.status).toHaveBeenCalledWith(status);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({error:expect.stringContaining(message)}));expect(mock.billing).not.toHaveBeenCalled()
})

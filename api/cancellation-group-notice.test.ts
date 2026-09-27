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
  const row = { id: 'reservation', organization_id: 'org', customer_id: 'customer', private_group_id: 'group', payment_method: 'card', schedule_event_id: null, status: 'confirmed' }
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }), single: vi.fn().mockResolvedValue({data:{...row,status:'cancelled'},error:null}) }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); mock.from.mockReturnValue(query)
})
async function cancel(action: string, body: Record<string, unknown> = {}) {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res)
  await handler({ method: 'PATCH', headers: {}, query: { action, id: 'reservation' }, body: { cancellation_reason: 'reason', ...body } } as unknown as VercelRequest, res as unknown as VercelResponse)
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

const rejection = { skip_group_cancel: true, cancel_private_event: true, private_rejection_body: '却下本文' }
it('貸切却下は新RPCへ一度渡し、旧同期や直接公演更新を行わない', async () => {
 const res = await cancel('cancel', rejection)
 expect(res.status).toHaveBeenCalledWith(200)
 expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('reject_private_booking_with_delivery', { p_reservation_id: 'reservation', p_message_body: '却下本文' })
 expect(mock.from).not.toHaveBeenCalledWith('schedule_events')
 expect(mock.from).not.toHaveBeenCalledWith('private_group_messages')
 expect(mock.billing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ organizerCancelled: true }))
})
it.each([{ data: false, error: null }, { data: null, error: { code: '55P03' } }, { data: null, error: { code: '42501' } }])('一括却下不成功では料金記録に進まない', async result => {
 mock.rpc.mockResolvedValue(result)
 const res = await cancel('cancel', rejection)
 expect(res.status).toHaveBeenCalledWith(result.error?.code === '42501' ? 403 : 409)
 expect(mock.billing).not.toHaveBeenCalled()
})
it.each([{ ...rejection, private_rejection_body: '' }, { ...rejection, cancel_private_event: false }, { ...rejection, private_rejection_body: 7 }])('不正な却下条件は予約取得前に拒否', async body => {
 const res = await cancel('cancel', body)
 expect(res.status).toHaveBeenCalledWith(400); expect(mock.from).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled()
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mock = vi.hoisted(() => ({ rpc: vi.fn(), role: 'customer' }))
vi.mock('./_lib/db.js', () => ({ db: { rpc: mock.rpc }, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', () => ({
  requireAuth: async () => ({ userId: 'verified-user', orgId: 'verified-org', role: mock.role }),
  requireStaff: () => { if (mock.role === 'customer') throw new Error('staff only') },
  requireAdmin: vi.fn(),
  ApiError: class extends Error {},
}))
import handler from './coupons'
function response() { const r={status:vi.fn(),json:vi.fn(),setHeader:vi.fn()};r.status.mockReturnValue(r);return r }
beforeEach(()=>{vi.clearAllMocks();mock.rpc.mockResolvedValue({data:{success:true,discount_amount:1000},error:null});mock.role='customer'})
describe('クーポン利用API',()=>{
  it.each(['use','preview-use'])('%s は検証済み本人IDのみを共通RPCへ渡す',async action=>{
    const r=response()
    await handler({method:'POST',headers:{},query:{action},body:{customer_coupon_id:'coupon',reservation_id:'reservation',p_user:'forged',discount_amount:99999}} as unknown as VercelRequest,r as unknown as VercelResponse)
    expect(mock.rpc).toHaveBeenCalledWith(action==='use'?'use_customer_coupon':'preview_customer_coupon',{p_user:'verified-user',p_coupon:'coupon',p_reservation:'reservation'})
    expect(r.status).toHaveBeenCalledWith(200)
  })
  it('予約なしでは使用せず、紐付けなしの再試行へ回避しない',async()=>{
    const r=response();await handler({method:'POST',headers:{},query:{action:'use'},body:{customer_coupon_id:'coupon'}} as unknown as VercelRequest,r as unknown as VercelResponse)
    expect(r.status).toHaveBeenCalledWith(400);expect(mock.rpc).not.toHaveBeenCalled()
  })
  it('DBが返す利用不可理由を画面へ返し消費を再試行しない',async()=>{
    mock.rpc.mockResolvedValue({data:null,error:{code:'P0028',message:'対象店舗ではありません'}})
    const r=response();await handler({method:'POST',headers:{},query:{action:'use'},body:{customer_coupon_id:'coupon',reservation_id:'reservation'}} as unknown as VercelRequest,r as unknown as VercelResponse)
    expect(r.status).toHaveBeenCalledWith(400);expect(r.json).toHaveBeenCalledWith({success:false,error:'対象店舗ではありません'});expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
})

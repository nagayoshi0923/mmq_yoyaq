import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), role: 'customer' }))
vi.mock('./_lib/db.js', () => ({ db: { rpc: mock.rpc, from: mock.from }, getMissingEnvError: () => null }))
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
  it('予約前確認は本人と人数だけを渡し、クライアント申告金額を使わない', async () => {
    const r = response()
    await handler({method:'POST',headers:{},query:{action:'preview-booking'},body:{customer_coupon_id:'coupon',event_id:'event',participant_count:2,p_user:'forged',total_price:1}} as unknown as VercelRequest,r as unknown as VercelResponse)
    expect(mock.rpc).toHaveBeenCalledWith('preview_booking_coupon',{p_user:'verified-user',p_coupon:'coupon',p_event:'event',p_participants:2})
  })
  it.each([0,-1,1.5,'2',null,101])('予約前確認の不正人数 %j を拒否する', async participant_count => {
    const r=response()
    await handler({method:'POST',headers:{},query:{action:'preview-booking'},body:{customer_coupon_id:'coupon',event_id:'event',participant_count}} as unknown as VercelRequest,r as unknown as VercelResponse)
    expect(r.status).toHaveBeenCalledWith(400);expect(mock.rpc).not.toHaveBeenCalled()
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


describe('クーポンの予約候補と期限', () => {
  function seed(rows: Record<string, unknown[]>) {
    mock.from.mockImplementation((table: string) => {
      const result = { data: rows[table] ?? [], error: null }
      const query: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'not', 'order', 'limit', 'or', 'gt']) {
        query[method] = vi.fn(() => query)
      }
      query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
      return query
    })
  }
  it('日付が先・当日の開始3時間以上前の確定予約も候補に返す', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T23:00:00Z')) // JST 26日8時
    try {
      seed({
        customers: [{ id: 'customer' }],
        reservations: [
          { id: 'future', schedule_event_id: 'e1' },
          { id: 'today', schedule_event_id: 'e2' },
          { id: 'past', schedule_event_id: 'e3' },
        ],
        schedule_events: [
          { id: 'e1', date: '2026-10-01', start_time: '19:00', organization_id: 'verified-org' },
          { id: 'e2', date: '2026-09-26', start_time: '19:00', organization_id: 'verified-org' },
          { id: 'e3', date: '2026-09-25', start_time: '19:00', organization_id: 'verified-org' },
        ],
      })
      const r = response()
      await handler({ method: 'GET', headers: {}, query: { type: 'current-reservations' } } as unknown as VercelRequest, r as unknown as VercelResponse)
      expect(r.status).toHaveBeenCalledWith(200)
      expect(r.json.mock.calls[0][0].map((row: {id:string}) => row.id)).toEqual(['today', 'future'])
    } finally { vi.useRealTimers() }
  })
  it('配布終了・配布停止後でも発行済みの使用期限内なら利用可能として返す', async () => {
    seed({ customers: [{ id: 'customer' }], customer_coupons: [{
      id: 'issued', status: 'active', uses_remaining: 1, expires_at: '2099-01-01T00:00:00Z',
      coupon_campaigns: { is_active: false, valid_until: '2020-01-01T00:00:00Z' },
      rules_snapshot: { usage_valid_until: '2099-01-01T00:00:00Z' },
    }] })
    const r = response()
    await handler({ method: 'GET', headers: {}, query: { type: 'available' } } as unknown as VercelRequest, r as unknown as VercelResponse)
    expect(r.status).toHaveBeenCalledWith(200)
    expect(r.json.mock.calls[0][0]).toHaveLength(1)
  })
  it('予約取得の失敗を予約なしの空配列に置き換えない', async () => {
    seed({ customers: [{ id: 'customer' }] })
    const original = mock.from.getMockImplementation()!
    mock.from.mockImplementation((table: string) => {
      const query = original(table)
      if (table === 'reservations') query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'unavailable' } }).then(resolve)
      return query
    })
    const r = response()
    await handler({ method: 'GET', headers: {}, query: { type: 'current-reservations' } } as unknown as VercelRequest, r as unknown as VercelResponse)
    expect(r.status).toHaveBeenCalledWith(500)
    expect(r.json).toHaveBeenCalledWith({ error: '予約を取得できませんでした' })
  })

  it('管理者の保有クーポン照会も配布済みの割引額を返す', async () => {
    mock.role = 'admin'
    seed({ customer_coupons: [{ id: 'issued', coupon_campaigns: { discount_amount: 2000 }, rules_snapshot: { discount_amount: 500 } }] })
    const r = response()
    await handler({ method: 'GET', headers: {}, query: { type: 'customer-coupons', customer_id: 'customer' } } as unknown as VercelRequest, r as unknown as VercelResponse)
    expect(r.status).toHaveBeenCalledWith(200)
    expect(r.json.mock.calls[0][0][0].coupon_campaigns.discount_amount).toBe(500)
  })

})

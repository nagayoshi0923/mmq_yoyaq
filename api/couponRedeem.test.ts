// 予約に適用したクーポンの「もぎる（来店確認）」とスタッフ側の表示（社長決定 B、2026-10-20）
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), role: 'customer' }))
vi.mock('./_lib/db.js', () => ({ db: { rpc: mock.rpc, from: mock.from }, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
  return {
    requireAuth: async () => ({ userId: 'verified-user', orgId: 'verified-org', role: mock.role }),
    requireStaff: () => { if (mock.role === 'customer') throw new ApiError(403, 'staff only') },
    requireAdmin: vi.fn(), ApiError,
  }
})
import handler from './coupons'
function response() { const r = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; r.status.mockReturnValue(r); return r }
const call = async (req: Record<string, unknown>) => { const r = response(); await handler({ headers: {}, ...req } as unknown as VercelRequest, r as unknown as VercelResponse); return r }
beforeEach(() => { vi.clearAllMocks(); mock.role = 'customer' })

/** from(table) の結果を順に返す（select の列ごとに失敗させられる） */
function seed(results: Record<string, Array<{ data: unknown; error: unknown }>>) {
  const selects: Record<string, string[]> = {}
  const eqs: unknown[][] = []
  mock.from.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {}
    for (const method of ['in', 'order', 'limit', 'gt', 'not', 'or']) query[method] = vi.fn(() => query)
    query.eq = vi.fn((...args: unknown[]) => { eqs.push([table, ...args]); return query })
    query.select = vi.fn((cols: string) => { (selects[table] ??= []).push(cols); return query })
    query.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'customer' }, error: null }))
    query.then = (resolve: (v: unknown) => unknown) => Promise.resolve((results[table] ?? []).shift() ?? { data: [], error: null }).then(resolve)
    return query
  })
  return { selects, eqs }
}

describe('もぎる（来店確認）API', () => {
  it('検証済みの本人IDと使用履歴IDだけを渡す（経路は customer_present 固定）', async () => {
    mock.rpc.mockResolvedValue({ data: { success: true, already_redeemed: false }, error: null })
    const r = await call({ method: 'POST', query: { action: 'redeem-usage' }, body: { usage_id: 'usage', p_user: 'forged', p_source: 'venue_use' } })
    expect(mock.rpc).toHaveBeenCalledWith('redeem_coupon_usage', { p_user: 'verified-user', p_usage_id: 'usage', p_source: 'customer_present' })
    expect(r.status).toHaveBeenCalledWith(200)
  })
  it('使用履歴の指定が無ければ DB を呼ばない', async () => {
    const r = await call({ method: 'POST', query: { action: 'redeem-usage' }, body: {} })
    expect(r.status).toHaveBeenCalledWith(400)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
  it('他人の予約などの拒否理由を 400 で返す', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: 'P0028', message: 'ご本人の予約を指定してください' } })
    const r = await call({ method: 'POST', query: { action: 'redeem-usage' }, body: { usage_id: 'usage' } })
    expect(r.status).toHaveBeenCalledWith(400)
    expect(r.json).toHaveBeenCalledWith({ success: false, error: 'ご本人の予約を指定してください' })
  })
  it('来店時にその場で使ったクーポンは、使用に続けて来店確認（venue_use）を付ける', async () => {
    mock.rpc.mockImplementation((name: string) => Promise.resolve(name === 'use_customer_coupon'
      ? { data: { success: true, usage_id: 'new-usage', discount_amount: 500 }, error: null }
      : { data: { success: true }, error: null }))
    const r = await call({ method: 'POST', query: { action: 'use' }, body: { customer_coupon_id: 'coupon', reservation_id: 'reservation' } })
    expect(mock.rpc).toHaveBeenNthCalledWith(2, 'redeem_coupon_usage', { p_user: 'verified-user', p_usage_id: 'new-usage', p_source: 'venue_use' })
    expect(r.json).toHaveBeenCalledWith({ success: true, usage_id: 'new-usage', discount_amount: 500 })
  })
  it('来店確認の印付けに失敗しても、使用は成功として返す（migration 適用前など）', async () => {
    mock.rpc.mockImplementation((name: string) => Promise.resolve(name === 'use_customer_coupon'
      ? { data: { success: true, usage_id: 'new-usage', discount_amount: 500 }, error: null }
      : { data: null, error: { code: 'PGRST202', message: 'function not found' } }))
    const r = await call({ method: 'POST', query: { action: 'use' }, body: { customer_coupon_id: 'coupon', reservation_id: 'reservation' } })
    expect(r.status).toHaveBeenCalledWith(200)
  })
  it('使用前の確認（preview-use）では印を付けない', async () => {
    mock.rpc.mockResolvedValue({ data: { success: true, usage_id: 'x', discount_amount: 500 }, error: null })
    await call({ method: 'POST', query: { action: 'preview-use' }, body: { customer_coupon_id: 'coupon', reservation_id: 'reservation' } })
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
})

describe('マイページのクーポン一覧に来店確認を載せる', () => {
  const usageRow = { id: 'u1', customer_coupon_id: 'c1', reservation_id: 'r1', used_at: '2026-10-10T00:00:00Z', discount_amount: 500,
    redeemed_at: '2026-10-20T03:50:00Z', redeemed_source: 'customer_present',
    reservations: { id: 'r1', title: '作品', status: 'confirmed', requested_datetime: '2026-10-20T04:00:00Z', store_id: 's', stores: { name: '店', short_name: null } } }
  it('来店確認の時刻と予約の状態を返す', async () => {
    seed({ customers: [{ data: [{ id: 'customer' }], error: null }], customer_coupons: [{ data: [{ id: 'c1', organization_id: null, coupon_campaigns: {}, rules_snapshot: {} }], error: null }], coupon_usages: [{ data: [usageRow], error: null }] })
    const r = await call({ method: 'GET', query: { type: 'all' } })
    const usage = r.json.mock.calls[0][0][0].coupon_usages[0]
    expect(usage.redeemed_at).toBe('2026-10-20T03:50:00Z')
    expect(usage.reservations.status).toBe('confirmed')
  })
  it('来店確認の列がまだ無い DB では列なしで読み直し、適用済みの表示は続ける', async () => {
    const { redeemed_at: _a, redeemed_source: _b, ...legacy } = usageRow
    const { selects } = seed({
      customers: [{ data: [{ id: 'customer' }], error: null }],
      customer_coupons: [{ data: [{ id: 'c1', organization_id: null, coupon_campaigns: {}, rules_snapshot: {} }], error: null }],
      coupon_usages: [{ data: null, error: { code: '42703', message: 'column coupon_usages.redeemed_at does not exist' } }, { data: [legacy], error: null }],
    })
    const r = await call({ method: 'GET', query: { type: 'all' } })
    expect(selects.coupon_usages).toHaveLength(2)
    expect(selects.coupon_usages[1]).not.toContain('redeemed_at')
    const usage = r.json.mock.calls[0][0][0].coupon_usages[0]
    expect(usage.redeemed_at).toBeNull()
    expect(usage.reservations.requested_datetime).toBe('2026-10-20T04:00:00Z')
  })
})

describe('スタッフ側: 予約のクーポンと来店確認', () => {
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  it('顧客ロールでは読まない', async () => {
    const r = await call({ method: 'GET', query: { type: 'reservation-coupons', reservation_ids: id(1) } })
    expect(r.status).toHaveBeenCalledWith(403)
    expect(mock.from).not.toHaveBeenCalled()
  })
  it('自組織の予約に絞り、来店確認の状態を返す', async () => {
    mock.role = 'staff'
    const { eqs } = seed({
      reservations: [{ data: [{ id: id(1) }], error: null }],
      coupon_usages: [{ data: [{ id: 'u1', reservation_id: id(1), discount_amount: 500, used_at: 't', redeemed_at: 't2', redeemed_source: 'customer_present',
        customer_coupons: { organization_id: 'verified-org', coupon_campaigns: { name: '初回', display_name: null } } }], error: null }],
    })
    const r = await call({ method: 'GET', query: { type: 'reservation-coupons', reservation_ids: `${id(1)},not-a-uuid,${id(2)}` } })
    expect(eqs).toContainEqual(['reservations', 'organization_id', 'verified-org'])
    expect(r.json).toHaveBeenCalledWith([{ usage_id: 'u1', reservation_id: id(1), discount_amount: 500, campaign_name: '初回', used_at: 't', redeemed_at: 't2', redeemed_source: 'customer_present' }])
  })
  it('他組織のクーポンの使用は返さない', async () => {
    mock.role = 'staff'
    seed({
      reservations: [{ data: [{ id: id(1) }], error: null }],
      coupon_usages: [{ data: [{ id: 'u1', reservation_id: id(1), discount_amount: 500, used_at: 't', customer_coupons: { organization_id: 'other-org', coupon_campaigns: null } }], error: null }],
    })
    const r = await call({ method: 'GET', query: { type: 'reservation-coupons', reservation_ids: id(1) } })
    expect(r.json).toHaveBeenCalledWith([])
  })
  it('予約IDが無ければ DB を読まない', async () => {
    mock.role = 'staff'
    const r = await call({ method: 'GET', query: { type: 'reservation-coupons', reservation_ids: 'x' } })
    expect(r.json).toHaveBeenCalledWith([])
    expect(mock.from).not.toHaveBeenCalled()
  })
})

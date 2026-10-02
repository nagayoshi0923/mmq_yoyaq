/**
 * api/coupons.ts の管理系の書き込みと配布規則を、固定データで固定する特性テスト（整備 Phase 3 の分割の前提、#774）。
 * 既存の api/coupons.test.ts は、クーポンの使用（use / preview-*）・予約候補・使用履歴を守っている。ここはその外側:
 * キャンペーンの作成・更新・有効切替、顧客への手動付与（配布上限・期限・使用回数）、取消・使用回数調整・使用の取り消し。
 * 固定する値は「分割前の現状の出力」であり、正しさの主張ではない。規則を変えたら、理由と一緒に更新する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const mock = vi.hoisted(() => ({
  role: 'admin', orgId: 'org-1', tables: {} as Record<string, unknown>, counts: {} as Record<string, number>,
  writes: [] as Array<{ table: string; op: string; payload: unknown; filters: string[] }>, rpcs: [] as Array<{ name: string; args: unknown }>,
  errors: {} as Record<string, string>,
}))
vi.mock('./_lib/db.js', () => ({
  getMissingEnvError: () => null,
  db: {
    rpc: async (name: string, args: unknown) => { mock.rpcs.push({ name, args }); return { data: { success: true }, error: null } },
    from: (table: string) => {
      let op = 'select'; let payload: unknown = null; let head = false
      const filters: string[] = []
      const q: Record<string, unknown> = {}
      const record = () => { if (op !== 'select') mock.writes.push({ table, op, payload, filters: filters.slice() }) }
      q.select = (_f?: string, opts?: { head?: boolean }) => { head = !!opts?.head; return q }
      q.insert = (p: unknown) => { op = 'insert'; payload = p; return q }
      q.update = (p: unknown) => { op = 'update'; payload = p; return q }
      q.upsert = (p: unknown) => { op = 'upsert'; payload = p; return q }
      q.delete = () => { op = 'delete'; return q }
      for (const m of ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'or', 'not', 'is', 'in', 'ilike']) {
        q[m] = (...a: unknown[]) => { filters.push(`${m}(${a.map(x => JSON.stringify(x)).join(',')})`); return q }
      }
      const rows = () => { const t = mock.tables[table]; return Array.isArray(t) ? t : t == null ? [] : [t] }
      const result = () => {
        record()
        if (mock.errors[`${table}.${op}`]) return { data: null, error: { message: mock.errors[`${table}.${op}`] }, count: null }
        if (head) return { data: null, count: mock.counts[table] ?? 0, error: null }
        if (op === 'insert') return { data: { id: 'new-id' }, error: null }
        if (op === 'update') return { data: rows().length ? rows() : [{ id: 'x' }], error: null }
        return { data: rows(), error: null }
      }
      q.single = q.maybeSingle = async () => { const r = result(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error } }
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
      return q
    },
  },
}))
vi.mock('./_lib/auth.js', () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
  return {
    requireAuth: async () => ({ userId: 'user-1', orgId: mock.orgId, role: mock.role }),
    requireStaff: () => { if (mock.role === 'customer') throw new ApiError(403, 'staff only') },
    requireAdmin: () => { if (mock.role !== 'admin') throw new ApiError(403, 'admin only') }, ApiError,
  }
})
import handler from './coupons'

async function call(query: Record<string, string>, method: string, body?: Record<string, unknown>) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn(), end: vi.fn() }
  await handler({ method, headers: { authorization: 'Bearer x' }, query, body } as unknown as VercelRequest, res as unknown as VercelResponse)
  return { status: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0] }
}
const campaign = {
  id: 'c1', organization_id: 'org-1', name: '春のクーポン', discount_type: 'fixed', discount_amount: 500, max_uses_per_customer: 2, target_type: 'all',
  target_ids: [], target_store_ids: [], trigger_type: 'manual', usage_valid_until: null, coupon_expiry_days: 30, max_total_grants: null,
  max_grants_per_customer: null, notify_on_grant: false, is_active: true,
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T03:00:00Z'))
  mock.role = 'admin'; mock.orgId = 'org-1'; mock.writes.length = 0; mock.rpcs.length = 0; mock.errors = {}; mock.counts = {}
  mock.tables = { coupon_campaigns: [campaign], customers: [{ id: 'cu1', organization_id: null }], customer_coupons: [] }
})
afterEach(() => { vi.useRealTimers() })

describe('api/coupons.ts 管理系の書き込みと配布規則（分割前の現状を固定）', () => {
  it('grant-to-customer: 自組織のキャンペーンを顧客へ付与し、期限は配布日 + coupon_expiry_days、使用回数はキャンペーンの上限', async () => {
    const { status, body } = await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1', customer_id: 'cu1' })
    expect(status).toBe(200); expect(body).toMatchInlineSnapshot(`
      {
        "couponId": "new-id",
        "success": true,
      }
    `)
    expect(mock.writes.filter(w => w.table === 'customer_coupons')).toMatchInlineSnapshot(`
      [
        {
          "filters": [],
          "op": "insert",
          "payload": {
            "campaign_id": "c1",
            "customer_id": "cu1",
            "expires_at": "2026-11-01T03:00:00.000Z",
            "organization_id": "org-1",
            "status": "active",
            "uses_remaining": 2,
          },
          "table": "customer_coupons",
        },
      ]
    `)
  })
  it('grant-to-customer: 使用回数を指定でき（1 以上、小数は切り捨て）、不正な値はキャンペーンの上限に戻す', async () => {
    await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1', customer_id: 'cu1', uses: 5.9 })
    await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1', customer_id: 'cu1', uses: 0 })
    await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1', customer_id: 'cu1', uses: 'x' })
    expect(mock.writes.filter(w => w.table === 'customer_coupons').map(w => (w.payload as { uses_remaining: number }).uses_remaining)).toEqual([5, 2, 2])
  })
  it('grant-to-customer: 期限は絶対の usage_valid_until が優先される', async () => {
    mock.tables.coupon_campaigns = [{ ...campaign, usage_valid_until: '2026-12-31T00:00:00Z', coupon_expiry_days: 7 }]
    await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1', customer_id: 'cu1' })
    expect((mock.writes.find(w => w.table === 'customer_coupons')!.payload as { expires_at: string }).expires_at).toBe('2026-12-31T00:00:00.000Z')
  })
  it('grant-to-customer: 1 人あたり・全体の配布上限に達していたら付与しない（それぞれ 409 / 400）', async () => {
    mock.tables.coupon_campaigns = [{ ...campaign, max_grants_per_customer: 1 }]; mock.counts.customer_coupons = 1
    const perCustomer = await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1', customer_id: 'cu1' })
    expect(perCustomer.status).toBe(409)
    mock.tables.coupon_campaigns = [{ ...campaign, max_total_grants: 10 }]; mock.counts.customer_coupons = 10
    const total = await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1', customer_id: 'cu1' })
    expect(total.status).toBe(400)
    expect(mock.writes.filter(w => w.table === 'customer_coupons')).toEqual([])
  })
  it('grant-to-customer: 必須項目の欠落は 400、キャンペーン・顧客が見つからなければ 404、顧客ロールは 403', async () => {
    expect((await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1' })).status).toBe(400)
    mock.tables.coupon_campaigns = []; expect((await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1', customer_id: 'cu1' })).status).toBe(404)
    mock.tables.coupon_campaigns = [campaign]; mock.tables.customers = []; expect((await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1', customer_id: 'cu1' })).status).toBe(404)
    mock.role = 'customer'; expect((await call({ action: 'grant-to-customer' }, 'POST', { campaign_id: 'c1', customer_id: 'cu1' })).status).toBe(403)
  })
  it('toggle-campaign-active: 現在の値を反転し、自組織のキャンペーンだけを更新する', async () => {
    const { status, body } = await call({ action: 'toggle-campaign-active', id: 'c1' }, 'PATCH')
    expect(status).toBe(200); expect(body).toEqual({ success: true, isActive: false })
    expect(mock.writes.find(w => w.table === 'coupon_campaigns')).toMatchInlineSnapshot(`
      {
        "filters": [
          "eq("id","c1")",
          "eq("organization_id","org-1")",
        ],
        "op": "update",
        "payload": {
          "is_active": false,
        },
        "table": "coupon_campaigns",
      }
    `)
    mock.tables.coupon_campaigns = []
    expect((await call({ action: 'toggle-campaign-active', id: 'nope' }, 'PATCH')).status).toBe(404)
    expect((await call({ action: 'toggle-campaign-active' }, 'PATCH')).status).toBe(400)
  })
  it('revoke-coupon: 使用履歴が無いものだけ自組織のクーポンを削除し、使用履歴があれば 409 で削除しない', async () => {
    mock.tables.customer_coupons = [{ id: 'cc1', organization_id: 'org-1', status: 'active' }]
    expect((await call({ action: 'revoke-coupon', customer_coupon_id: 'cc1' }, 'DELETE')).status).toBe(200)
    expect(mock.writes.find(w => w.table === 'customer_coupons' && w.op === 'delete')).toMatchInlineSnapshot(`
      {
        "filters": [
          "eq("id","cc1")",
          "eq("organization_id","org-1")",
        ],
        "op": "delete",
        "payload": null,
        "table": "customer_coupons",
      }
    `)
    mock.writes.length = 0; mock.counts.coupon_usages = 1
    const used = await call({ action: 'revoke-coupon', customer_coupon_id: 'cc1' }, 'DELETE')
    expect(used.status).toBe(409); expect(mock.writes).toEqual([])
    mock.tables.customer_coupons = []; mock.counts.coupon_usages = 0
    expect((await call({ action: 'revoke-coupon', customer_coupon_id: 'cc1' }, 'DELETE')).status).toBe(404)
    expect((await call({ action: 'revoke-coupon' }, 'DELETE')).status).toBe(400)
  })
  it('adjust-coupon-uses: 残回数 0 → fully_used、1 以上 → active、取消済み（revoked）は触らない。小数は切り捨て、負数・非数は 400', async () => {
    const payloads = async (coupon: Record<string, unknown>, uses: unknown) => {
      mock.tables.customer_coupons = [coupon]; mock.writes.length = 0
      const r = await call({ action: 'adjust-coupon-uses' }, 'PATCH', { customer_coupon_id: 'cc1', uses_remaining: uses })
      const w = mock.writes.find(x => x.table === 'customer_coupons')
      return { status: r.status, payload: w ? { ...(w.payload as Record<string, unknown>), updated_at: '<now>' } : null }
    }
    expect(await payloads({ id: 'cc1', status: 'active' }, 0)).toMatchInlineSnapshot(`
      {
        "payload": {
          "status": "fully_used",
          "updated_at": "<now>",
          "uses_remaining": 0,
        },
        "status": 200,
      }
    `)
    expect(await payloads({ id: 'cc1', status: 'fully_used' }, 3.7)).toMatchInlineSnapshot(`
      {
        "payload": {
          "status": "active",
          "updated_at": "<now>",
          "uses_remaining": 3,
        },
        "status": 200,
      }
    `)
    expect(await payloads({ id: 'cc1', status: 'revoked' }, 2)).toMatchInlineSnapshot(`
      {
        "payload": {
          "status": "revoked",
          "updated_at": "<now>",
          "uses_remaining": 2,
        },
        "status": 200,
      }
    `)
    expect((await payloads({ id: 'cc1', status: 'active' }, -1)).status).toBe(400)
    expect((await payloads({ id: 'cc1', status: 'active' }, '2')).status).toBe(400)
  })
  it('restore-usage: RPC restore_coupon_usage に認証した組織を渡す。P0028 は 400、他の失敗は 500', async () => {
    expect((await call({ action: 'restore-usage', usage_id: 'u1', customer_coupon_id: 'cc1' }, 'DELETE')).status).toBe(200)
    expect(mock.rpcs).toMatchInlineSnapshot(`
      [
        {
          "args": {
            "p_coupon": "cc1",
            "p_organization": "org-1",
            "p_usage": "u1",
          },
          "name": "restore_coupon_usage",
        },
      ]
    `)
    expect((await call({ action: 'restore-usage', usage_id: 'u1' }, 'DELETE')).status).toBe(400)
  })
  it('campaign-stats: 付与数・使用数・残回数・割引額の合計（自組織のキャンペーンだけ）', async () => {
    mock.tables.customer_coupons = [{ id: 'cc1', uses_remaining: 1 }, { id: 'cc2', uses_remaining: 0 }, { id: 'cc3', uses_remaining: null }]
    mock.tables.coupon_usages = [{ discount_amount: 500 }, { discount_amount: 700 }, { discount_amount: null }]
    const { status, body } = await call({ type: 'campaign-stats', campaign_id: 'c1' }, 'GET')
    expect(status).toBe(200); expect(body).toMatchInlineSnapshot(`
      {
        "totalDiscountAmount": 1200,
        "totalGranted": 3,
        "totalRemaining": 1,
        "totalUsed": 3,
      }
    `)
    mock.tables.coupon_campaigns = []
    expect((await call({ type: 'campaign-stats', campaign_id: 'other-org' }, 'GET')).status).toBe(404)
    expect((await call({ type: 'campaign-stats' }, 'GET')).status).toBe(400)
  })
  it('campaigns: 自組織のキャンペーンを新しい順に返す。顧客ロールは 403', async () => {
    mock.tables.coupon_campaigns = [campaign]
    expect((await call({ type: 'campaigns' }, 'GET')).body).toEqual([campaign])
    mock.role = 'customer'
    expect((await call({ type: 'campaigns' }, 'GET')).status).toBe(403)
  })
  it('create-campaign: 検証を通した内容に認証した組織を付けて保存する（クライアント指定の組織は使わない）', async () => {
    const { status, body } = await call({ action: 'create-campaign' }, 'POST', { name: '新規', organization_id: 'foreign-org', discount_type: 'fixed', discount_amount: 300, max_uses_per_customer: 1, trigger_type: 'manual', target_type: 'all' })
    expect([status, body]).toMatchInlineSnapshot(`
      [
        200,
        {
          "id": "new-id",
          "success": true,
        },
      ]
    `)
    const w = mock.writes.find(x => x.table === 'coupon_campaigns' && x.op === 'insert')
    expect(w ? (w.payload as { organization_id: string }).organization_id : 'no-insert').toBe('org-1')
  })
  it('create-campaign / update-campaign: 検証エラーは 400 で何も書き込まない', async () => {
    const bad = await call({ action: 'create-campaign' }, 'POST', { name: '' })
    expect(bad.status).toBe(400); expect(mock.writes).toEqual([])
    expect((await call({ action: 'update-campaign' }, 'PATCH', { name: 'x' })).status).toBe(400)
  })
})

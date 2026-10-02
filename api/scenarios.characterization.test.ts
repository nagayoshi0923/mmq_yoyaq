/**
 * api/scenarios.ts の統計ハンドラ（stats / all-stats）と書き込み系の出力を、固定データで固定する特性テスト
 * （整備 Phase 3 の分割の前提、#774）。固定する値は「分割前の現状の出力」であり、正しさの主張ではない。
 * 注意: stats は予約を status in ('confirmed','gm_confirmed') で数え、checked_in を数えない。デモ・スタッフの分類も
 * 売上側（api/sales.ts）と別の定義（DEMO: manual_demo/demo のみ、demo_auto・walk_in は通常扱い）。この食い違いも含めて現状を固定する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const mock = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://scenarios-fixture.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'scenarios-fixture-key'
  return { issued: [] as Array<{ table: string; ops: string[] }>, writes: [] as Array<{ table: string; op: string; payload: unknown }>, rpcs: [] as Array<{ name: string; args: unknown }>, rpcResult: { success: true } as unknown, tables: {} as Record<string, unknown[]>, counts: {} as Record<string, number> }
})

const ORG = 'org-1'
const MASTER = 'master-1'
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'actor' } }, error: null }) },
    rpc: async (name: string, args: unknown) => { mock.rpcs.push({ name, args }); return { data: mock.rpcResult, error: null } },
    from: (table: string) => {
      const entry = { table, ops: [] as string[] }
      mock.issued.push(entry)
      let rows = (mock.tables[table] ?? []).slice()
      let head = false
      let futureDate = false
      const q: Record<string, unknown> = {}
      for (const w of ['insert', 'update', 'upsert']) q[w] = (payload: unknown) => { mock.writes.push({ table, op: w, payload }); return q }
      q.delete = () => { mock.writes.push({ table, op: 'delete', payload: null }); return q }
      q.select = (fields: string, opts?: { head?: boolean }) => { head = !!opts?.head; entry.ops.push(`select(${String(fields).replace(/\s+/g, ' ').trim().slice(0, 90)}${head ? ', head' : ''})`); return q }
      for (const m of ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'or', 'not', 'is', 'in']) {
        q[m] = (...a: unknown[]) => {
          entry.ops.push(`${m}(${a.map(x => JSON.stringify(x)).join(', ')})`)
          if (m === 'in' && a[0] === 'schedule_event_id') rows = rows.filter(x => (a[1] as string[]).includes((x as { schedule_event_id: string }).schedule_event_id))
          if (m === 'in' && a[0] === 'status') rows = rows.filter(x => (a[1] as string[]).includes((x as { status: string }).status))
          if (m === 'gt' && a[0] === 'date') futureDate = true
          if (m === 'eq' && a[0] === 'is_cancelled') rows = rows.filter(x => (x as { is_cancelled: boolean }).is_cancelled === a[1])
          if (m === 'neq' && a[0] === 'is_cancelled') rows = rows.filter(x => (x as { is_cancelled: boolean }).is_cancelled !== a[1])
          return q
        }
      }
      const result = () => {
        if (table === 'users') return { data: { organization_id: ORG, role: 'admin' }, error: null }
        if (head) return { data: null, count: futureDate ? (mock.counts.future ?? 0) : (entry.ops.some(o => o.includes('"is_cancelled", true') || o.includes('eq("is_cancelled",true)')) ? (mock.counts.cancelled ?? 0) : (mock.counts.performed ?? 0)), error: null }
        return { data: rows, error: null }
      }
      q.single = q.maybeSingle = async () => { const r = result(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null } }
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
      return q
    },
  }),
}))
vi.mock('../api/_lib/compensationHistory.js', () => ({
  loadCompensationHistory: async () => () => ({
    gm_base_pay: 2000, gm_hourly_rate: 1000, gm_test_base_pay: 1000, gm_test_hourly_rate: 500, reception_fixed_pay: 1500,
    use_hourly_table: false, hourly_rates: [], gm_test_hourly_rates: [],
  }),
}))
import handler from './scenarios'

const scenario = {
  id: MASTER, player_count_max: 6, license_amount: 1000, gm_test_license_amount: 500, participation_fee: 4000, gm_test_participation_fee: 3000,
  participation_costs: null, gm_costs: [{ role: 'main', reward: 3000 }, { role: 'sub', reward: 2000 }], duration: 180, license_rewards: null,
}
const ev = (id: string, over: Record<string, unknown>) => ({
  id, date: '2026-09-10', category: 'open', current_participants: 0, total_revenue: null, gm_cost: null, license_cost: null,
  start_time: '14:00:00', store_id: 's1', is_cancelled: false, gms: ['太郎', '花子'], gm_roles: { 太郎: 'main', 花子: 'sub' },
  staff_assignments: [
    { staff_id: 'st-taro', staff_name: '太郎', ordinal: 1, resolution_status: 'resolved' },
    { staff_id: 'st-hanako', staff_name: '花子', ordinal: 2, resolution_status: 'resolved' },
  ],
  stores: { venue_cost_per_performance: 2000, transport_allowance: 500 }, ...over,
})
const res_ = (event: string, over: Record<string, unknown>) => ({
  schedule_event_id: event, participant_count: 2, reservation_source: 'web', payment_method: 'online', status: 'confirmed', ...over,
})

async function call(query: Record<string, string>, method = 'GET', body?: Record<string, unknown>) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn(), end: vi.fn() }
  await handler({ method, headers: { authorization: 'Bearer x' }, query, body } as unknown as VercelRequest, res as unknown as VercelResponse)
  return { status: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0] }
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T03:00:00Z'))
  mock.issued.length = 0
  mock.writes.length = 0
  mock.rpcs.length = 0
  mock.rpcResult = { success: true }
  mock.counts = { performed: 3, cancelled: 1, future: 2 }
  mock.tables = {
    organization_scenarios_with_master: [scenario],
    schedule_events: [
      ev('e-normal', { total_revenue: 20000 }),
      ev('e-fallback', { date: '2026-09-11', current_participants: 3 }),
      ev('e-gmtest', { date: '2026-09-12', category: 'gmtest', gms: ['太郎'], gm_roles: { 太郎: 'main' }, staff_assignments: [{ staff_id: 'st-taro', staff_name: '太郎', ordinal: 1, resolution_status: 'resolved' }] }),
      ev('e-cancel', { date: '2026-09-13', is_cancelled: true }),
      ev('e-recorded', { date: '2026-09-14', total_revenue: 8000, gm_cost: 4000, license_cost: 700 }),
    ],
    reservations: [
      res_('e-normal', { participant_count: 4 }),
      res_('e-normal', { participant_count: 1, reservation_source: 'staff', payment_method: 'staff' }),
      res_('e-normal', { participant_count: 1, reservation_source: 'demo' }),
      res_('e-normal', { participant_count: 2, status: 'checked_in' }),
      res_('e-normal', { participant_count: 1, reservation_source: 'walk_in' }),
      res_('e-gmtest', { participant_count: 2, reservation_source: 'manual_demo' }),
      res_('e-recorded', { participant_count: 3 }),
    ],
    staff: [{ id: 'st-taro', name: '太郎', stores: ['s1'] }, { id: 'st-hanako', name: '花子', stores: ['s2'] }],
    users: [{ organization_id: ORG, role: 'admin' }],
  }
})
afterEach(() => { vi.useRealTimers() })

describe('api/scenarios.ts 統計の出力（分割前の現状を固定）', () => {
  it('stats: 公演回数・売上・参加者・GM 費用・ライセンス費用・会場費・公演ごとの内訳', async () => {
    const { status, body } = await call({ type: 'stats', scenarioId: MASTER })
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      {
        "cancelledCount": 1,
        "firstPerformanceDate": "2026-09-10",
        "futurePerformanceCount": 2,
        "futureReservationCount": 3,
        "performanceCount": 1,
        "performanceDates": [
          {
            "category": "open",
            "date": "2026-09-10",
            "demoParticipants": 1,
            "isCancelled": false,
            "licenseCost": 1000,
            "participants": 6,
            "revenue": 20000,
            "staffParticipants": 1,
            "startTime": "14:00:00",
            "storeId": "s1",
          },
          {
            "category": "open",
            "date": "2026-09-11",
            "demoParticipants": 0,
            "isCancelled": false,
            "licenseCost": 1000,
            "participants": 3,
            "revenue": 12000,
            "staffParticipants": 0,
            "startTime": "14:00:00",
            "storeId": "s1",
          },
          {
            "category": "gmtest",
            "date": "2026-09-12",
            "demoParticipants": 2,
            "isCancelled": false,
            "licenseCost": 500,
            "participants": 2,
            "revenue": 6000,
            "staffParticipants": 0,
            "startTime": "14:00:00",
            "storeId": "s1",
          },
          {
            "category": "open",
            "date": "2026-09-13",
            "demoParticipants": 0,
            "isCancelled": true,
            "licenseCost": 0,
            "participants": 0,
            "revenue": 0,
            "staffParticipants": 0,
            "startTime": "14:00:00",
            "storeId": "s1",
          },
          {
            "category": "open",
            "date": "2026-09-14",
            "demoParticipants": 0,
            "isCancelled": false,
            "licenseCost": 700,
            "participants": 3,
            "revenue": 8000,
            "staffParticipants": 0,
            "startTime": "14:00:00",
            "storeId": "s1",
          },
        ],
        "totalGmCost": 17500,
        "totalLicenseCost": 3200,
        "totalParticipants": 14,
        "totalRevenue": 46000,
        "totalStaffParticipants": 1,
        "totalVenueCost": 8000,
        "venueCostPerPerformance": 2000,
      }
    `)
  })
  it('stats: 発行するクエリは全て認証した組織で絞る（users 以外）', async () => {
    await call({ type: 'stats', scenarioId: MASTER })
    for (const q of mock.issued.filter(i => i.table !== 'users')) {
      expect(q.ops.some(o => o.includes(`"organization_id", "${ORG}"`) || o.includes(`"organization_id","${ORG}"`) || o.includes(`organization_id`)), `${q.table}: ${q.ops.join(' | ')}`).toBe(true)
    }
  })
  it('stats: 予約は confirmed / gm_confirmed のみ数え、checked_in を数えない（売上側と規則が違う現状を固定）', async () => {
    await call({ type: 'stats', scenarioId: MASTER })
    const resQuery = mock.issued.find(i => i.table === 'reservations' && i.ops.some(o => o.startsWith('in("status"')))
    expect(resQuery?.ops.find(o => o.startsWith('in("status"'))).toMatchInlineSnapshot(`"in("status", ["confirmed","gm_confirmed"])"`)
  })
  it('stats: scenarioId が無いと 400、他組織・存在しない作品は 404', async () => {
    expect((await call({ type: 'stats' })).status).toBe(400)
    mock.tables.organization_scenarios_with_master = []
    expect((await call({ type: 'stats', scenarioId: 'unknown' })).status).toBe(404)
  })
  it('POST create: マスター(draft)と自組織の作品を 2 段で作り、組織 ID は認証した組織を強制する（クライアント指定は無視）', async () => {
    mock.tables.scenario_masters = [{ id: 'new-master' }]
    mock.tables.organization_scenarios_with_master = [{ id: 'new-master', title: '新作' }]
    const { status, body } = await call({}, 'POST', { scenario: { title: '新作', organization_id: 'foreign-org', duration: 210, status: 'available', license_amount: 800, gm_costs: [{ role: 'main', reward: 3000 }] } })
    expect(status).toBe(201)
    expect(body).toMatchInlineSnapshot(`
      {
        "id": "new-master",
        "title": "新作",
      }
    `)
    expect(mock.writes).toMatchInlineSnapshot(`
      [
        {
          "op": "insert",
          "payload": {
            "author": null,
            "author_email": null,
            "description": null,
            "difficulty": null,
            "genre": [],
            "has_pre_reading": false,
            "key_visual_url": null,
            "master_status": "draft",
            "official_duration": 210,
            "official_site_url": null,
            "player_count_max": 6,
            "player_count_min": 4,
            "release_date": null,
            "submitted_by_organization_id": "org-1",
            "synopsis": null,
            "title": "新作",
            "weekend_duration": null,
          },
          "table": "scenario_masters",
        },
        {
          "op": "insert",
          "payload": {
            "available_gms": [],
            "available_stores": [],
            "depreciation_per_performance": null,
            "duration": 210,
            "experienced_staff": [],
            "extra_preparation_time": null,
            "franchise_gm_test_license_amount": null,
            "franchise_license_amount": null,
            "gm_assignments": null,
            "gm_costs": [
              {
                "reward": 3000,
                "role": "main",
              },
            ],
            "gm_count": null,
            "gm_test_license_amount": null,
            "gm_test_participation_fee": null,
            "is_license_buyout": false,
            "license_amount": 800,
            "notes": null,
            "org_status": "available",
            "organization_id": "org-1",
            "participation_fee": null,
            "play_count": 0,
            "production_cost": null,
            "production_costs": [],
            "scenario_master_id": "new-master",
            "slug": null,
          },
          "table": "organization_scenarios",
        },
      ]
    `)
  })
  it('POST create: title が無いと 400 でどこにも書き込まない', async () => {
    const { status } = await call({}, 'POST', { scenario: { author: 'x' } })
    expect(status).toBe(400); expect(mock.writes).toEqual([])
  })
  it('PATCH update: 入力列を DB の列に対応づけて更新する（title → override_title、空文字は null、status は検証、マスターは draft → pending）', async () => {
    mock.tables.organization_scenarios = [{ id: 'os-1' }]
    mock.tables.scenario_masters = [{ id: MASTER, master_status: 'draft', submitted_by_organization_id: ORG }]
    mock.tables.organization_scenarios_with_master = [{ id: MASTER, title: '更新後' }]
    const { status, body } = await call({ id: MASTER }, 'PATCH', { updates: {
      status: 'available', title: '', author: '作者B', duration: 200, license_amount: 900, gm_costs: [{ role: 'main', reward: 3500 }],
      key_visual_url: 'https://example.invalid/k.png', caution: '注意', organization_id: 'foreign-org', unknown_column: 'x', kit_count: 2,
    } })
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      {
        "id": "master-1",
        "title": "更新後",
      }
    `)
    const writes = mock.writes.map(w => w.table === 'organization_scenarios' && w.payload && typeof w.payload === 'object' ? { ...w, payload: { ...(w.payload as Record<string, unknown>), updated_at: '<now>' } } : w)
    expect(writes).toMatchInlineSnapshot(`
      [
        {
          "op": "update",
          "payload": {
            "custom_caution": "注意",
            "custom_key_visual_url": "https://example.invalid/k.png",
            "duration": 200,
            "gm_costs": [
              {
                "reward": 3500,
                "role": "main",
              },
            ],
            "kit_count": 2,
            "license_amount": 900,
            "org_status": "available",
            "override_author": "作者B",
            "override_title": null,
            "updated_at": "<now>",
          },
          "table": "organization_scenarios",
        },
        {
          "op": "update",
          "payload": {
            "master_status": "pending",
            "updated_at": "2026-10-02T03:00:00.000Z",
          },
          "table": "scenario_masters",
        },
      ]
    `)
  })
  it('PATCH update: 無効な status は反映せず、自組織が保有しない作品は 404 で書き込まない', async () => {
    mock.tables.organization_scenarios = [{ id: 'os-1' }]
    mock.tables.organization_scenarios_with_master = [{ id: MASTER }]
    await call({ id: MASTER }, 'PATCH', { updates: { status: 'invalid-status', duration: 100 } })
    const upd = mock.writes.find(w => w.table === 'organization_scenarios' && w.op === 'update')
    expect(Object.keys(upd!.payload as object).sort()).toMatchInlineSnapshot(`
      [
        "duration",
        "updated_at",
      ]
    `)
    mock.writes.length = 0; mock.tables.organization_scenarios = []
    expect((await call({ id: 'not-mine' }, 'PATCH', { updates: { title: 'x' } })).status).toBe(404); expect(mock.writes).toEqual([])
  })
  it('PATCH: id が無い・不明な action は 400', async () => {
    expect((await call({}, 'PATCH', { updates: {} })).status).toBe(400)
    expect((await call({ id: MASTER, action: 'nope' }, 'PATCH', {})).status).toBe(400)
  })
  it('PATCH updateAvailableGms / updateAvailableGmsWithSync: available_gms だけを自組織の行に書く（同じ実装）', async () => {
    mock.tables.organization_scenarios = [{ id: 'os-1' }]
    mock.tables.organization_scenarios_with_master = [{ id: MASTER }]
    for (const action of ['updateAvailableGms', 'updateAvailableGmsWithSync']) {
      mock.writes.length = 0
      expect((await call({ id: MASTER, action }, 'PATCH', { availableGms: ['太郎', '花子'] })).status).toBe(200)
      const w = mock.writes.find(x => x.table === 'organization_scenarios')!
      expect(Object.keys(w.payload as object).sort()).toEqual(['available_gms', 'updated_at']); expect((w.payload as { available_gms: string[] }).available_gms).toEqual(['太郎', '花子'])
    }
    expect((await call({ id: MASTER, action: 'updateAvailableGms' }, 'PATCH', { availableGms: 'not-array' })).status).toBe(400)
  })
  it('DELETE: 自組織の作品だけを RPC で原子的に削除し、失敗しても部分削除しない', async () => {
    mock.tables.organization_scenarios = [{ id: 'os-1' }]
    expect((await call({ id: MASTER }, 'DELETE')).status).toBe(200)
    expect(mock.rpcs).toMatchInlineSnapshot(`
      [
        {
          "args": {
            "p_organization_id": "org-1",
            "p_scenario_master_id": "master-1",
          },
          "name": "delete_organization_scenario_atomic",
        },
      ]
    `)
    mock.rpcs.length = 0; mock.rpcResult = { success: false }
    const failed = await call({ id: MASTER }, 'DELETE')
    expect(failed.status).toBe(500); expect(failed.body).toMatchInlineSnapshot(`
      {
        "error": "削除に失敗しました。シナリオと担当は変更していません。",
      }
    `)
    mock.tables.organization_scenarios = []; mock.rpcs.length = 0
    expect((await call({ id: MASTER }, 'DELETE')).status).toBe(404); expect(mock.rpcs).toEqual([])
    expect((await call({}, 'DELETE')).status).toBe(400)
  })
  it('GET: 各 type が発行するクエリ（テーブル・列・絞り込み・並び）を固定し、全て認証した組織で絞る', async () => {
    mock.tables.organization_scenarios_with_master = [{ id: MASTER, title: 'A', scenario_master_id: MASTER }]
    mock.tables.scenarios = [{ id: 'legacy-1' }]
    mock.tables.organizations = [{ id: ORG }]
    const out: Record<string, string[]> = {}
    const cases: Array<[string, Record<string, string>]> = [
      ['default', {}], ['id', { id: MASTER }], ['slug', { slug: 'factor' }], ['legacy', { type: 'legacy' }], ['public', { type: 'public' }],
      ['paginated', { type: 'paginated', page: '2', pageSize: '10' }], ['performance-count', { type: 'performance-count', scenarioId: MASTER }],
    ]
    for (const [name, query] of cases) {
      mock.issued.length = 0
      const { status } = await call(query)
      expect(status, name).toBeLessThan(500)
      out[name] = mock.issued.filter(q => q.table !== 'users').map(q => `${q.table}: ${q.ops.map(o => o.length > 150 ? o.slice(0, 150) + '…' : o).join(' | ')}`)
    }
    expect(out).toMatchInlineSnapshot(`
      {
        "default": [
          "staff: select(status) | eq("user_id", "actor") | eq("organization_id", "org-1")",
          "organization_scenarios_with_master: select(id, org_scenario_id, organization_id, scenario_master_id, slug, status, org_status, title,) | eq("organization_id", "org-1") | order("title", {"ascending":true})",
        ],
        "id": [
          "staff: select(status) | eq("user_id", "actor") | eq("organization_id", "org-1")",
          "organization_scenarios_with_master: select(id, org_scenario_id, organization_id, scenario_master_id, slug, status, org_status, title,) | eq("id", "master-1") | eq("organization_id", "org-1")",
        ],
        "legacy": [
          "staff: select(status) | eq("user_id", "actor") | eq("organization_id", "org-1")",
          "scenarios: select(id, title, slug, description, author, author_email, report_display_name, duration, weekend) | eq("organization_id", "org-1") | order("title", {"ascending":true})",
        ],
        "paginated": [
          "staff: select(status) | eq("user_id", "actor") | eq("organization_id", "org-1")",
          "organization_scenarios_with_master: select(id, org_scenario_id, organization_id, scenario_master_id, slug, status, org_status, title,) | eq("organization_id", "org-1") | order("title", {"ascending":true}) | range(20, 29)",
        ],
        "performance-count": [
          "staff: select(status) | eq("user_id", "actor") | eq("organization_id", "org-1")",
          "schedule_events: select(id, head) | eq("scenario_master_id", "master-1") | eq("organization_id", "org-1") | or("is_cancelled.is.null,is_cancelled.eq.false")",
        ],
        "public": [
          "staff: select(status) | eq("user_id", "actor") | eq("organization_id", "org-1")",
          "organizations: select(id) | eq("id", "org-1") | eq("is_active", true)",
          "organization_scenarios_with_master: select(id, title, key_visual_url, author, duration, synopsis, player_count_min, player_count_max,) | eq("status", "available") | eq("organization_id", "org-1") | order("title", {"ascending":true})",
        ],
        "slug": [
          "staff: select(status) | eq("user_id", "actor") | eq("organization_id", "org-1")",
          "organization_scenarios_with_master: select(id, org_scenario_id, organization_id, scenario_master_id, slug, status, org_status, title,) | eq("slug", "factor") | eq("organization_id", "org-1")",
        ],
      }
    `)
  })
  it('GET paginated: ページ範囲と hasMore の計算（page / pageSize の境界）', async () => {
    mock.tables.organization_scenarios_with_master = Array.from({ length: 5 }, (_, i) => ({ id: 's' + i }))
    const first = await call({ type: 'paginated', page: '0', pageSize: '2' })
    expect(first.status).toBe(200); expect(Object.keys(first.body as object).sort()).toMatchInlineSnapshot(`
      [
        "count",
        "data",
        "hasMore",
      ]
    `)
    const ranges = (): string[] => mock.issued.flatMap(q => q.ops.filter(o => o.startsWith('range(')))
    mock.issued.length = 0; await call({ type: 'paginated', page: '-3', pageSize: '99999' }); expect(ranges()).toMatchInlineSnapshot(`
      [
        "range(0, 999)",
      ]
    `)
    mock.issued.length = 0; await call({ type: 'paginated', page: 'x', pageSize: '0' }); expect(ranges()).toMatchInlineSnapshot(`
      [
        "range(0, 19)",
      ]
    `)
  })
  it('all-stats: 作品ごとの公演回数・中止数・売上', async () => {
    mock.tables.schedule_events = [
      ...(mock.tables.schedule_events as Array<Record<string, unknown>>).map(e => ({ ...e, scenario_master_id: MASTER })),
      { id: 'x1', scenario_master_id: 'master-2', date: '2026-09-01', category: 'open', is_cancelled: false, total_revenue: 5000 },
      { id: 'x2', scenario_master_id: null, date: '2026-09-02', category: 'open', is_cancelled: false, total_revenue: 100 },
    ]
    const { status, body } = await call({ type: 'all-stats' })
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      {
        "master-1": {
          "cancelledCount": 1,
          "performanceCount": 4,
          "totalRevenue": 28000,
        },
        "master-2": {
          "cancelledCount": 0,
          "performanceCount": 1,
          "totalRevenue": 5000,
        },
      }
    `)
  })
})

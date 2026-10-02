/**
 * api/sales.ts の主要ハンドラの出力を、固定データで固定する特性テスト（整備 Phase 3 の分割の前提、#774）。
 * 目的: ハンドラを api/_lib/sales/ に分割しても、売上・費用・CSV の数字が変わらないことを守る。
 * ここで固定する値は「分割前の現状の出力」であり、正しさの主張ではない。規則を変えたら、変えた理由と一緒に更新する。
 * 固定データは 1 組織・1 店舗・1 作品。通常公演 / GM テスト / 場所貸し / キャンセル / スタッフ参加 / 管理者追加（当日受付・demo）を含む。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const mock = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }))
vi.mock('./_lib/db.js', () => ({ db: { from: mock.from }, getMissingEnvError: () => null }))
vi.mock('./_lib/auth.js', async importOriginal => ({ ...await importOriginal<typeof import('./_lib/auth.js')>(), requireAuth: mock.auth }))
vi.mock('./_lib/compensationHistory.js', () => ({
  loadCompensationHistory: async () => () => ({
    gm_base_pay: 2000, gm_hourly_rate: 1000, gm_test_base_pay: 1000, gm_test_hourly_rate: 500, reception_fixed_pay: 1500,
    use_hourly_table: false, hourly_rates: [], gm_test_hourly_rates: [],
  }),
}))
import handler from './sales'

const ORG = 'org-1'
const STORE = 'store-1'
const MASTER = 'master-1'
const noCost = { participation_costs: null, production_costs: null, required_props: null }
const scenario = {
  id: MASTER, scenario_master_id: MASTER, title: '作品', author: '作者A', duration: 180, scenario_type: 'standard',
  participation_fee: 4000, gm_test_participation_fee: 3000, license_amount: 1000, gm_test_license_amount: 500,
  franchise_license_amount: null, franchise_gm_test_license_amount: null, external_license_amount: null, external_gm_test_license_amount: null,
  fc_receive_license_amount: null, fc_receive_gm_test_license_amount: null, fc_author_license_amount: null, fc_author_gm_test_license_amount: null,
  gm_costs: [{ role: 'main', reward: 3000 }, { role: 'sub', reward: 2000 }], ...noCost,
}
const ev = (id: string, over: Record<string, unknown>) => ({
  id, organization_id: ORG, date: '2026-09-10', start_time: '14:00:00', end_time: '17:00:00', store_id: STORE, venue: '店舗',
  scenario_master_id: MASTER, scenario: '作品', organization_scenario_id: null, category: 'open', gms: ['メイン太郎', 'サブ花子'],
  gm_roles: { メイン太郎: 'main', サブ花子: 'sub' }, capacity: 8, max_participants: 8, venue_rental_fee: null, is_cancelled: false,
  staff_assignments: [
    { staff_id: 's-taro', staff_name: 'メイン太郎', ordinal: 1, resolution_status: 'resolved' },
    { staff_id: 's-hanako', staff_name: 'サブ花子', ordinal: 2, resolution_status: 'resolved' },
  ],
  stores: { id: STORE, name: '店舗', short_name: '店', ownership_type: 'corporate', transport_allowance: 500, venue_cost_per_performance: 0 },
  ...over,
})
const events = [
  ev('e-open', {}),
  ev('e-gmtest', { date: '2026-09-11', category: 'gmtest', gms: ['メイン太郎'], gm_roles: { メイン太郎: 'main' }, staff_assignments: [{ staff_id: 's-taro', staff_name: 'メイン太郎', ordinal: 1, resolution_status: 'resolved' }] }),
  ev('e-rental', { date: '2026-09-12', category: 'venue_rental', gms: [], gm_roles: {}, staff_assignments: [], scenario_master_id: null, scenario: null, venue_rental_fee: 12000 }),
  ev('e-staff', { date: '2026-09-13', gms: ['メイン太郎', '見学次郎'], gm_roles: { メイン太郎: 'main', 見学次郎: 'observer' }, staff_assignments: [
    { staff_id: 's-taro', staff_name: 'メイン太郎', ordinal: 1, resolution_status: 'resolved' },
    { staff_id: 's-jiro', staff_name: '見学次郎', ordinal: 2, resolution_status: 'resolved' }] }),
]
const r = (event: string, over: Record<string, unknown>) => ({
  schedule_event_id: event, participant_count: 2, participant_names: ['客'], payment_method: 'online', reservation_source: 'web',
  unit_price: 4000, total_price: 8000, final_price: 8000, discount_amount: 0, status: 'confirmed', ...over,
})
const reservations = [
  r('e-open', {}),
  r('e-open', { participant_count: 1, total_price: 4000, final_price: 3000, discount_amount: 1000 }),
  r('e-open', { participant_count: 1, reservation_source: 'walk_in', unit_price: 3500, total_price: 3500, final_price: 3500 }),
  r('e-open', { participant_count: 1, participant_names: ['メイン太郎'], payment_method: 'staff', final_price: 0, total_price: 0 }),
  r('e-open', { participant_count: 3, status: 'pending' }),
  r('e-gmtest', { participant_count: 4, reservation_source: 'demo', unit_price: 3000, total_price: 12000, final_price: 12000 }),
  r('e-staff', { participant_count: 2, final_price: 7000, total_price: 8000, discount_amount: 1000 }),
]
const tables: Record<string, unknown[]> = {
  schedule_events: events, reservations, organization_scenarios_with_master: [scenario], organization_scenarios: [{ ...scenario, id: 'os-1' }],
  staff: [
    { id: 's-taro', name: 'メイン太郎', stores: [STORE], role: ['gm'] }, { id: 's-hanako', name: 'サブ花子', stores: ['other-store'], role: ['gm'] },
    { id: 's-jiro', name: '見学次郎', stores: [STORE], role: ['gm'] },
  ],
  stores: [{ id: STORE, name: '店舗', short_name: '店', ownership_type: 'corporate', transport_allowance: 500, venue_cost_per_performance: 0, organization_id: ORG, is_temporary: false, display_order: 1 }],
}

/** テーブル名に対応する固定データを返す、書き込み不可のクエリビルダ */
/** ハンドラが発行したクエリ（テーブル・列・絞り込み）。分割で SELECT の列や組織の絞り込みが変わらないことを固定する */
const issued: Array<{ table: string; ops: string[] }> = []
function builder(table: string) {
  let rows = (tables[table] ?? []).slice()
  const entry = { table, ops: [] as string[] }
  issued.push(entry)
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'or', 'not', 'is', 'in']) {
    q[m] = (...a: unknown[]) => {
      entry.ops.push(`${m}(${a.map(x => typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : JSON.stringify(x)).join(', ')})`)
      if (m === 'in' && a[0] === 'schedule_event_id') rows = rows.filter(x => (a[1] as string[]).includes((x as { schedule_event_id: string }).schedule_event_id))
      if (m === 'in' && a[0] === 'status') rows = rows.filter(x => (a[1] as string[]).includes((x as { status: string }).status))
      if (m === 'eq' && a[0] === 'is_cancelled') rows = rows.filter(x => (x as { is_cancelled: boolean }).is_cancelled === a[1])
      return q
    }
  }
  q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null })
  q.single = async () => ({ data: rows[0] ?? null, error: null })
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve)
  return q
}

async function call(type: string, extra: Record<string, string> = {}) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn(), end: vi.fn() }
  await handler({ method: 'GET', headers: { authorization: 'Bearer x' }, query: { type, start: '2026-09-01', end: '2026-09-30', ...extra } } as unknown as VercelRequest, res as unknown as VercelResponse)
  return { status: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0] }
}

beforeEach(() => {
  vi.clearAllMocks()
  issued.length = 0
  mock.auth.mockResolvedValue({ orgId: ORG, role: 'admin', userId: 'u1' })
  mock.from.mockImplementation(builder)
})

describe('api/sales.ts 主要ハンドラの出力（分割前の現状を固定）', () => {
  it('by-period: 公演ごとの売上・参加者・費用（キャンセル除外、pending は人数のみ数え売上に含めない）', async () => {
    const { status, body } = await call('by-period')
    expect(status).toBe(200)
    const byId = Object.fromEntries((body as Array<{ id: string }>).map(e => [e.id, e]))
    expect(Object.keys(byId).sort()).toEqual(['e-gmtest', 'e-open', 'e-rental', 'e-staff'])
    const pick = (e: Record<string, unknown>) => ({ revenue: e.revenue, actual_participants: e.actual_participants, has_demo_participant: e.has_demo_participant })
    expect(pick(byId['e-open'])).toMatchInlineSnapshot(`
      {
        "actual_participants": 5,
        "has_demo_participant": false,
        "revenue": 14500,
      }
    `)
    expect(pick(byId['e-gmtest'])).toMatchInlineSnapshot(`
      {
        "actual_participants": 4,
        "has_demo_participant": false,
        "revenue": 12000,
      }
    `)
    expect(pick(byId['e-rental'])).toMatchInlineSnapshot(`
      {
        "actual_participants": 0,
        "has_demo_participant": false,
        "revenue": 12000,
      }
    `)
    expect(pick(byId['e-staff'])).toMatchInlineSnapshot(`
      {
        "actual_participants": 2,
        "has_demo_participant": false,
        "revenue": 7000,
      }
    `)
  })
  it('schedule-export: CSV 用の行（GM 名の表示、費用、売上）', async () => {
    const { status, body } = await call('schedule-export')
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      [
        {
          "capacity": 8,
          "category": "open",
          "date": "2026-09-10",
          "end_time": "17:00:00",
          "gm_cost": 5500,
          "gms": "メイン太郎・サブ花子",
          "is_cancelled": false,
          "license_amount": 1000,
          "net_profit": 8000,
          "online_amount": 14500,
          "onsite_amount": 0,
          "regular_participants": 4,
          "scenario": "作品",
          "staff_participant_names": "メイン太郎",
          "staff_participants": 1,
          "start_time": "14:00:00",
          "store_name": "店",
          "total_participants": 5,
          "total_revenue": 14500,
        },
        {
          "capacity": 8,
          "category": "gmtest",
          "date": "2026-09-11",
          "end_time": "17:00:00",
          "gm_cost": 2500,
          "gms": "メイン太郎",
          "is_cancelled": false,
          "license_amount": 500,
          "net_profit": 9000,
          "online_amount": 12000,
          "onsite_amount": 0,
          "regular_participants": 4,
          "scenario": "作品",
          "staff_participant_names": "",
          "staff_participants": 0,
          "start_time": "14:00:00",
          "store_name": "店",
          "total_participants": 4,
          "total_revenue": 12000,
        },
        {
          "capacity": 8,
          "category": "venue_rental",
          "date": "2026-09-12",
          "end_time": "17:00:00",
          "gm_cost": 0,
          "gms": "",
          "is_cancelled": false,
          "license_amount": 0,
          "net_profit": 12000,
          "online_amount": 0,
          "onsite_amount": 12000,
          "regular_participants": 0,
          "scenario": "",
          "staff_participant_names": "",
          "staff_participants": 0,
          "start_time": "14:00:00",
          "store_name": "店",
          "total_participants": 0,
          "total_revenue": 12000,
        },
        {
          "capacity": 8,
          "category": "open",
          "date": "2026-09-13",
          "end_time": "17:00:00",
          "gm_cost": 3000,
          "gms": "メイン太郎",
          "is_cancelled": false,
          "license_amount": 1000,
          "net_profit": 3000,
          "online_amount": 7000,
          "onsite_amount": 0,
          "regular_participants": 2,
          "scenario": "作品",
          "staff_participant_names": "",
          "staff_participants": 0,
          "start_time": "14:00:00",
          "store_name": "店",
          "total_participants": 2,
          "total_revenue": 7000,
        },
      ]
    `)
  })
  it('annual-analysis: 年間の月別集計', async () => {
    const { status, body } = await call('annual-analysis', { start_year: '2026' })
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      [
        {
          "growthRate": null,
          "monthlyEvents": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            4,
            0,
            0,
            0,
          ],
          "monthlyRevenue": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            45500,
            0,
            0,
            0,
          ],
          "totalEvents": 4,
          "totalRevenue": 45500,
          "year": 2026,
        },
      ]
    `)
  })
  it('scenario-performance: 作品別の公演数・参加者・売上', async () => {
    const { status, body } = await call('scenario-performance')
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      [
        {
          "author": "作者A",
          "category": "open",
          "events": 2,
          "id": "master-1",
          "stores": [
            "店舗",
          ],
          "title": "作品",
        },
        {
          "author": "作者A",
          "category": "gmtest",
          "events": 1,
          "id": "master-1",
          "stores": [
            "店舗",
          ],
          "title": "作品",
        },
      ]
    `)
  })
  it('by-store: 出力を固定する', async () => {
    const { status, body } = await call('by-store')
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      [
        {
          "capacity": 8,
          "category": "open",
          "date": "2026-09-10",
          "end_time": "17:00:00",
          "gm_roles": {
            "サブ花子": "sub",
            "メイン太郎": "main",
          },
          "gms": [
            "メイン太郎",
            "サブ花子",
          ],
          "id": "e-open",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": "作品",
          "scenario_master_id": "master-1",
          "staff_assignments": [
            {
              "ordinal": 1,
              "resolution_status": "resolved",
              "staff_id": "s-taro",
              "staff_name": "メイン太郎",
            },
            {
              "ordinal": 2,
              "resolution_status": "resolved",
              "staff_id": "s-hanako",
              "staff_name": "サブ花子",
            },
          ],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": null,
        },
        {
          "capacity": 8,
          "category": "gmtest",
          "date": "2026-09-11",
          "end_time": "17:00:00",
          "gm_roles": {
            "メイン太郎": "main",
          },
          "gms": [
            "メイン太郎",
          ],
          "id": "e-gmtest",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": "作品",
          "scenario_master_id": "master-1",
          "staff_assignments": [
            {
              "ordinal": 1,
              "resolution_status": "resolved",
              "staff_id": "s-taro",
              "staff_name": "メイン太郎",
            },
          ],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": null,
        },
        {
          "capacity": 8,
          "category": "venue_rental",
          "date": "2026-09-12",
          "end_time": "17:00:00",
          "gm_roles": {},
          "gms": [],
          "id": "e-rental",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": null,
          "scenario_master_id": null,
          "staff_assignments": [],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": 12000,
        },
        {
          "capacity": 8,
          "category": "open",
          "date": "2026-09-13",
          "end_time": "17:00:00",
          "gm_roles": {
            "メイン太郎": "main",
            "見学次郎": "observer",
          },
          "gms": [
            "メイン太郎",
            "見学次郎",
          ],
          "id": "e-staff",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": "作品",
          "scenario_master_id": "master-1",
          "staff_assignments": [
            {
              "ordinal": 1,
              "resolution_status": "resolved",
              "staff_id": "s-taro",
              "staff_name": "メイン太郎",
            },
            {
              "ordinal": 2,
              "resolution_status": "resolved",
              "staff_id": "s-jiro",
              "staff_name": "見学次郎",
            },
          ],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": null,
        },
      ]
    `)
  })
  it('by-scenario: 出力を固定する', async () => {
    const { status, body } = await call('by-scenario')
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      [
        {
          "capacity": 8,
          "category": "open",
          "date": "2026-09-10",
          "end_time": "17:00:00",
          "gm_roles": {
            "サブ花子": "sub",
            "メイン太郎": "main",
          },
          "gms": [
            "メイン太郎",
            "サブ花子",
          ],
          "id": "e-open",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": "作品",
          "scenario_master_id": "master-1",
          "staff_assignments": [
            {
              "ordinal": 1,
              "resolution_status": "resolved",
              "staff_id": "s-taro",
              "staff_name": "メイン太郎",
            },
            {
              "ordinal": 2,
              "resolution_status": "resolved",
              "staff_id": "s-hanako",
              "staff_name": "サブ花子",
            },
          ],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": null,
        },
        {
          "capacity": 8,
          "category": "gmtest",
          "date": "2026-09-11",
          "end_time": "17:00:00",
          "gm_roles": {
            "メイン太郎": "main",
          },
          "gms": [
            "メイン太郎",
          ],
          "id": "e-gmtest",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": "作品",
          "scenario_master_id": "master-1",
          "staff_assignments": [
            {
              "ordinal": 1,
              "resolution_status": "resolved",
              "staff_id": "s-taro",
              "staff_name": "メイン太郎",
            },
          ],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": null,
        },
        {
          "capacity": 8,
          "category": "venue_rental",
          "date": "2026-09-12",
          "end_time": "17:00:00",
          "gm_roles": {},
          "gms": [],
          "id": "e-rental",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": null,
          "scenario_master_id": null,
          "staff_assignments": [],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": 12000,
        },
        {
          "capacity": 8,
          "category": "open",
          "date": "2026-09-13",
          "end_time": "17:00:00",
          "gm_roles": {
            "メイン太郎": "main",
            "見学次郎": "observer",
          },
          "gms": [
            "メイン太郎",
            "見学次郎",
          ],
          "id": "e-staff",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": "作品",
          "scenario_master_id": "master-1",
          "staff_assignments": [
            {
              "ordinal": 1,
              "resolution_status": "resolved",
              "staff_id": "s-taro",
              "staff_name": "メイン太郎",
            },
            {
              "ordinal": 2,
              "resolution_status": "resolved",
              "staff_id": "s-jiro",
              "staff_name": "見学次郎",
            },
          ],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": null,
        },
      ]
    `)
  })
  it('author-performance-count: 出力を固定する', async () => {
    const { status, body } = await call('author-performance-count')
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      [
        {
          "capacity": 8,
          "category": "open",
          "date": "2026-09-10",
          "end_time": "17:00:00",
          "gm_roles": {
            "サブ花子": "sub",
            "メイン太郎": "main",
          },
          "gms": [
            "メイン太郎",
            "サブ花子",
          ],
          "id": "e-open",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": "作品",
          "scenario_master_id": "master-1",
          "staff_assignments": [
            {
              "ordinal": 1,
              "resolution_status": "resolved",
              "staff_id": "s-taro",
              "staff_name": "メイン太郎",
            },
            {
              "ordinal": 2,
              "resolution_status": "resolved",
              "staff_id": "s-hanako",
              "staff_name": "サブ花子",
            },
          ],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": null,
        },
        {
          "capacity": 8,
          "category": "gmtest",
          "date": "2026-09-11",
          "end_time": "17:00:00",
          "gm_roles": {
            "メイン太郎": "main",
          },
          "gms": [
            "メイン太郎",
          ],
          "id": "e-gmtest",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": "作品",
          "scenario_master_id": "master-1",
          "staff_assignments": [
            {
              "ordinal": 1,
              "resolution_status": "resolved",
              "staff_id": "s-taro",
              "staff_name": "メイン太郎",
            },
          ],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": null,
        },
        {
          "capacity": 8,
          "category": "venue_rental",
          "date": "2026-09-12",
          "end_time": "17:00:00",
          "gm_roles": {},
          "gms": [],
          "id": "e-rental",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": null,
          "scenario_master_id": null,
          "staff_assignments": [],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": 12000,
        },
        {
          "capacity": 8,
          "category": "open",
          "date": "2026-09-13",
          "end_time": "17:00:00",
          "gm_roles": {
            "メイン太郎": "main",
            "見学次郎": "observer",
          },
          "gms": [
            "メイン太郎",
            "見学次郎",
          ],
          "id": "e-staff",
          "is_cancelled": false,
          "max_participants": 8,
          "organization_id": "org-1",
          "organization_scenario_id": null,
          "scenario": "作品",
          "scenario_master_id": "master-1",
          "staff_assignments": [
            {
              "ordinal": 1,
              "resolution_status": "resolved",
              "staff_id": "s-taro",
              "staff_name": "メイン太郎",
            },
            {
              "ordinal": 2,
              "resolution_status": "resolved",
              "staff_id": "s-jiro",
              "staff_name": "見学次郎",
            },
          ],
          "start_time": "14:00:00",
          "store_id": "store-1",
          "stores": {
            "id": "store-1",
            "name": "店舗",
            "ownership_type": "corporate",
            "short_name": "店",
            "transport_allowance": 500,
            "venue_cost_per_performance": 0,
          },
          "venue": "店舗",
          "venue_rental_fee": null,
        },
      ]
    `)
  })
  it('stores: 出力を固定する', async () => {
    const { status, body } = await call('stores')
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      [
        {
          "display_order": 1,
          "id": "store-1",
          "is_temporary": false,
          "name": "店舗",
          "organization_id": "org-1",
          "ownership_type": "corporate",
          "short_name": "店",
          "transport_allowance": 500,
          "venue_cost_per_performance": 0,
        },
      ]
    `)
  })
  it('open-event-analysis: 出力を固定する', async () => {
    const { status, body } = await call('open-event-analysis')
    expect(status).toBe(200)
    expect(body).toMatchInlineSnapshot(`
      {
        "events": [
          {
            "capacity": 8,
            "category": "open",
            "date": "2026-09-10",
            "end_time": "17:00:00",
            "gm_roles": {
              "サブ花子": "sub",
              "メイン太郎": "main",
            },
            "gms": [
              "メイン太郎",
              "サブ花子",
            ],
            "id": "e-open",
            "is_cancelled": false,
            "max_participants": 8,
            "organization_id": "org-1",
            "organization_scenario_id": null,
            "scenario": "作品",
            "scenario_master_id": "master-1",
            "staff_assignments": [
              {
                "ordinal": 1,
                "resolution_status": "resolved",
                "staff_id": "s-taro",
                "staff_name": "メイン太郎",
              },
              {
                "ordinal": 2,
                "resolution_status": "resolved",
                "staff_id": "s-hanako",
                "staff_name": "サブ花子",
              },
            ],
            "start_time": "14:00:00",
            "store_id": "store-1",
            "stores": {
              "id": "store-1",
              "name": "店舗",
              "ownership_type": "corporate",
              "short_name": "店",
              "transport_allowance": 500,
              "venue_cost_per_performance": 0,
            },
            "venue": "店舗",
            "venue_rental_fee": null,
          },
          {
            "capacity": 8,
            "category": "gmtest",
            "date": "2026-09-11",
            "end_time": "17:00:00",
            "gm_roles": {
              "メイン太郎": "main",
            },
            "gms": [
              "メイン太郎",
            ],
            "id": "e-gmtest",
            "is_cancelled": false,
            "max_participants": 8,
            "organization_id": "org-1",
            "organization_scenario_id": null,
            "scenario": "作品",
            "scenario_master_id": "master-1",
            "staff_assignments": [
              {
                "ordinal": 1,
                "resolution_status": "resolved",
                "staff_id": "s-taro",
                "staff_name": "メイン太郎",
              },
            ],
            "start_time": "14:00:00",
            "store_id": "store-1",
            "stores": {
              "id": "store-1",
              "name": "店舗",
              "ownership_type": "corporate",
              "short_name": "店",
              "transport_allowance": 500,
              "venue_cost_per_performance": 0,
            },
            "venue": "店舗",
            "venue_rental_fee": null,
          },
          {
            "capacity": 8,
            "category": "venue_rental",
            "date": "2026-09-12",
            "end_time": "17:00:00",
            "gm_roles": {},
            "gms": [],
            "id": "e-rental",
            "is_cancelled": false,
            "max_participants": 8,
            "organization_id": "org-1",
            "organization_scenario_id": null,
            "scenario": null,
            "scenario_master_id": null,
            "staff_assignments": [],
            "start_time": "14:00:00",
            "store_id": "store-1",
            "stores": {
              "id": "store-1",
              "name": "店舗",
              "ownership_type": "corporate",
              "short_name": "店",
              "transport_allowance": 500,
              "venue_cost_per_performance": 0,
            },
            "venue": "店舗",
            "venue_rental_fee": 12000,
          },
          {
            "capacity": 8,
            "category": "open",
            "date": "2026-09-13",
            "end_time": "17:00:00",
            "gm_roles": {
              "メイン太郎": "main",
              "見学次郎": "observer",
            },
            "gms": [
              "メイン太郎",
              "見学次郎",
            ],
            "id": "e-staff",
            "is_cancelled": false,
            "max_participants": 8,
            "organization_id": "org-1",
            "organization_scenario_id": null,
            "scenario": "作品",
            "scenario_master_id": "master-1",
            "staff_assignments": [
              {
                "ordinal": 1,
                "resolution_status": "resolved",
                "staff_id": "s-taro",
                "staff_name": "メイン太郎",
              },
              {
                "ordinal": 2,
                "resolution_status": "resolved",
                "staff_id": "s-jiro",
                "staff_name": "見学次郎",
              },
            ],
            "start_time": "14:00:00",
            "store_id": "store-1",
            "stores": {
              "id": "store-1",
              "name": "店舗",
              "ownership_type": "corporate",
              "short_name": "店",
              "transport_allowance": 500,
              "venue_cost_per_performance": 0,
            },
            "venue": "店舗",
            "venue_rental_fee": null,
          },
        ],
        "reservations": [
          {
            "discount_amount": 0,
            "final_price": 8000,
            "participant_count": 2,
            "participant_names": [
              "客",
            ],
            "payment_method": "online",
            "reservation_source": "web",
            "schedule_event_id": "e-open",
            "status": "confirmed",
            "total_price": 8000,
            "unit_price": 4000,
          },
          {
            "discount_amount": 1000,
            "final_price": 3000,
            "participant_count": 1,
            "participant_names": [
              "客",
            ],
            "payment_method": "online",
            "reservation_source": "web",
            "schedule_event_id": "e-open",
            "status": "confirmed",
            "total_price": 4000,
            "unit_price": 4000,
          },
          {
            "discount_amount": 0,
            "final_price": 3500,
            "participant_count": 1,
            "participant_names": [
              "客",
            ],
            "payment_method": "online",
            "reservation_source": "walk_in",
            "schedule_event_id": "e-open",
            "status": "confirmed",
            "total_price": 3500,
            "unit_price": 3500,
          },
          {
            "discount_amount": 0,
            "final_price": 0,
            "participant_count": 1,
            "participant_names": [
              "メイン太郎",
            ],
            "payment_method": "staff",
            "reservation_source": "web",
            "schedule_event_id": "e-open",
            "status": "confirmed",
            "total_price": 0,
            "unit_price": 4000,
          },
          {
            "discount_amount": 0,
            "final_price": 8000,
            "participant_count": 3,
            "participant_names": [
              "客",
            ],
            "payment_method": "online",
            "reservation_source": "web",
            "schedule_event_id": "e-open",
            "status": "pending",
            "total_price": 8000,
            "unit_price": 4000,
          },
          {
            "discount_amount": 0,
            "final_price": 12000,
            "participant_count": 4,
            "participant_names": [
              "客",
            ],
            "payment_method": "online",
            "reservation_source": "demo",
            "schedule_event_id": "e-gmtest",
            "status": "confirmed",
            "total_price": 12000,
            "unit_price": 3000,
          },
          {
            "discount_amount": 1000,
            "final_price": 7000,
            "participant_count": 2,
            "participant_names": [
              "客",
            ],
            "payment_method": "online",
            "reservation_source": "web",
            "schedule_event_id": "e-staff",
            "status": "confirmed",
            "total_price": 8000,
            "unit_price": 4000,
          },
        ],
      }
    `)
  })
  for (const type of ['by-store', 'by-scenario', 'author-performance-count', 'by-period', 'schedule-export']) {
    it(`${type}: 発行するクエリは必ず認証した組織で絞る`, async () => {
      await call(type)
      expect(issued.length).toBeGreaterThan(0)
      for (const q of issued) {
        // 全テーブルが組織で絞られている（organization_id）。例外は無い
        expect(q.ops.some(o => o.startsWith('eq(organization_id, ' + ORG + ')') || o.startsWith('eq(organization_id, "' + ORG + '")')), `${q.table}: ${q.ops.join(' | ')}`).toBe(true)
      }
    })
  }
  it('by-store / by-scenario / author-performance-count が発行するクエリ（テーブルと列と絞り込み）を固定する', async () => {
    const out: Record<string, string[]> = {}
    for (const type of ['by-store', 'by-scenario', 'author-performance-count']) {
      issued.length = 0
      await call(type)
      out[type] = issued.map(q => `${q.table}: ${q.ops.map(o => o.length > 160 ? o.slice(0, 160) + '…' : o).join(' | ')}`)
    }
    expect(out).toMatchInlineSnapshot(`
      {
        "author-performance-count": [
          "schedule_events: select(date, scenario_masters:scenario_master_id ( id, title, author )) | eq(organization_id, org-1) | gte(date, 2026-09-01) | lte(date, 2026-09-30) | eq(is_cancelled, false)",
        ],
        "by-scenario": [
          "schedule_events: select(*, stores:store_id ( id, name, short_name ), scenario_masters:scenario_master_id ( id, title, author, duration ), organization_scenarios:organization_sce… | eq(organization_id, org-1) | gte(date, 2026-09-01) | lte(date, 2026-09-30) | eq(is_cancelled, false)",
        ],
        "by-store": [
          "schedule_events: select(*, stores:store_id ( id, name, short_name ), scenario_masters:scenario_master_id ( id, title, author, duration ), organization_scenarios:organization_sce… | eq(organization_id, org-1) | gte(date, 2026-09-01) | lte(date, 2026-09-30) | eq(is_cancelled, false)",
        ],
      }
    `)
  })
  it('type が無い・未対応・顧客権限は拒否する', async () => {
    expect((await call('')).status).toBe(400)
    expect((await call('unknown-type')).status).toBe(400)
    mock.auth.mockResolvedValue({ orgId: ORG, role: 'customer', userId: 'u2' })
    expect((await call('by-period')).status).toBe(403)
  })
})

/**
 * 公演の下書き自動作成（QW-20261113-001）の API。
 * 読み取りはログイン中のスタッフの組織で必ず絞る。固定枠の保存は管理者（admin）だけで、他組織の店舗には書かない。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const mock = vi.hoisted(() => ({
  role: 'admin' as string,
  storeFound: true,
  calls: [] as Array<{ table: string; op: string; filters: Array<[string, string, unknown]>; payload?: unknown; range?: [number, number] }>,
  rows: {} as Record<string, unknown[]>,
}))

vi.mock('./_lib/db.js', () => ({
  getMissingEnvError: () => null,
  db: {
    from: (table: string) => {
      const call = { table, op: 'select', filters: [] as Array<[string, string, unknown]>, payload: undefined as unknown, range: undefined as [number, number] | undefined }
      mock.calls.push(call)
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.upsert = (p: unknown) => { call.op = 'upsert'; call.payload = p; return q }
      q.delete = () => { call.op = 'delete'; return q }
      for (const m of ['eq', 'gte', 'lte', 'in']) q[m] = (col: string, val: unknown) => { call.filters.push([m, col, val]); return q }
      q.limit = () => q
      q.order = () => q
      q.range = (from: number, to: number) => { call.range = [from, to]; return q }
      q.maybeSingle = async () => ({ data: table === 'stores' && mock.storeFound ? { id: 's1' } : null, error: null })
      q.then = (resolve: (v: unknown) => unknown) => {
        const rows = mock.rows[table] ?? []
        return Promise.resolve({ data: call.range ? rows.slice(call.range[0], call.range[1] + 1) : rows, error: null }).then(resolve)
      }
      return q
    },
  },
}))
vi.mock('./_lib/auth.js', () => ({
  requireAuth: async () => ({ orgId: 'org-1', userId: 'user-1', role: mock.role, jwt: 'user-jwt' }),
  requireStaff: () => {},
  requireAdmin: () => {},
  ApiError: class extends Error { constructor(public status: number, m: string) { super(m) } },
  createUserScopedClient: () => ({ rpc: vi.fn() }),
}))
import handler from './schedule'

async function call(method: string, query: Record<string, string>, body?: unknown) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn(), end: vi.fn() }
  await handler({ method, headers: { authorization: 'Bearer x' }, query, body } as unknown as VercelRequest, res as unknown as VercelResponse)
  return { status: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0] }
}

beforeEach(() => {
  mock.role = 'admin'
  mock.storeFound = true
  mock.calls.length = 0
  mock.rows = {}
})

describe('GET /api/schedule?type=auto-draft-data', () => {
  it('すべての読み取りを自分の組織で絞り、GMの人数は在籍スタッフを作品ごとに数える', async () => {
    mock.rows.staff_scenario_assignments = [
      { scenario_master_id: 'a', staff_id: 'st1' },
      { scenario_master_id: 'a', staff_id: 'st2' },
      { scenario_master_id: 'b', staff_id: 'st1' },
    ]
    const { status, body } = await call('GET', { type: 'auto-draft-data', start: '2026-11-24', end: '2027-01-07', demand_from: '2026-07-16', demand_to: '2026-11-13' })
    expect(status).toBe(200)
    expect(body.main_gm_counts).toEqual({ a: 2, b: 1 })
    const tables = mock.calls.map(c => c.table)
    expect(tables).toEqual(expect.arrayContaining(['schedule_slot_rules', 'organization_scenarios_with_master', 'staff_scenario_assignments', 'schedule_events', 'schedule_blocked_slots']))
    for (const c of mock.calls) {
      expect(c.filters).toContainEqual(['eq', 'organization_id', 'org-1'])
    }
    const gmCall = mock.calls.find(c => c.table === 'staff_scenario_assignments')!
    expect(gmCall.filters).toContainEqual(['eq', 'staff.status', 'active'])
    expect(gmCall.filters).toContainEqual(['eq', 'can_main_gm', true])
  })

  it('1000 件を超える公演もページごとに読んで欠けずに返す', async () => {
    mock.rows.schedule_events = Array.from({ length: 2300 }, (_, i) => ({ date: '2026-12-01', store_id: 's1', scenario_master_id: `m${i}` }))
    const { status, body } = await call('GET', { type: 'auto-draft-data', start: '2026-11-24', end: '2027-01-07', demand_from: '2026-07-16', demand_to: '2026-11-13' })
    expect(status).toBe(200)
    expect(body.nearby_events).toHaveLength(2300)
    expect(body.demand_events).toHaveLength(2300)
    const ranges = mock.calls.filter(c => c.table === 'schedule_events').map(c => c.range)
    expect(ranges).toEqual(expect.arrayContaining([[0, 999], [1000, 1999], [2000, 2999]]))
  })

  it('定員が capacity にだけある公演も、作品の定員 → max_participants → capacity の順で定員を補って返す', async () => {
    mock.rows.organization_scenarios_with_master = [{ id: 'a', player_count_max: 7 }]
    mock.rows.schedule_events = [
      { date: '2026-12-01', scenario_master_id: 'a', max_participants: null, capacity: 6, current_participants: 6 },
      { date: '2026-12-02', scenario_master_id: 'z', max_participants: null, capacity: 6, current_participants: 6 },
      { date: '2026-12-03', scenario_master_id: 'z', max_participants: 5, capacity: 6, current_participants: 5 },
    ]
    const { body } = await call('GET', { type: 'auto-draft-data', start: '2026-11-24', end: '2027-01-07', demand_from: '2026-07-16', demand_to: '2026-11-13' })
    expect(body.demand_events.map((e: { max_participants: number }) => e.max_participants)).toEqual([7, 6, 5])
    expect(body.demand_events[0]).not.toHaveProperty('capacity')
  })

  it('日付の形が違えば 400', async () => {
    const { status } = await call('GET', { type: 'auto-draft-data', start: '2026/11/24', end: '2027-01-07', demand_from: '2026-07-16', demand_to: '2026-11-13' })
    expect(status).toBe(400)
  })
})

describe('PATCH /api/schedule?action=auto-draft-rules', () => {
  const cells = [
    { weekday: 5, time_slot: 'evening', is_open: true },
    { weekday: 7, time_slot: 'morning', is_open: false },
    { weekday: 1, time_slot: 'afternoon', is_open: null },
  ]

  it('開ける・開けないは自分の組織で保存し、未設定の枠は消す', async () => {
    const { status } = await call('PATCH', { action: 'auto-draft-rules' }, { store_id: 's1', cells })
    expect(status).toBe(200)
    const upsert = mock.calls.find(c => c.op === 'upsert')!
    expect(upsert.payload).toEqual([
      expect.objectContaining({ organization_id: 'org-1', store_id: 's1', weekday: 5, time_slot: 'evening', is_open: true }),
      expect.objectContaining({ organization_id: 'org-1', store_id: 's1', weekday: 7, time_slot: 'morning', is_open: false }),
    ])
    const del = mock.calls.find(c => c.op === 'delete')!
    expect(del.filters).toEqual([
      ['eq', 'organization_id', 'org-1'], ['eq', 'store_id', 's1'], ['eq', 'weekday', 1], ['eq', 'time_slot', 'afternoon'],
    ])
  })

  it.each(['staff', 'license_admin'])('%s は保存できない（403）', async role => {
    mock.role = role
    const { status } = await call('PATCH', { action: 'auto-draft-rules' }, { store_id: 's1', cells })
    expect(status).toBe(403)
    expect(mock.calls.some(c => c.op === 'upsert' || c.op === 'delete')).toBe(false)
  })

  it('他組織の店舗には書かない（403）', async () => {
    mock.storeFound = false
    const { status } = await call('PATCH', { action: 'auto-draft-rules' }, { store_id: 'foreign', cells })
    expect(status).toBe(403)
    expect(mock.calls.some(c => c.op === 'upsert' || c.op === 'delete')).toBe(false)
  })

  it.each([
    [{ store_id: 's1', cells: [{ weekday: 8, time_slot: 'evening', is_open: true }] }],
    [{ store_id: 's1', cells: [{ weekday: 1, time_slot: 'night', is_open: true }] }],
    [{ store_id: 's1', cells: [{ weekday: 1, time_slot: 'evening', is_open: 'yes' }] }],
    [{ store_id: 's1', cells: [] }],
    [{ cells }],
  ])('形が違う入力は 400 で保存しない', async body => {
    const { status } = await call('PATCH', { action: 'auto-draft-rules' }, body)
    expect(status).toBe(400)
    expect(mock.calls.some(c => c.op === 'upsert' || c.op === 'delete')).toBe(false)
  })
})

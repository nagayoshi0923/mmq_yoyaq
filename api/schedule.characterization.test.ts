/**
 * api/schedule.ts の書き込み系ハンドラの出力と書き込みペイロードを、固定データで固定する特性テスト（整備 Phase 3 の分割の前提、#774）。
 * 既存の api/schedule-capacity.test.ts は定員超過の 4 件だけ。ここはその外側: create / update / toggle-cancel / delete と、
 * デモ参加者の追加・削除（表示人数の規則 #730 に直結する）。固定する値は「分割前の現状の出力」であり、正しさの主張ではない。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type Write = { table: string; op: string; payload: unknown; filters: string[] }
const mock = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  writes: [] as Write[],
  insertErrors: [] as Array<{ code?: string; message: string }>,   // 1 回目から順に返すエラー（無ければ成功）
  updateError: null as null | { code?: string; message: string },
  deletedRows: [{ id: 'e1' }] as unknown[],
}))
vi.mock('./_lib/db.js', () => ({
  getMissingEnvError: () => null,
  db: {
    from: (table: string) => {
      let op = 'select'; let payload: unknown = null
      const filters: string[] = []
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.insert = (p: unknown) => { op = 'insert'; payload = p; return q }
      q.update = (p: unknown) => { op = 'update'; payload = p; return q }
      q.delete = () => { op = 'delete'; return q }
      for (const m of ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'or', 'not', 'is', 'in']) {
        q[m] = (...a: unknown[]) => { filters.push(`${m}(${a.map(x => JSON.stringify(x)).join(',')})`); return q }
      }
      const rows = () => { const t = mock.tables[table]; return Array.isArray(t) ? t : t == null ? [] : [t] }
      const result = () => {
        if (op !== 'select') mock.writes.push({ table, op, payload, filters: filters.slice() })
        if (op === 'insert' && table === 'schedule_events') {
          const err = mock.insertErrors.shift()
          return err ? { data: null, error: err } : { data: { id: 'new-event' }, error: null }
        }
        if (op === 'update' && table === 'schedule_events' && mock.updateError) return { data: null, error: mock.updateError }
        if (op === 'delete' && table === 'schedule_events') return { data: mock.deletedRows, error: null }
        if (op === 'delete') return { data: rows().map((r, i) => ({ id: 'd' + i, r })), error: null }
        if (op === 'insert') return { data: { id: 'new' }, error: null }
        return { data: rows(), error: null }
      }
      q.single = q.maybeSingle = async () => { const r = result(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error } }
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
      return q
    },
  },
}))
vi.mock('./_lib/auth.js', () => ({
  requireAuth: async () => ({ orgId: 'org-1', userId: 'user-1', role: 'staff' }),
  requireStaff: () => {}, requireAdmin: () => {}, ApiError: class extends Error { constructor(public status: number, m: string) { super(m) } },
}))
import handler from './schedule'

async function call(query: Record<string, string>, method: string, body?: Record<string, unknown>) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn(), end: vi.fn() }
  await handler({ method, headers: { authorization: 'Bearer x' }, query, body } as unknown as VercelRequest, res as unknown as VercelResponse)
  return { status: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0] }
}
const stripNow = (w: Write): Write => w.payload && typeof w.payload === 'object' && !Array.isArray(w.payload) && 'updated_at' in (w.payload as object)
  ? { ...w, payload: { ...(w.payload as Record<string, unknown>), updated_at: '<now>' } } : w

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T03:00:00Z'))
  mock.writes.length = 0; mock.insertErrors = []; mock.updateError = null; mock.deletedRows = [{ id: 'e1' }]
  mock.tables = {
    stores: { id: 's1', organization_id: 'org-1' },
    organization_scenarios: { id: 'os-1' },
    scenario_import_aliases: [],
    scenario_masters: [{ id: 'm1', title: '戦塵のレガストリア' }],
    schedule_events: { id: 'e1', organization_id: 'org-1', store_id: 's1', max_participants: null, capacity: 8, current_participants: 3 },
  }
})
afterEach(() => { vi.useRealTimers() })

const createBody = { date: '2026-11-01', store_id: 's1', category: 'open', start_time: '14:00:00', end_time: '17:00:00' }

describe('api/schedule.ts 書き込み系（分割前の現状を固定）', () => {
  it('POST create: 許可リストの列だけを入れ、組織は認証した組織を強制する（クライアント指定の組織・未許可の列は無視）', async () => {
    const { status } = await call({}, 'POST', { ...createBody, organization_id: 'foreign-org', current_participants: 99, secret: 'x', capacity: 6, notes: 'メモ' })
    expect(status).toBe(201)
    expect(mock.writes.find(w => w.table === 'schedule_events' && w.op === 'insert')).toMatchInlineSnapshot(`
      {
        "filters": [],
        "op": "insert",
        "payload": [
          {
            "capacity": 6,
            "category": "open",
            "date": "2026-11-01",
            "end_time": "17:00:00",
            "notes": "メモ",
            "organization_id": "org-1",
            "start_time": "14:00:00",
            "store_id": "s1",
          },
        ],
        "table": "schedule_events",
      }
    `)
  })
  it('POST create: 必須項目の欠落は 400、店舗が無い・他組織なら 404 / 403 で、どれも書き込まない', async () => {
    expect((await call({}, 'POST', { date: '2026-11-01' })).status).toBe(400)
    mock.tables.stores = null; expect((await call({}, 'POST', createBody)).status).toBe(404)
    mock.tables.stores = { id: 's1', organization_id: 'other-org' }; expect((await call({}, 'POST', createBody)).status).toBe(403)
    expect(mock.writes.filter(w => w.table === 'schedule_events')).toEqual([])
  })
  it('POST create: シナリオ名からマスターを自動で紐付け（正規化: 先頭の「貸・」「募・」や末尾の括弧を除く）、自組織の作品 ID も入れる', async () => {
    await call({}, 'POST', { ...createBody, scenario: '貸・戦塵のレガストリア（仮）' })
    expect((mock.writes.find(w => w.table === 'schedule_events')!.payload as Array<Record<string, unknown>>)[0]).toMatchInlineSnapshot(`
      {
        "category": "open",
        "date": "2026-11-01",
        "end_time": "17:00:00",
        "organization_id": "org-1",
        "organization_scenario_id": "os-1",
        "scenario": "戦塵のレガストリア",
        "scenario_master_id": "m1",
        "start_time": "14:00:00",
        "store_id": "s1",
      }
    `)
  })
  it('POST create: 不正なカテゴリは open に直す', async () => {
    await call({}, 'POST', { ...createBody, category: 'weird' })
    expect((mock.writes.find(w => w.table === 'schedule_events')!.payload as Array<{ category: string }>)[0].category).toBe('open')
  })
  it('POST create: 存在しない列のエラーは、その列を除いて最大 3 回リトライする', async () => {
    mock.insertErrors = [{ message: 'Could not find the \'notes\' column of \'schedule_events\' in the schema cache' }]
    expect((await call({}, 'POST', { ...createBody, notes: 'メモ', capacity: 6 })).status).toBe(201)
    const inserts = mock.writes.filter(w => w.table === 'schedule_events' && w.op === 'insert').map(w => Object.keys((w.payload as Array<object>)[0]).sort())
    expect(inserts).toMatchInlineSnapshot(`
      [
        [
          "capacity",
          "category",
          "date",
          "end_time",
          "notes",
          "organization_id",
          "start_time",
          "store_id",
        ],
        [
          "capacity",
          "category",
          "date",
          "end_time",
          "organization_id",
          "start_time",
          "store_id",
        ],
      ]
    `)
  })
  it('POST create: 制約違反（23514）は 400、その他の失敗は 500', async () => {
    mock.insertErrors = [{ code: '23514', message: '制約違反' }]
    expect((await call({}, 'POST', createBody)).status).toBe(400)
    mock.insertErrors = [{ code: 'XX000', message: 'boom' }]
    expect((await call({}, 'POST', createBody)).status).toBe(500)
  })
  it('PATCH update: 許可リストの列だけを更新し、updated_at を付け、自組織の行に限定する。組織・current_participants は書けない', async () => {
    expect((await call({ id: 'e1' }, 'PATCH', { notes: '更新', organization_id: 'foreign', current_participants: 50, gms: ['太郎'] })).status).toBe(200)
    expect(stripNow(mock.writes.find(w => w.table === 'schedule_events' && w.op === 'update')!)).toMatchInlineSnapshot(`
      {
        "filters": [
          "eq("id","e1")",
          "eq("organization_id","org-1")",
        ],
        "op": "update",
        "payload": {
          "gms": [
            "太郎",
          ],
          "notes": "更新",
          "updated_at": "<now>",
        },
        "table": "schedule_events",
      }
    `)
  })
  it('PATCH update: expected_updated_at で競合を検出する（更新対象 0 件なら 409）', async () => {
    mock.updateError = { code: 'PGRST116', message: 'no rows' }
    const r = await call({ id: 'e1', expected_updated_at: '2026-10-01T00:00:00Z' }, 'PATCH', { notes: 'x' })
    expect(r.status).toBe(409)
    expect(mock.writes.find(w => w.op === 'update')!.filters).toContain('eq("updated_at","2026-10-01T00:00:00Z")')
  })
  it('PATCH update: id なし・更新可能な列なし・存在しない・他組織は、それぞれ 400 / 400 / 404 / 403', async () => {
    expect((await call({}, 'PATCH', { notes: 'x' })).status).toBe(400)
    expect((await call({ id: 'e1' }, 'PATCH', { unknown: 'x' })).status).toBe(400)
    mock.tables.schedule_events = null; expect((await call({ id: 'e1' }, 'PATCH', { notes: 'x' })).status).toBe(404)
    mock.tables.schedule_events = { id: 'e1', organization_id: 'other', store_id: 's1' }; expect((await call({ id: 'e1' }, 'PATCH', { notes: 'x' })).status).toBe(403)
  })
  it('PATCH update: 移動先の店舗が他組織なら 403 で更新しない', async () => {
    mock.tables.stores = { id: 's2', organization_id: 'other-org' }
    expect((await call({ id: 'e1' }, 'PATCH', { store_id: 's2' })).status).toBe(403)
    expect(mock.writes.filter(w => w.op === 'update')).toEqual([])
  })
  it('toggle-cancel: 中止は is_cancelled / cancellation_reason / cancelled_at を設定し、復活は全て空にする', async () => {
    await call({ id: 'e1', action: 'toggle-cancel' }, 'PATCH', { is_cancelled: true, cancellation_reason: '人数未達' })
    const cancel = mock.writes.find(w => w.table === 'schedule_events' && w.op === 'update')!
    mock.writes.length = 0
    await call({ id: 'e1', action: 'toggle-cancel' }, 'PATCH', { is_cancelled: false, cancellation_reason: '無視される' })
    expect([cancel, mock.writes.find(w => w.table === 'schedule_events' && w.op === 'update')!]).toMatchInlineSnapshot(`
      [
        {
          "filters": [
            "eq("id","e1")",
            "eq("organization_id","org-1")",
          ],
          "op": "update",
          "payload": {
            "cancellation_reason": "人数未達",
            "cancelled_at": "2026-10-02T03:00:00.000Z",
            "is_cancelled": true,
          },
          "table": "schedule_events",
        },
        {
          "filters": [
            "eq("id","e1")",
            "eq("organization_id","org-1")",
          ],
          "op": "update",
          "payload": {
            "cancellation_reason": null,
            "cancelled_at": null,
            "is_cancelled": false,
          },
          "table": "schedule_events",
        },
      ]
    `)
  })
  it('DELETE: 自組織の公演だけ削除し（204）、削除 0 件は 409、他組織は 403', async () => {
    expect((await call({ id: 'e1' }, 'DELETE')).status).toBe(204)
    expect(mock.writes.find(w => w.op === 'delete')).toMatchInlineSnapshot(`
      {
        "filters": [
          "eq("id","e1")",
          "eq("organization_id","org-1")",
        ],
        "op": "delete",
        "payload": null,
        "table": "schedule_events",
      }
    `)
    mock.deletedRows = []; expect((await call({ id: 'e1' }, 'DELETE')).status).toBe(409)
    mock.tables.schedule_events = { id: 'e1', organization_id: 'other' }; expect((await call({ id: 'e1' }, 'DELETE')).status).toBe(403)
  })
  it('remove-demo-reservations: 自組織のデモ予約だけを削除して件数を返す', async () => {
    mock.tables.reservations = [{ id: 'r1' }, { id: 'r2' }]
    const { status, body } = await call({ action: 'remove-demo-reservations' }, 'POST')
    expect(status).toBe(200); expect(body).toEqual({ success: true, deletedCount: 2 })
    expect(mock.writes.find(w => w.table === 'reservations' && w.op === 'delete')!.filters).toMatchInlineSnapshot(`
      [
        "eq("reservation_source","demo")",
        "eq("organization_id","org-1")",
      ]
    `)
  })
  it('add-demo-participants: 定員との差の人数だけ、参加費 × 人数のデモ予約を 1 件作り、表示人数を予約の合計で更新する', async () => {
    mock.tables.schedule_events = [{ id: 'e1', organization_id: 'org-1', scenario_master_id: 'm1', scenario: '作品', store_id: 's1', date: '2026-11-01', start_time: '14:00:00', category: 'open', gms: ['太郎'], capacity: 8, max_participants: null }]
    mock.tables.reservations = [{ participant_count: 3, participant_names: ['客'] }]
    mock.tables.organization_scenarios = { id: 'os-1', participation_fee: 4000, gm_test_participation_fee: 3000 }
    mock.tables.scenario_masters = { id: 'm1', title: '戦塵のレガストリア', official_duration: 180 }
    const { status, body } = await call({ action: 'add-demo-participants' }, 'POST')
    expect(status).toBe(200); expect(body).toMatchInlineSnapshot(`
      {
        "errorCount": 0,
        "message": "デモ参加者追加完了: 成功1件, エラー0件",
        "success": true,
        "successCount": 1,
      }
    `)
    const insert = mock.writes.find(w => w.table === 'reservations' && w.op === 'insert')!
    const p = insert.payload as Record<string, unknown>
    expect({ participant_count: p.participant_count, reservation_source: p.reservation_source, status: p.status, total_price: p.total_price, final_price: p.final_price, organization_id: p.organization_id }).toMatchInlineSnapshot(`
      {
        "final_price": 20000,
        "organization_id": "org-1",
        "participant_count": 5,
        "reservation_source": "demo",
        "status": "confirmed",
        "total_price": 20000,
      }
    `)
    expect(mock.writes.find(w => w.table === 'schedule_events' && w.op === 'update')).toMatchInlineSnapshot(`
      {
        "filters": [
          "eq("id","e1")",
          "eq("organization_id","org-1")",
        ],
        "op": "update",
        "payload": {
          "current_participants": 3,
        },
        "table": "schedule_events",
      }
    `)
  })
  it('add-demo-participants: 既にデモ参加者がいる・満席の公演には追加しない', async () => {
    mock.tables.schedule_events = [{ id: 'e1', organization_id: 'org-1', scenario_master_id: 'm1', scenario: '作品', store_id: 's1', date: '2026-11-01', start_time: '14:00:00', category: 'open', gms: [], capacity: 8, max_participants: null }]
    mock.tables.reservations = [{ participant_count: 3, participant_names: ['デモ参加者'] }]
    await call({ action: 'add-demo-participants' }, 'POST')
    expect(mock.writes.filter(w => w.table === 'reservations')).toEqual([])
    mock.tables.reservations = [{ participant_count: 8, participant_names: ['客'] }]
    await call({ action: 'add-demo-participants' }, 'POST')
    expect(mock.writes.filter(w => w.table === 'reservations')).toEqual([])
  })
})

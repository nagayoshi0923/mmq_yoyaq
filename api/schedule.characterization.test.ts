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
      for (const m of ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'order', 'limit', 'range', 'or', 'not', 'is', 'in', 'contains']) {
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

describe('api/schedule.ts by-month（カレンダーの表示人数と貸切の合成。分割前の現状を固定）', () => {
  const evt = (id: string, over: Record<string, unknown>) => ({
    id, date: '2026-11-05', start_time: '14:00:00', category: 'open', is_cancelled: false, current_participants: 0, scenario_master_id: 'm1', scenario: '作品',
    scenario_masters: null, max_participants: null, capacity: 8, ...over,
  })
  const r = (event: string, over: Record<string, unknown>) => ({ schedule_event_id: event, participant_count: 2, status: 'confirmed', candidate_datetimes: null, reservation_source: 'web', ...over })
  const summarize = (body: unknown) => (body as Array<Record<string, unknown>>).map(e => ({ id: e.id, current: e.current_participants, max: e.max_participants, timeSlot: e.timeSlot, private: e.is_private_booking }))

  beforeEach(() => {
    mock.tables.organization_scenarios_with_master = [{ id: 'm1', title: '作品', player_count_max: 6 }]
    mock.tables.staff = []
  })
  it('実人数は有効な予約状態（pending / confirmed / gm_confirmed / checked_in）の合計で、キャンセル済みの予約は数えず、定員（作品の player_count_max）で頭打ちにする', async () => {
    mock.tables.schedule_events = [evt('e-sum', {}), evt('e-capped', { date: '2026-11-06' }), evt('e-cancelled-res', { date: '2026-11-07' })]
    mock.tables.reservations = [
      r('e-sum', { participant_count: 1, status: 'pending' }), r('e-sum', { participant_count: 1, status: 'confirmed' }), r('e-sum', { participant_count: 1, status: 'gm_confirmed' }),
      r('e-sum', { participant_count: 1, status: 'checked_in' }), r('e-sum', { participant_count: 5, status: 'cancelled' }),
      r('e-capped', { participant_count: 5 }), r('e-capped', { participant_count: 4 }),
      r('e-cancelled-res', { participant_count: 3, status: 'cancelled' }),
    ]
    const { status, body } = await call({ type: 'by-month', year: '2026', month: '11' }, 'GET')
    expect(status).toBe(200); expect(summarize(body)).toMatchInlineSnapshot(`
      [
        {
          "current": 4,
          "id": "e-sum",
          "max": 6,
          "private": false,
          "timeSlot": undefined,
        },
        {
          "current": 6,
          "id": "e-capped",
          "max": 6,
          "private": false,
          "timeSlot": undefined,
        },
        {
          "current": 0,
          "id": "e-cancelled-res",
          "max": 6,
          "private": false,
          "timeSlot": undefined,
        },
      ]
    `)
  })
  it('予約が 1 件も無い公演は DB の表示人数（current_participants）を使い、定員で頭打ち。定員は 作品 ID → 作品名 → マスター結合 → 公演の項目 → 8 の順に決まる', async () => {
    mock.tables.schedule_events = [
      evt('e-nores', { current_participants: 4 }),
      evt('e-nores-over', { date: '2026-11-06', current_participants: 9 }),
      evt('e-by-title', { date: '2026-11-07', scenario_master_id: null, scenario: '作品', current_participants: 5 }),
      evt('e-by-join', { date: '2026-11-08', scenario_master_id: null, scenario: '別作品', scenario_masters: { player_count_max: 7 }, current_participants: 7 }),
      evt('e-by-event', { date: '2026-11-09', scenario_master_id: null, scenario: '不明', max_participants: 5, current_participants: 6 }),
      evt('e-default', { date: '2026-11-10', scenario_master_id: null, scenario: '不明', max_participants: null, capacity: null, current_participants: 20 }),
    ]
    mock.tables.reservations = []
    expect(summarize((await call({ type: 'by-month', year: '2026', month: '11' }, 'GET')).body)).toMatchInlineSnapshot(`
      [
        {
          "current": 4,
          "id": "e-nores",
          "max": 6,
          "private": false,
          "timeSlot": undefined,
        },
        {
          "current": 6,
          "id": "e-nores-over",
          "max": 6,
          "private": false,
          "timeSlot": undefined,
        },
        {
          "current": 5,
          "id": "e-by-title",
          "max": 6,
          "private": false,
          "timeSlot": undefined,
        },
        {
          "current": 7,
          "id": "e-by-join",
          "max": 7,
          "private": false,
          "timeSlot": undefined,
        },
        {
          "current": 5,
          "id": "e-by-event",
          "max": 5,
          "private": false,
          "timeSlot": undefined,
        },
        {
          "current": 8,
          "id": "e-default",
          "max": 8,
          "private": false,
          "timeSlot": undefined,
        },
      ]
    `)
  })
  it('中止された公演は、予約の合計（状態を問わない）と DB の表示人数（定員まで）の大きいほうを表示する', async () => {
    mock.tables.schedule_events = [evt('e-cancel-a', { is_cancelled: true, current_participants: 2 }), evt('e-cancel-b', { date: '2026-11-06', is_cancelled: true, current_participants: 5 })]
    mock.tables.reservations = [r('e-cancel-a', { participant_count: 4, status: 'cancelled' }), r('e-cancel-b', { participant_count: 1, status: 'cancelled' })]
    expect(summarize((await call({ type: 'by-month', year: '2026', month: '11' }, 'GET')).body)).toMatchInlineSnapshot(`
      [
        {
          "current": 4,
          "id": "e-cancel-a",
          "max": 6,
          "private": false,
          "timeSlot": undefined,
        },
        {
          "current": 5,
          "id": "e-cancel-b",
          "max": 6,
          "private": false,
          "timeSlot": undefined,
        },
      ]
    `)
  })
  it('貸切の公演行が無い確定済みの web_private 予約を、確定した候補日（無ければ先頭の候補）から合成する。GM は staff の名前、無ければ「未定」', async () => {
    mock.tables.schedule_events = []
    mock.tables.staff = [{ id: 'st1', name: '太郎' }]
    mock.tables.reservations = [
      { id: 'b1', scenario_master_id: 'm1', store_id: 's1', gm_staff: 'st1', participant_count: 5, schedule_event_id: null, organization_id: 'org-1', scenario_masters: { id: 'm1', title: '作品', player_count_max: 6 }, stores: null,
        candidate_datetimes: { candidates: [{ order: 1, date: '2026-11-12', status: 'pending', timeSlot: '夜', startTime: '18:00:00', endTime: '21:00:00' }, { order: 2, date: '2026-11-13', status: 'confirmed', timeSlot: '昼' }] } },
      { id: 'b2', scenario_master_id: 'm1', store_id: 's1', gm_staff: null, participant_count: 4, schedule_event_id: null, organization_id: 'org-1', scenario_masters: { id: 'm1', title: '作品', player_count_max: 6 }, stores: null,
        candidate_datetimes: { candidates: [{ order: 1, date: '2026-12-20', status: 'pending', timeSlot: '夜' }] } },
      { id: 'b3', scenario_master_id: 'm1', store_id: 's1', gm_staff: null, participant_count: 3, schedule_event_id: null, organization_id: 'org-1', scenario_masters: { id: 'm1', title: '作品', player_count_max: 6 }, stores: null,
        candidate_datetimes: { candidates: [{ order: 1, date: '2026-11-30', status: 'pending', timeSlot: '夜' }] } },
    ]
    const { body } = await call({ type: 'by-month', year: '2026', month: '11' }, 'GET')
    expect((body as Array<Record<string, unknown>>).map(e => ({ id: e.id, date: e.date, start: e.start_time, end: e.end_time, gms: e.gms, current: e.current_participants, max: e.max_participants, slot: e.timeSlot }))).toMatchInlineSnapshot(`
      [
        {
          "current": 5,
          "date": "2026-11-13",
          "end": "21:00:00",
          "gms": [
            "太郎",
          ],
          "id": "private-b1-2",
          "max": 6,
          "slot": "昼",
          "start": "18:00:00",
        },
        {
          "current": 3,
          "date": "2026-11-30",
          "end": "21:00:00",
          "gms": [
            "未定",
          ],
          "id": "private-b3-1",
          "max": 6,
          "slot": "夜",
          "start": "18:00:00",
        },
      ]
    `)
  })
  it('skip_private_bookings=true では貸切を合成しない。year / month が不正なら 400', async () => {
    mock.tables.schedule_events = []
    mock.tables.reservations = [{ id: 'b1', scenario_master_id: 'm1', store_id: 's1', gm_staff: null, participant_count: 5, schedule_event_id: null, scenario_masters: null, stores: null, candidate_datetimes: { candidates: [{ order: 1, date: '2026-11-12', status: 'confirmed' }] } }]
    expect(((await call({ type: 'by-month', year: '2026', month: '11', skip_private_bookings: 'true' }, 'GET')).body as unknown[]).length).toBe(0)
    expect((await call({ type: 'by-month', year: '2026', month: '13' }, 'GET')).status).toBe(400)
    expect((await call({ type: 'by-month', year: 'x', month: '1' }, 'GET')).status).toBe(400)
  })
})

describe('api/schedule.ts my-schedule / by-date-range / by-scenario（表示人数の出し方が by-month と違う現状を固定）', () => {
  const evt = (id: string, over: Record<string, unknown>) => ({
    id, date: '2026-11-05', start_time: '14:00:00', category: 'open', is_cancelled: false, current_participants: 0, scenario_master_id: 'm1', scenario: '作品',
    scenario_masters: null, max_participants: null, capacity: 8, time_slot: null, ...over,
  })
  const r = (event: string, over: Record<string, unknown>) => ({ schedule_event_id: event, participant_count: 2, status: 'confirmed', ...over })
  beforeEach(() => { mock.tables.organization_scenarios_with_master = [{ id: 'm1', title: '作品', player_count_max: 6 }] })

  it('by-scenario: 実人数は有効状態の合計と DB の表示人数の大きいほうで、定員では頭打ちにしない（by-month と違う）。time_slot があれば timeSlot を付ける', async () => {
    mock.tables.schedule_events = [evt('a', { current_participants: 3 }), evt('b', { date: '2026-11-06', current_participants: 0, time_slot: '夜' })]
    mock.tables.reservations = [r('a', { participant_count: 2 }), r('b', { participant_count: 5 }), r('b', { participant_count: 4 })]
    const { status, body } = await call({ type: 'by-scenario', scenario_id: 'm1', start: '2026-11-01', end: '2026-11-30' }, 'GET')
    expect(status).toBe(200)
    expect((body as Array<Record<string, unknown>>).map(e => ({ id: e.id, current: e.current_participants, max: e.max_participants, timeSlot: e.timeSlot }))).toMatchInlineSnapshot(`
      [
        {
          "current": 3,
          "id": "a",
          "max": 6,
          "timeSlot": undefined,
        },
        {
          "current": 9,
          "id": "b",
          "max": 6,
          "timeSlot": "夜",
        },
      ]
    `)
  })
  it('by-scenario: 必須パラメータの欠落は 400、該当公演が無ければ空配列', async () => {
    expect((await call({ type: 'by-scenario', start: '2026-11-01', end: '2026-11-30' }, 'GET')).status).toBe(400)
    mock.tables.schedule_events = []
    expect((await call({ type: 'by-scenario', scenario_id: 'm1', start: '2026-11-01', end: '2026-11-30' }, 'GET')).body).toEqual([])
  })
  it('by-date-range: 期間内の公演をそのまま返し、include_cancelled=true のときだけ中止を含める。欠落は 400', async () => {
    mock.tables.schedule_events = [evt('a', {})]
    expect((await call({ type: 'by-date-range', start: '2026-11-01', end: '2026-11-30' }, 'GET')).body).toEqual([evt('a', {})])
    expect((await call({ type: 'by-date-range', start: '2026-11-01' }, 'GET')).status).toBe(400)
  })
  it('my-schedule: GM として入っている公演とスタッフ参加の公演を合算して重複を除き、実人数は有効状態の合計（定員で頭打ちにしない）で日付・時刻順に返す', async () => {
    const gmOnly = evt('gm-only', { date: '2026-11-08', start_time: '19:00:00' })
    const both = evt('both', { date: '2026-11-05' })
    const staffOnly = evt('staff-only', { date: '2026-11-05', start_time: '10:00:00' })
    mock.tables.schedule_events = [gmOnly, both]
    mock.tables.reservations = [
      { schedule_event_id: 'both', schedule_events: both, participant_count: 4, status: 'confirmed' },
      { schedule_event_id: 'staff-only', schedule_events: staffOnly, participant_count: 1, status: 'confirmed' },
      { schedule_event_id: 'gm-only', schedule_events: null, participant_count: 7, status: 'confirmed' },
    ]
    const { status, body } = await call({ type: 'my-schedule', staff_name: '太郎', start: '2026-11-01', end: '2026-11-30' }, 'GET')
    expect(status).toBe(200)
    expect((body as Array<Record<string, unknown>>).map(e => ({ id: e.id, date: e.date, start: e.start_time, current: e.current_participants, max: e.max_participants }))).toMatchInlineSnapshot(`
      [
        {
          "current": 1,
          "date": "2026-11-05",
          "id": "staff-only",
          "max": 6,
          "start": "10:00:00",
        },
        {
          "current": 4,
          "date": "2026-11-05",
          "id": "both",
          "max": 6,
          "start": "14:00:00",
        },
        {
          "current": 7,
          "date": "2026-11-08",
          "id": "gm-only",
          "max": 6,
          "start": "19:00:00",
        },
      ]
    `)
    expect((await call({ type: 'my-schedule', start: '2026-11-01', end: '2026-11-30' }, 'GET')).status).toBe(400)
  })
})

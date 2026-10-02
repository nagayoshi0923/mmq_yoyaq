/**
 * api/reservations.ts の出力・書き込みペイロード・RPC 呼び出し・発行クエリを、固定データで固定する特性テスト
 * （整備 Phase 3 の分割の前提、#774）。固定する値は「分割前の現状の出力」であり、正しさの主張ではない。
 * 予約は金額・人数・メール・キャンセル料に直結するため、書き込み経路（作成・スタッフ参加・更新・取消・人数変更・
 * 料金再計算・一括ステータス・削除）の RPC 名と引数、エラーコードの対応、履歴の記録内容を中心に固める。
 * 既存の認可テスト（reservation-actor-auth / cancellation-*）とは重ねず、出力の形を固定する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type Q = { table: string; ops: string[] }
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }

const mock = vi.hoisted(() => ({
  user: { userId: 'u-staff', role: 'staff', orgId: 'org-1', jwt: 'jwt-fixture' } as { userId: string; role: string; orgId: string; jwt: string },
  tables: {} as Record<string, Record<string, unknown>[]>,
  tableErrors: {} as Record<string, { code?: string; message: string }>,
  inserted: {} as Record<string, unknown>,
  issued: [] as Q[],
  writes: [] as Array<{ table: string; op: string; payload: unknown }>,
  rpcs: [] as Array<{ name: string; args: unknown }>,
  rpcResults: {} as Record<string, RpcResult>,
  history: [] as unknown[],
  billing: [] as unknown[],
  billingThrows: false,
  snapshot: { date: '2026-10-10', store_id: 'store-1', time_slot: 'afternoon' } as Record<string, unknown> | null,
  gate: { ok: true } as { ok: true } | { ok: false; status: number; error: string },
  callCount: 0,
}))

vi.mock('./_lib/db.js', () => {
  const makeQuery = (table: string) => {
    const entry: Q = { table, ops: [] }
    mock.issued.push(entry)
    let rows = (mock.tables[table] ?? []).slice()
    let written: { op: string; payload: unknown } | null = null
    const q: Record<string, unknown> = {}
    for (const w of ['insert', 'update', 'upsert']) q[w] = (payload: unknown) => { written = { op: w, payload }; mock.writes.push({ table, op: w, payload }); return q }
    q.delete = () => { written = { op: 'delete', payload: null }; mock.writes.push({ table, op: 'delete', payload: null }); return q }
    q.select = (fields: string) => { entry.ops.push(`select(${String(fields).replace(/\s+/g, ' ').trim().slice(0, 70)}…)`); return q }
    for (const m of ['eq', 'neq', 'gte', 'lte', 'in', 'order', 'limit', 'is']) {
      q[m] = (...a: unknown[]) => {
        entry.ops.push(`${m}(${a.map(x => JSON.stringify(x)).join(', ')})`)
        if (m === 'eq' && !written) rows = rows.filter(r => !(String(a[0]) in r) || r[String(a[0])] === a[1])
        if (m === 'in' && !written && !Array.isArray(a[1])) rows = []
        if (m === 'in' && !written && Array.isArray(a[1])) rows = rows.filter(r => !(String(a[0]) in r) || (a[1] as unknown[]).includes(r[String(a[0])]))
        return q
      }
    }
    const result = () => {
      const err = mock.tableErrors[table]
      if (err && (!written || written.op !== 'noop')) return { data: null, error: err }
      if (written?.op === 'insert') return { data: mock.inserted[table] ?? (written.payload as unknown[])[0], error: null }
      return { data: rows, error: null }
    }
    q.single = async () => { const r = result(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error } }
    q.maybeSingle = q.single
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    return q
  }
  return { db: { from: makeQuery }, getMissingEnvError: () => null }
})

vi.mock('./_lib/auth.js', () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
  return {
    ApiError,
    requireAuth: async () => mock.user,
    requireStaff: (user: { role: string }) => { if (!['staff', 'admin', 'license_admin'].includes(user.role)) throw new ApiError(403, 'スタッフ権限が必要です') },
    createUserScopedClient: () => ({
      rpc: async (name: string, args: unknown) => {
        mock.rpcs.push({ name, args })
        return mock.rpcResults[name] ?? { data: true, error: null }
      },
    }),
  }
})
vi.mock('./_lib/eventHistory.js', () => ({
  recordEventHistory: async (_db: unknown, params: unknown) => { mock.history.push(params) },
  fetchEventSnapshotServer: async () => mock.snapshot,
}))
vi.mock('./_lib/cancellation-payments/intake.js', () => ({
  recordCancellationIntake: async (_db: unknown, params: Record<string, unknown>) => {
    if (mock.billingThrows) throw new Error('fixture billing failure')
    const { reservation, ...rest } = params
    mock.billing.push({ ...rest, reservationId: (reservation as { id: string }).id })
  },
}))
vi.mock('./_lib/customerCancellation.js', () => ({ assertCustomerSelfCancelAllowed: async () => mock.gate }))
vi.mock('./_lib/saveGmResponse.js', () => ({ saveGmResponse: async () => ({ saved: true }) }))
vi.mock('./_lib/gmResponses.js', () => ({
  readGmResponses: async () => ({}), readGmPendingCount: async () => ({}), readGmReadiness: async () => ({}),
}))

import handler from './reservations'

const STAFF = { userId: 'u-staff', role: 'staff', orgId: 'org-1', jwt: 'jwt-fixture' }
const CUSTOMER = { userId: 'u-cust', role: 'customer', orgId: '', jwt: 'jwt-fixture' }

const reservationRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1', organization_id: 'org-1', customer_id: 'c1', private_group_id: null, schedule_event_id: 'ev1', status: 'confirmed',
  participant_count: 3, customer_name: '山田太郎', payment_method: 'card', reservation_source: 'web',
  schedule_events: { id: 'ev1', date: '2026-10-10', start_time: '14:00:00', is_cancelled: false, category: 'open' },
  ...over,
})
const eventRow = (over: Record<string, unknown> = {}) => ({
  id: 'ev1', organization_id: 'org-1', date: '2026-10-10', start_time: '14:00:00', end_time: '17:00:00', scenario: '作品A',
  scenario_master_id: 'm1', store_id: 'store-1', max_participants: 8, capacity: 8, current_participants: 4, category: 'open', is_cancelled: false, ...over,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-02T03:00:00Z'))
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  mock.user = { ...STAFF }
  mock.tables = {
    reservations: [reservationRow()],
    schedule_events: [eventRow()],
    customers: [{ id: 'c1', organization_id: 'org-1', user_id: 'u-cust' }],
    staff: [{ id: 'staff-1', user_id: 'u-staff', organization_id: 'org-1', name: '花子', status: 'active' }],
    organizations: [{ id: 'org-1', slug: 'queens-waltz' }],
    reservation_summary: [{ schedule_event_id: 'ev1', max_participants: 8, current_reservations: 4, available_seats: 4 }],
  }
  mock.tableErrors = {}; mock.inserted = {}; mock.issued = []; mock.writes = []; mock.rpcs = []; mock.rpcResults = {}
  mock.history = []; mock.billing = []; mock.billingThrows = false
  mock.snapshot = { date: '2026-10-10', store_id: 'store-1', time_slot: 'afternoon' }
  mock.gate = { ok: true }
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

async function call(method: string, query: Record<string, string>, body?: unknown) {
  mock.issued = []; mock.writes = []; mock.rpcs = []; mock.history = []; mock.billing = []
  mock.callCount += 1
  const res = { statusCode: 0, body: undefined as unknown, status: vi.fn(), json: vi.fn(), setHeader: vi.fn(), end: vi.fn() }
  res.status.mockImplementation((s: number) => { res.statusCode = s; return res })
  res.json.mockImplementation((b: unknown) => { res.body = b; return res })
  await handler({ method, headers: {}, query, body } as unknown as VercelRequest, res as unknown as VercelResponse)
  return { status: res.statusCode, body: res.body, rpcs: mock.rpcs, writes: mock.writes, history: mock.history, billing: mock.billing, issued: mock.issued.map(i => `${i.table}: ${i.ops.join(' | ')}`) }
}
const only = <T extends Record<string, unknown>, K extends keyof T>(r: T, ...keys: K[]) => Object.fromEntries(keys.map(k => [k, r[k]]))

describe('GET: 一覧・集計・空席', () => {
  it('?type なしは組織で絞り、期間指定の有無で並び順が変わる', async () => {
    const all = await call('GET', {})
    const range = await call('GET', { start: '2026-10-01', end: '2026-10-31' })
    expect({ all: [all.status, all.issued], range: [range.status, range.issued] }).toMatchInlineSnapshot(`
      {
        "all": [
          200,
          [
            "reservations: select(id, organization_id, reservation_number, reservation_page_id, title, s…) | eq("organization_id", "org-1") | order("requested_datetime", {"ascending":false})",
          ],
        ],
        "range": [
          200,
          [
            "reservations: select(id, organization_id, reservation_number, reservation_page_id, title, s…) | eq("organization_id", "org-1") | gte("requested_datetime", "2026-10-01") | lte("requested_datetime", "2026-10-31") | order("requested_datetime", {"ascending":true})",
          ],
        ],
      }
    `)
  })

  it('顧客は一覧・公演別・顧客別・集計を読めず、空席だけ読める', async () => {
    mock.user = { ...CUSTOMER }
    const out: Record<string, unknown> = {}
    for (const [name, query] of Object.entries({
      list: {}, byEvent: { type: 'by-schedule-event', schedule_event_id: 'ev1' }, byCustomer: { type: 'by-customer', customer_id: 'c1' },
      summary: { type: 'summary' }, availability: { type: 'availability', schedule_event_id: 'ev1' }, unknown: { type: 'zzz' },
    })) out[name] = (await call('GET', query)).status
    expect(out).toMatchInlineSnapshot(`
      {
        "availability": 200,
        "byCustomer": 403,
        "byEvent": 403,
        "list": 403,
        "summary": 403,
        "unknown": 400,
      }
    `)
  })

  it('公演別は有効な状態だけを作成順で返し、必須パラメータが無ければ 400', async () => {
    const ok = await call('GET', { type: 'by-schedule-event', schedule_event_id: 'ev1' })
    const bad = await call('GET', { type: 'by-schedule-event' })
    const cust = await call('GET', { type: 'by-customer', customer_id: 'c1' })
    const custBad = await call('GET', { type: 'by-customer' })
    expect({ ok: only(ok, 'status', 'issued'), bad: bad.status, cust: only(cust, 'status', 'issued'), custBad: [custBad.status, custBad.body] }).toMatchInlineSnapshot(`
      {
        "bad": 400,
        "cust": {
          "issued": [
            "reservations: select(id, organization_id, reservation_number, reservation_page_id, title, s…) | eq("customer_id", "c1") | eq("organization_id", "org-1") | order("requested_datetime", {"ascending":false})",
          ],
          "status": 200,
        },
        "custBad": [
          400,
          {
            "error": "customer_id が必要です",
          },
        ],
        "ok": {
          "issued": [
            "reservations: select(id, organization_id, reservation_number, reservation_page_id, title, s…) | eq("schedule_event_id", "ev1") | eq("organization_id", "org-1") | in("status", ["pending","confirmed","gm_confirmed","checked_in","cancelled"]) | order("created_at", {"ascending":true})",
          ],
          "status": 200,
        },
      }
    `)
  })

  it('集計は公演の指定あり（自組織確認・404）と無し（自組織の公演 ID で絞る）で動きが違う', async () => {
    const one = await call('GET', { type: 'summary', schedule_event_id: 'ev1' })
    mock.tables.schedule_events = []
    const notFound = await call('GET', { type: 'summary', schedule_event_id: 'ev1' })
    const none = await call('GET', { type: 'summary' })
    mock.tables.schedule_events = [eventRow(), eventRow({ id: 'ev2' })]
    const many = await call('GET', { type: 'summary' })
    expect({ one: only(one, 'status', 'body', 'issued'), notFound: [notFound.status, notFound.body], none: [none.status, none.body], many: only(many, 'status', 'issued') }).toMatchInlineSnapshot(`
      {
        "many": {
          "issued": [
            "schedule_events: select(id…) | eq("organization_id", "org-1")",
            "reservation_summary: select(schedule_event_id, date, venue, scenario, start_time, end_time, max_pa…) | in("schedule_event_id", ["ev1","ev2"])",
          ],
          "status": 200,
        },
        "none": [
          200,
          [],
        ],
        "notFound": [
          404,
          {
            "error": "schedule_event が見つかりません",
          },
        ],
        "one": {
          "body": [
            {
              "available_seats": 4,
              "current_reservations": 4,
              "max_participants": 8,
              "schedule_event_id": "ev1",
            },
          ],
          "issued": [
            "schedule_events: select(id…) | eq("id", "ev1") | eq("organization_id", "org-1")",
            "reservation_summary: select(schedule_event_id, date, venue, scenario, start_time, end_time, max_pa…) | eq("schedule_event_id", "ev1")",
          ],
          "status": 200,
        },
      }
    `)
  })

  it('空席は公演が無ければ 404、集計行が無ければ 0 件、あれば席数を返す', async () => {
    const ok = await call('GET', { type: 'availability', schedule_event_id: 'ev1' })
    mock.tables.reservation_summary = []
    const empty = await call('GET', { type: 'availability', schedule_event_id: 'ev1' })
    mock.tables.schedule_events = []
    const notFound = await call('GET', { type: 'availability', schedule_event_id: 'ev1' })
    const missing = await call('GET', { type: 'availability' })
    expect({ ok: [ok.status, ok.body], empty: [empty.status, empty.body], notFound: [notFound.status, notFound.body], missing: [missing.status, missing.body] }).toMatchInlineSnapshot(`
      {
        "empty": [
          200,
          {
            "availableSeats": 0,
            "currentReservations": 0,
            "maxParticipants": null,
          },
        ],
        "missing": [
          400,
          {
            "error": "schedule_event_id が必要です",
          },
        ],
        "notFound": [
          404,
          {
            "error": "schedule_event が見つかりません",
          },
        ],
        "ok": [
          200,
          {
            "availableSeats": 4,
            "currentReservations": 4,
            "maxParticipants": 8,
          },
        ],
      }
    `)
  })
})

describe('POST create: 予約の作成（RPC create_reservation_with_lock_v2）', () => {
  const body = { reservation: { schedule_event_id: 'ev1', customer_id: 'c1', participant_count: 2, customer_name: '山田太郎', customer_email: 'y@example.com', customer_phone: '090', customer_notes: 'メモ', how_found: 'twitter', reservation_number: 'KNOWN-1', customer_coupon_id: 'cp1', reservation_source: 'web' } }
  beforeEach(() => { mock.user = { ...CUSTOMER }; mock.rpcResults.create_reservation_with_lock_v2 = { data: 'r-new', error: null } })

  it('成功すると 201 で作成後の予約を返し、RPC の引数と add_participant 履歴が決まった形になる', async () => {
    mock.tables.reservations = [reservationRow({ id: 'r-new' })]
    const r = await call('POST', { action: 'create' }, body)
    expect(only(r, 'status', 'rpcs', 'history', 'issued')).toMatchInlineSnapshot(`
      {
        "history": [
          {
            "actionType": "add_participant",
            "cellInfo": {
              "date": "2026-10-10",
              "storeId": "store-1",
              "timeSlot": "afternoon",
            },
            "changedByName": "山田太郎（お客様）",
            "changedByStaffId": null,
            "changedByUserId": "u-cust",
            "newValues": {
              "participant_count": 2,
              "participant_name": "山田太郎",
              "reservation_id": "r-new",
              "reservation_source": "web",
            },
            "notes": "山田太郎（2名）が予約サイトから予約",
            "oldValues": null,
            "organizationId": "org-1",
            "scheduleEventId": "ev1",
          },
        ],
        "issued": [
          "schedule_events: select(id, organization_id…) | eq("id", "ev1")",
          "customers: select(id, organization_id, user_id…) | eq("id", "c1")",
          "reservations: select(id, organization_id, reservation_number, reservation_page_id, title, s…) | eq("id", "r-new")",
        ],
        "rpcs": [
          {
            "args": {
              "p_customer_coupon_id": "cp1",
              "p_customer_email": "y@example.com",
              "p_customer_id": "c1",
              "p_customer_name": "山田太郎",
              "p_customer_phone": "090",
              "p_how_found": "twitter",
              "p_notes": "メモ",
              "p_participant_count": 2,
              "p_reservation_number": "KNOWN-1",
              "p_schedule_event_id": "ev1",
            },
            "name": "create_reservation_with_lock_v2",
          },
        ],
        "status": 201,
      }
    `)
  })

  it('予約番号が無ければ日付とランダム 4 文字で作る', async () => {
    mock.tables.reservations = [reservationRow({ id: 'r-new' })]
    const r = await call('POST', {}, { schedule_event_id: 'ev1', customer_id: 'c1', participant_count: 1 })
    expect((r.rpcs[0] as { args: Record<string, unknown> }).args).toMatchInlineSnapshot(`
      {
        "p_customer_coupon_id": null,
        "p_customer_email": null,
        "p_customer_id": "c1",
        "p_customer_name": null,
        "p_customer_phone": null,
        "p_how_found": null,
        "p_notes": null,
        "p_participant_count": 1,
        "p_reservation_number": "261002-I",
        "p_schedule_event_id": "ev1",
      }
    `)
  })

  it('必須項目の不足は 400、公演・顧客が無ければ 404、他組織の顧客は 403', async () => {
    const miss = await call('POST', {}, { schedule_event_id: 'ev1', customer_id: 'c1' })
    mock.tables.schedule_events = []
    const noEvent = await call('POST', {}, body)
    mock.tables.schedule_events = [eventRow()]
    mock.tables.customers = []
    const noCust = await call('POST', {}, body)
    mock.user = { ...STAFF, userId: 'u-other' }
    mock.tables.customers = [{ id: 'c1', organization_id: 'org-9', user_id: 'u-cust' }]
    const otherOrg = await call('POST', {}, body)
    expect({ miss: [miss.status, miss.body], noEvent: [noEvent.status, noEvent.body], noCust: [noCust.status, noCust.body], otherOrg: [otherOrg.status, otherOrg.body], rpcCalls: [miss, noEvent, noCust, otherOrg].map(x => x.rpcs.length) }).toMatchInlineSnapshot(`
      {
        "miss": [
          400,
          {
            "error": "schedule_event_id / customer_id / participant_count が必要です",
          },
        ],
        "noCust": [
          404,
          {
            "error": "customer が見つかりません",
          },
        ],
        "noEvent": [
          404,
          {
            "error": "schedule_event が見つかりません",
          },
        ],
        "otherOrg": [
          403,
          {
            "error": "この予約を操作する権限がありません",
          },
        ],
        "rpcCalls": [
          0,
          0,
          0,
          0,
        ],
      }
    `)
  })

  it.each(['P0001', 'P0002', 'P0003', 'P0004', 'P0028', 'P0046', 'P0010', '42501', 'P9999'])('RPC エラー %s の変換', async code => {
    mock.rpcResults.create_reservation_with_lock_v2 = { data: null, error: { code, message: `fixture ${code}` } }
    const r = await call('POST', {}, body)
    expect([r.status, r.body]).toMatchSnapshot()
  })

  it('番号の重複は、同じ内容の既存予約があればそれを 200 で返し、無ければ 500', async () => {
    mock.rpcResults.create_reservation_with_lock_v2 = { data: null, error: { code: '23505', message: 'duplicate key reservation_number' } }
    mock.tables.reservations = [reservationRow({ id: 'r-existing', reservation_number: 'KNOWN-1', participant_count: 2 })]
    const existing = await call('POST', {}, body)
    mock.tables.reservations = []
    const none = await call('POST', {}, body)
    expect({ existing: [existing.status, (existing.body as { id: string }).id], none: [none.status, none.body] }).toMatchInlineSnapshot(`
      {
        "existing": [
          200,
          "r-existing",
        ],
        "none": [
          500,
          {
            "code": "23505",
            "detail": "duplicate key reservation_number",
            "error": "予約作成に失敗しました",
          },
        ],
      }
    `)
  })

  it('RPC が ID を返さない場合と、作成後の取得失敗は 500、履歴の失敗は成功を妨げない', async () => {
    mock.rpcResults.create_reservation_with_lock_v2 = { data: null, error: null }
    const noId = await call('POST', {}, body)
    mock.rpcResults.create_reservation_with_lock_v2 = { data: 'r-new', error: null }
    mock.tables.reservations = []
    const noFetch = await call('POST', {}, body)
    mock.tables.reservations = [reservationRow({ id: 'r-new' })]
    mock.snapshot = null
    const noSnapshot = await call('POST', {}, body)
    expect({ noId: [noId.status, noId.body], noFetch: [noFetch.status, noFetch.body], noSnapshot: [noSnapshot.status, mock.history.length] }).toMatchInlineSnapshot(`
      {
        "noFetch": [
          500,
          {
            "error": "作成後の予約取得に失敗しました",
          },
        ],
        "noId": [
          500,
          {
            "error": "予約 ID が取得できませんでした",
          },
        ],
        "noSnapshot": [
          201,
          0,
        ],
      }
    `)
  })
})

describe('POST create-staff-entry: スタッフ参加枠の予約（直接 INSERT）', () => {
  const body = { schedule_event_id: 'ev1', staff_name: '花子', event_details: {} }

  it('金額 0・支払方法 staff・状態 confirmed の予約を 1 名分で作り、履歴に残す', async () => {
    mock.inserted.reservations = { id: 'r-staff' }
    const r = await call('POST', { action: 'create-staff-entry' }, body)
    expect(only(r, 'status', 'body', 'writes', 'history')).toMatchInlineSnapshot(`
      {
        "body": {
          "id": "r-staff",
        },
        "history": [
          {
            "actionType": "add_participant",
            "cellInfo": {
              "date": "2026-10-10",
              "storeId": "store-1",
              "timeSlot": "afternoon",
            },
            "changedByName": "花子（スタッフ参加同期）",
            "changedByStaffId": "staff-1",
            "changedByUserId": "u-staff",
            "newValues": {
              "participant_count": 1,
              "participant_name": "花子",
              "reservation_id": "r-staff",
              "reservation_source": "staff_entry",
            },
            "notes": "花子 をスタッフ参加で同期",
            "oldValues": null,
            "organizationId": "org-1",
            "scheduleEventId": "ev1",
          },
        ],
        "status": 201,
        "writes": [
          {
            "op": "insert",
            "payload": [
              {
                "assigned_staff": [],
                "base_price": 0,
                "customer_id": null,
                "customer_notes": "花子",
                "discount_amount": 0,
                "duration": 180,
                "final_price": 0,
                "options_price": 0,
                "organization_id": "org-1",
                "participant_count": 1,
                "participant_names": [
                  "花子",
                ],
                "payment_method": "staff",
                "payment_status": "paid",
                "requested_datetime": "2026-10-10T14:00:00+09:00",
                "reservation_number": "261002-I",
                "reservation_source": "staff_entry",
                "scenario_master_id": "m1",
                "schedule_event_id": "ev1",
                "status": "confirmed",
                "store_id": "store-1",
                "title": "作品A",
                "total_price": 0,
              },
            ],
            "table": "reservations",
          },
        ],
      }
    `)
  })

  it('所要時間は eventDetails.duration、開始・終了時刻の差、120 分の順で決める', async () => {
    mock.inserted.reservations = { id: 'r-staff' }
    const durations: unknown[] = []
    const take = async () => { mock.writes.length = 0; await call('POST', { action: 'create-staff-entry' }, durationBody()); durations.push((mock.writes[0].payload as Record<string, unknown>[])[0].duration) }
    let durationBody = () => ({ ...body, event_details: { duration: 90 } })
    await take()
    durationBody = () => body as never
    await take()
    mock.tables.schedule_events = [eventRow({ end_time: null })]
    await take()
    expect(durations).toMatchInlineSnapshot(`
      [
        90,
        180,
        120,
      ]
    `)
  })

  it('必須不足 400、公演なし 404、他組織 403、定員超過 409（INSERT しない）', async () => {
    const miss = await call('POST', { action: 'create-staff-entry' }, { schedule_event_id: 'ev1' })
    mock.tables.schedule_events = []
    const noEvent = await call('POST', { action: 'create-staff-entry' }, body)
    mock.tables.schedule_events = [eventRow({ organization_id: 'org-9' })]
    const other = await call('POST', { action: 'create-staff-entry' }, body)
    mock.tables.schedule_events = [eventRow({ max_participants: 4, current_participants: 4 })]
    const full = await call('POST', { action: 'create-staff-entry' }, body)
    expect({ miss: [miss.status, miss.body], noEvent: [noEvent.status, noEvent.body], other: [other.status, other.body], full: [full.status, full.body], writes: [miss, noEvent, other, full].map(x => x.writes.length) }).toMatchInlineSnapshot(`
      {
        "full": [
          409,
          {
            "code": "CAPACITY_EXCEEDED",
            "error": "定員4名に対して参加人数が5名になるため保存できません。申込済みの予約とスタッフ参加が重複していないか、予約者一覧を確認してください。",
          },
        ],
        "miss": [
          400,
          {
            "error": "schedule_event_id / staff_name が必要です",
          },
        ],
        "noEvent": [
          404,
          {
            "error": "schedule_event が見つかりません",
          },
        ],
        "other": [
          403,
          {
            "error": "他組織の schedule_event は指定できません",
          },
        ],
        "writes": [
          0,
          0,
          0,
          0,
        ],
      }
    `)
  })

  it('INSERT で定員制約に当たったら 409、それ以外は 500', async () => {
    mock.tableErrors.reservations = { code: '23514', message: 'violates schedule_events_participants_check' }
    const cap = await call('POST', { action: 'create-staff-entry' }, body)
    mock.tableErrors.reservations = { code: 'XX000', message: 'boom' }
    const other = await call('POST', { action: 'create-staff-entry' }, body)
    expect({ cap: [cap.status, cap.body], other: [other.status, other.body] }).toMatchInlineSnapshot(`
      {
        "cap": [
          409,
          {
            "code": "CAPACITY_EXCEEDED",
            "error": "定員を超えるため保存できません。予約者一覧を更新し、申込済みの予約とスタッフ参加が重複していないか確認してください。",
          },
        ],
        "other": [
          500,
          {
            "detail": "boom",
            "error": "スタッフ予約の作成に失敗しました",
          },
        ],
      }
    `)
  })

  it('顧客は呼べない（403）', async () => {
    mock.user = { ...CUSTOMER }
    const r = await call('POST', { action: 'create-staff-entry' }, body)
    expect([r.status, r.writes.length]).toMatchInlineSnapshot(`
      [
        403,
        0,
      ]
    `)
  })
})

describe('スタッフ参加の同期 RPC', () => {
  it('取得（GET）と保存（POST）はそれぞれの RPC へ、エラーコードを状態に変換する', async () => {
    mock.rpcResults.get_event_staff_participations = { data: [{ staff: 'a' }], error: null }
    const get = await call('GET', { type: 'staff-participation', schedule_event_id: 'ev1' })
    const save = await call('POST', { action: 'sync-staff-participation' }, { schedule_event_id: 'ev1', entries: [1], expected: 2, gms: ['a'], gm_roles: { a: 'main' }, expected_staff: 3 })
    const statuses: Record<string, number> = {}
    for (const code of ['42501', '40001', '55P03', '23514', '22023', '22P02', 'XX000']) {
      mock.rpcResults.sync_event_staff_participations = { data: null, error: { code, message: `fixture ${code}` } }
      statuses[code] = (await call('POST', { action: 'sync-staff-participation' }, { schedule_event_id: 'ev1' })).status
    }
    const noId = await call('POST', { action: 'sync-staff-participation' }, {})
    expect({ get: [get.status, get.body], save: [save.status, save.body], rpcs: save.rpcs.slice(0, 2), statuses, noId: [noId.status, noId.body] }).toMatchInlineSnapshot(`
      {
        "get": [
          200,
          [
            {
              "staff": "a",
            },
          ],
        ],
        "noId": [
          400,
          {
            "error": "公演IDが必要です",
          },
        ],
        "rpcs": [
          {
            "args": {
              "p_entries": [
                1,
              ],
              "p_event_id": "ev1",
              "p_expected": 2,
              "p_expected_staff": 3,
              "p_gm_roles": {
                "a": "main",
              },
              "p_gms": [
                "a",
              ],
            },
            "name": "sync_event_staff_participations",
          },
        ],
        "save": [
          200,
          true,
        ],
        "statuses": {
          "22023": 400,
          "22P02": 400,
          "23514": 409,
          "40001": 409,
          "42501": 403,
          "55P03": 409,
          "XX000": 500,
        },
      }
    `)
  })
})

describe('PATCH update: スタッフによる予約項目の更新', () => {
  it('RPC admin_update_reservation_fields に更新内容を渡し、更新後の予約を返す', async () => {
    const r = await call('PATCH', { action: 'update', id: 'r1' }, { updates: { status: 'checked_in' } })
    expect(only(r, 'status', 'rpcs')).toMatchInlineSnapshot(`
      {
        "rpcs": [
          {
            "args": {
              "p_reservation_id": "r1",
              "p_updates": {
                "status": "checked_in",
              },
            },
            "name": "admin_update_reservation_fields",
          },
        ],
        "status": 200,
      }
    `)
  })

  it('他組織の予約は 403、無ければ 404、顧客は 403、id が無ければ 400', async () => {
    mock.tables.reservations = [reservationRow({ organization_id: 'org-9' })]
    const other = await call('PATCH', { action: 'update', id: 'r1' }, { status: 'x' })
    mock.tables.reservations = []
    const none = await call('PATCH', { action: 'update', id: 'r1' }, { status: 'x' })
    const noId = await call('PATCH', { action: 'update' }, { status: 'x' })
    mock.user = { ...CUSTOMER }
    const cust = await call('PATCH', { action: 'update', id: 'r1' }, { status: 'x' })
    expect({ other: [other.status, other.body], none: [none.status, none.body], noId: [noId.status, noId.body], cust: [cust.status, cust.body] }).toMatchInlineSnapshot(`
      {
        "cust": [
          403,
          {
            "error": "スタッフ権限が必要です",
          },
        ],
        "noId": [
          400,
          {
            "error": "id が必要です",
          },
        ],
        "none": [
          404,
          {
            "error": "予約が見つかりません",
          },
        ],
        "other": [
          403,
          {
            "error": "他組織の予約は操作できません",
          },
        ],
      }
    `)
  })

  it('RPC が失敗・0 行・success:false を返したときの扱い', async () => {
    mock.tables.reservations = [reservationRow()]
    mock.rpcResults.admin_update_reservation_fields = { data: null, error: { message: 'rpc down' } }
    const err = await call('PATCH', { action: 'update', id: 'r1' }, { status: 'x' })
    mock.rpcResults.admin_update_reservation_fields = { data: false, error: null }
    const zero = await call('PATCH', { action: 'update', id: 'r1' }, { status: 'x' })
    mock.rpcResults.admin_update_reservation_fields = { data: { success: false, error: '更新できません' }, error: null }
    const rejected = await call('PATCH', { action: 'update', id: 'r1' }, { status: 'x' })
    expect({ err: [err.status, err.body], zero: [zero.status, zero.body], rejected: [rejected.status, rejected.body] }).toMatchInlineSnapshot(`
      {
        "err": [
          500,
          {
            "detail": "rpc down",
            "error": "予約の更新に失敗しました",
          },
        ],
        "rejected": [
          400,
          {
            "error": "更新できません",
          },
        ],
        "zero": [
          500,
          {
            "error": "予約の更新に失敗しました（DB 側で 0 行更新）",
          },
        ],
      }
    `)
  })
})

describe('PATCH cancel-with-lock / cancel-with-group-lock', () => {
  it('予約だけの取消は RPC cancel_reservation_with_lock、料金の記録は 1 回', async () => {
    const r = await call('PATCH', { action: 'cancel-with-lock', id: 'r1' }, { customer_id: 'c1', cancellation_reason: '都合' })
    expect(only(r, 'status', 'body', 'rpcs', 'billing')).toMatchInlineSnapshot(`
      {
        "billing": [
          {
            "actorId": "u-staff",
            "eventDate": "2026-10-10",
            "organizationId": "org-1",
            "organizerCancelled": false,
            "previouslyCancelled": false,
            "processedAt": "2026-10-02T03:00:00.000Z",
            "receivedAt": null,
            "reservationId": "r1",
            "startTime": "14:00:00",
          },
        ],
        "body": {
          "billingWarning": false,
          "success": true,
        },
        "rpcs": [
          {
            "args": {
              "p_cancellation_reason": "都合",
              "p_customer_id": "c1",
              "p_reservation_id": "r1",
            },
            "name": "cancel_reservation_with_lock",
          },
        ],
        "status": 200,
      }
    `)
  })

  it('グループ込みの取消は cancel_reservation_and_group_with_notice、エラーコードを案内に変換する', async () => {
    const ok = await call('PATCH', { action: 'cancel-with-group-lock', id: 'r1' }, { cancellation_reason: '都合' })
    const codes: Record<string, unknown> = {}
    for (const code of ['P0052', 'P0053', 'P0050', 'P0051', '55P03', 'XX000']) {
      mock.rpcResults.cancel_reservation_and_group_with_notice = { data: null, error: { code, message: `fixture ${code}` } }
      const r = await call('PATCH', { action: 'cancel-with-group-lock', id: 'r1' }, {})
      codes[code] = [r.status, (r.body as { error: string }).error]
    }
    expect({ ok: only(ok, 'status', 'body', 'rpcs', 'billing'), codes }).toMatchInlineSnapshot(`
      {
        "codes": {
          "55P03": [
            409,
            "ほかの操作が進行中です。画面を更新してから、もう一度取消をお試しください。",
          ],
          "P0050": [
            409,
            "予約と貸切グループの紐づきが一致しません。取消は保存されていません。店舗管理者に確認してください。",
          ],
          "P0051": [
            409,
            "予約と貸切グループの紐づきが一致しません。取消は保存されていません。店舗管理者に確認してください。",
          ],
          "P0052": [
            400,
            "キャンセル期限を過ぎているか、料金が発生するため、店舗へご連絡ください。",
          ],
          "P0053": [
            409,
            "予約時のキャンセル規定を確認できません。店舗へお問い合わせください。",
          ],
          "XX000": [
            500,
            "予約と貸切グループのキャンセルに失敗しました。",
          ],
        },
        "ok": {
          "billing": [
            {
              "actorId": "u-staff",
              "eventDate": "2026-10-10",
              "organizationId": "org-1",
              "organizerCancelled": false,
              "previouslyCancelled": false,
              "processedAt": "2026-10-02T03:00:00.000Z",
              "receivedAt": null,
              "reservationId": "r1",
              "startTime": "14:00:00",
            },
          ],
          "body": {
            "billingWarning": false,
            "success": true,
          },
          "rpcs": [
            {
              "args": {
                "p_cancellation_reason": "都合",
                "p_customer_id": null,
                "p_reservation_id": "r1",
              },
              "name": "cancel_reservation_and_group_with_notice",
            },
          ],
          "status": 200,
        },
      }
    `)
  })

  it('RPC が true 以外なら 500 で料金を記録しない、料金記録が失敗すると billingWarning が true', async () => {
    mock.rpcResults.cancel_reservation_with_lock = { data: false, error: null }
    const notTrue = await call('PATCH', { action: 'cancel-with-lock', id: 'r1' }, {})
    mock.rpcResults.cancel_reservation_with_lock = { data: true, error: null }
    mock.billingThrows = true
    const warn = await call('PATCH', { action: 'cancel-with-lock', id: 'r1' }, {})
    expect({ notTrue: [notTrue.status, notTrue.body, notTrue.billing.length], warn: [warn.status, warn.body] }).toMatchInlineSnapshot(`
      {
        "notTrue": [
          500,
          {
            "error": "予約のキャンセルに失敗しました（DB 側で処理できませんでした）",
          },
          0,
        ],
        "warn": [
          200,
          {
            "billingWarning": true,
            "success": true,
          },
        ],
      }
    `)
  })

  it('スタッフ参加枠（payment_method=staff）は料金を記録せず、顧客は期限ゲートで止まる', async () => {
    mock.tables.reservations = [reservationRow({ payment_method: 'staff' })]
    const staffEntry = await call('PATCH', { action: 'cancel-with-lock', id: 'r1' }, {})
    mock.tables.reservations = [reservationRow({ organization_id: 'org-1' })]
    mock.user = { ...CUSTOMER, orgId: 'org-1' }
    mock.gate = { ok: false, status: 400, error: '期限を過ぎています' }
    const gated = await call('PATCH', { action: 'cancel-with-group-lock', id: 'r1' }, {})
    expect({ staffEntry: [staffEntry.status, staffEntry.body, staffEntry.billing.length], gated: [gated.status, gated.body, gated.rpcs.length] }).toMatchInlineSnapshot(`
      {
        "gated": [
          400,
          {
            "error": "期限を過ぎています",
          },
          0,
        ],
        "staffEntry": [
          200,
          {
            "billingWarning": false,
            "success": true,
          },
          0,
        ],
      }
    `)
  })
})

describe('PATCH cancel: 複合の取消（予約 + グループ + 履歴 + 通知用の情報）', () => {
  it('スタッフの通常取消: グループ込み RPC、履歴は「スタッフ操作」、組織の slug を返す', async () => {
    const r = await call('PATCH', { action: 'cancel', id: 'r1' }, { cancellation_reason: '都合' })
    expect({ status: r.status, rpcs: r.rpcs, history: r.history, billing: r.billing, body: r.body }).toMatchInlineSnapshot(`
      {
        "billing": [
          {
            "actorId": "u-staff",
            "eventDate": "2026-10-10",
            "organizationId": "org-1",
            "organizerCancelled": false,
            "previouslyCancelled": false,
            "processedAt": "2026-10-02T03:00:00.000Z",
            "receivedAt": null,
            "reservationId": "r1",
            "startTime": "14:00:00",
          },
        ],
        "body": {
          "billingWarning": false,
          "contextForNotifications": {
            "organization_slug": "queens-waltz",
            "reservation": {
              "customer_id": "c1",
              "customer_name": "山田太郎",
              "id": "r1",
              "organization_id": "org-1",
              "participant_count": 3,
              "payment_method": "card",
              "private_group_id": null,
              "reservation_source": "web",
              "schedule_event_id": "ev1",
              "schedule_events": {
                "category": "open",
                "date": "2026-10-10",
                "id": "ev1",
                "is_cancelled": false,
                "start_time": "14:00:00",
              },
              "status": "confirmed",
            },
            "skip_group_cancel": false,
          },
          "reservation": {
            "customer_id": "c1",
            "customer_name": "山田太郎",
            "id": "r1",
            "organization_id": "org-1",
            "participant_count": 3,
            "payment_method": "card",
            "private_group_id": null,
            "reservation_source": "web",
            "schedule_event_id": "ev1",
            "schedule_events": {
              "category": "open",
              "date": "2026-10-10",
              "id": "ev1",
              "is_cancelled": false,
              "start_time": "14:00:00",
            },
            "status": "confirmed",
          },
        },
        "history": [
          {
            "actionType": "remove_participant",
            "cellInfo": {
              "date": "2026-10-10",
              "storeId": "store-1",
              "timeSlot": "afternoon",
            },
            "changedByName": "花子（スタッフ操作）",
            "changedByStaffId": "staff-1",
            "changedByUserId": "u-staff",
            "newValues": null,
            "notes": "山田太郎（3名）の予約をキャンセル",
            "oldValues": {
              "participant_count": 3,
              "participant_name": "山田太郎",
              "reservation_id": "r1",
            },
            "organizationId": "org-1",
            "scheduleEventId": "ev1",
          },
        ],
        "rpcs": [
          {
            "args": {
              "p_cancellation_reason": "都合",
              "p_customer_id": "c1",
              "p_reservation_id": "r1",
            },
            "name": "cancel_reservation_and_group_with_notice",
          },
        ],
        "status": 200,
      }
    `)
  })

  it('顧客本人の取消: 履歴は「（お客様）」、料金記録には受付時刻が入る', async () => {
    mock.user = { ...CUSTOMER }
    const r = await call('PATCH', { action: 'cancel', id: 'r1' }, { cancellation_reason: '都合' })
    expect({ status: r.status, history: r.history, billing: r.billing }).toMatchInlineSnapshot(`
      {
        "billing": [
          {
            "actorId": "u-cust",
            "eventDate": "2026-10-10",
            "organizationId": "org-1",
            "organizerCancelled": false,
            "previouslyCancelled": false,
            "processedAt": "2026-10-02T03:00:00.000Z",
            "receivedAt": "2026-10-02T03:00:00.000Z",
            "reservationId": "r1",
            "startTime": "14:00:00",
          },
        ],
        "history": [
          {
            "actionType": "remove_participant",
            "cellInfo": {
              "date": "2026-10-10",
              "storeId": "store-1",
              "timeSlot": "afternoon",
            },
            "changedByName": "山田太郎（お客様）",
            "changedByStaffId": null,
            "changedByUserId": "u-cust",
            "newValues": null,
            "notes": "山田太郎（3名）が予約サイトから予約をキャンセル",
            "oldValues": {
              "participant_count": 3,
              "participant_name": "山田太郎",
              "reservation_id": "r1",
            },
            "organizationId": "org-1",
            "scheduleEventId": "ev1",
          },
        ],
        "status": 200,
      }
    `)
  })

  it('グループ取消の省略（skip_group_cancel）は予約だけの RPC、履歴は「貸切管理」', async () => {
    const r = await call('PATCH', { action: 'cancel', id: 'r1' }, { skip_group_cancel: true, cancellation_reason: '却下' })
    expect({ status: r.status, rpcs: r.rpcs, history: (r.history[0] as { changedByName: string }).changedByName }).toMatchInlineSnapshot(`
      {
        "history": "花子（貸切管理）",
        "rpcs": [
          {
            "args": {
              "p_cancellation_reason": "却下",
              "p_customer_id": "c1",
              "p_reservation_id": "r1",
            },
            "name": "cancel_reservation_with_lock",
          },
        ],
        "status": 200,
      }
    `)
  })

  it('貸切却下（本文あり）は却下 RPC 1 回、料金記録は主催者都合', async () => {
    const r = await call('PATCH', { action: 'cancel', id: 'r1' }, { skip_group_cancel: true, cancel_private_event: true, private_rejection_body: '却下本文' })
    expect({ status: r.status, rpcs: r.rpcs, billing: r.billing, writes: r.writes }).toMatchInlineSnapshot(`
      {
        "billing": [
          {
            "actorId": "u-staff",
            "eventDate": "2026-10-10",
            "organizationId": "org-1",
            "organizerCancelled": true,
            "previouslyCancelled": false,
            "processedAt": "2026-10-02T03:00:00.000Z",
            "receivedAt": null,
            "reservationId": "r1",
            "startTime": "14:00:00",
          },
        ],
        "rpcs": [
          {
            "args": {
              "p_message_body": "却下本文",
              "p_reservation_id": "r1",
            },
            "name": "reject_private_booking_with_delivery",
          },
        ],
        "status": 200,
        "writes": [],
      }
    `)
  })

  it('却下 RPC のエラーコードを案内に変換する', async () => {
    const out: Record<string, unknown> = {}
    const rejection = { skip_group_cancel: true, cancel_private_event: true, private_rejection_body: '却下本文' }
    for (const message of ['PRIVATE_EVENT_HAS_OTHER_RESERVATIONS', 'PRIVATE_GROUP_RESERVATION_MISMATCH', 'PRIVATE_GROUP_ORGANIZATION_MISMATCH', 'REJECTION_NOTICE_CONFLICT', 'RESERVATION_ALREADY_CANCELLED', 'OTHER']) {
      mock.rpcResults.reject_private_booking_with_delivery = { data: null, error: { message } }
      const r = await call('PATCH', { action: 'cancel', id: 'r1' }, rejection)
      out[message] = [r.status, (r.body as { error: string }).error]
    }
    mock.rpcResults.reject_private_booking_with_delivery = { data: null, error: { code: '42501', message: 'x' } }
    out.forbidden = (await call('PATCH', { action: 'cancel', id: 'r1' }, rejection)).status
    expect(out).toMatchInlineSnapshot(`
      {
        "OTHER": [
          409,
          "貸切却下を保存できませんでした。状態を再読込して確認してください",
        ],
        "PRIVATE_EVENT_HAS_OTHER_RESERVATIONS": [
          409,
          "この公演には別の有効な予約があります。予約一覧を確認してから却下してください",
        ],
        "PRIVATE_GROUP_ORGANIZATION_MISMATCH": [
          409,
          "申込と貸切グループの所属組織が一致しません",
        ],
        "PRIVATE_GROUP_RESERVATION_MISMATCH": [
          409,
          "貸切グループに別の申込が紐付いています。再読込してください",
        ],
        "REJECTION_NOTICE_CONFLICT": [
          409,
          "この却下は別の内容で保存済みです。通知履歴を確認してください",
        ],
        "RESERVATION_ALREADY_CANCELLED": [
          409,
          "この予約は別の理由で取消済みです。取消履歴を確認してください",
        ],
        "forbidden": 403,
      }
    `)
  })

  it('公演の中止（cancel_private_event）は貸切の未中止公演だけを更新し、失敗は警告で返す', async () => {
    mock.tables.schedule_events = [eventRow({ category: 'private' })]
    mock.tables.reservations = [reservationRow({ schedule_events: { id: 'ev1', category: 'private' } })]
    const ok = await call('PATCH', { action: 'cancel', id: 'r1' }, { cancel_private_event: true, cancellation_reason: '却下' })
    const updates = ok.writes.filter(w => w.table === 'schedule_events')
    mock.tables.schedule_events = [eventRow({ category: 'open' })]
    const open = await call('PATCH', { action: 'cancel', id: 'r1' }, { cancel_private_event: true })
    mock.tables.schedule_events = [eventRow({ category: 'private' })]
    mock.tableErrors.schedule_events = { message: 'boom' }
    const failed = await call('PATCH', { action: 'cancel', id: 'r1' }, { cancel_private_event: true })
    expect({ updates, openUpdated: open.writes.filter(w => w.table === 'schedule_events').length, failed: [failed.status, (failed.body as { eventCancelWarning?: boolean }).eventCancelWarning] }).toMatchInlineSnapshot(`
      {
        "failed": [
          200,
          true,
        ],
        "openUpdated": 0,
        "updates": [
          {
            "op": "update",
            "payload": {
              "cancellation_reason": "却下",
              "cancelled_at": "2026-10-02T03:00:00.000Z",
              "is_cancelled": true,
            },
            "table": "schedule_events",
          },
        ],
      }
    `)
  })

  it('不正な却下条件は予約を読む前に 400、顧客が公演中止や省略を指定すると 403', async () => {
    const bad = await call('PATCH', { action: 'cancel', id: 'r1' }, { private_rejection_body: '本文だけ' })
    mock.user = { ...CUSTOMER }
    const cust = await call('PATCH', { action: 'cancel', id: 'r1' }, { skip_group_cancel: true })
    expect({ bad: [bad.status, bad.body], cust: [cust.status, cust.body] }).toMatchInlineSnapshot(`
      {
        "bad": [
          400,
          {
            "error": "貸切却下の本文と処理条件を確認してください",
          },
        ],
        "cust": [
          403,
          {
            "error": "スタッフ権限が必要です",
          },
        ],
      }
    `)
  })

  it('他組織は 403、無ければ 404、期限ゲートで顧客は止まる', async () => {
    mock.tables.reservations = [reservationRow({ organization_id: 'org-9' })]
    const other = await call('PATCH', { action: 'cancel', id: 'r1' }, {})
    mock.tables.reservations = []
    const none = await call('PATCH', { action: 'cancel', id: 'r1' }, {})
    mock.tables.reservations = [reservationRow()]
    mock.user = { ...CUSTOMER, orgId: 'org-1' }
    mock.gate = { ok: false, status: 400, error: '期限を過ぎています' }
    const gated = await call('PATCH', { action: 'cancel', id: 'r1' }, {})
    expect({ other: [other.status, other.body], none: [none.status, none.body], gated: [gated.status, gated.body, gated.rpcs.length] }).toMatchInlineSnapshot(`
      {
        "gated": [
          400,
          {
            "error": "期限を過ぎています",
          },
          0,
        ],
        "none": [
          404,
          {
            "error": "予約が見つかりません",
          },
        ],
        "other": [
          403,
          {
            "error": "他組織の予約は操作できません",
          },
        ],
      }
    `)
  })
})

describe('PATCH update-participants-with-lock / recalculate-prices', () => {
  it('人数変更は RPC update_reservation_participants に渡し、結果を success で返す', async () => {
    mock.user = { ...CUSTOMER }
    const r = await call('PATCH', { action: 'update-participants-with-lock', id: 'r1' }, { new_count: 5, customer_id: 'c1' })
    expect(only(r, 'status', 'body', 'rpcs')).toMatchInlineSnapshot(`
      {
        "body": {
          "success": true,
        },
        "rpcs": [
          {
            "args": {
              "p_customer_id": "c1",
              "p_new_count": 5,
              "p_reservation_id": "r1",
            },
            "name": "update_reservation_participants",
          },
        ],
        "status": 200,
      }
    `)
  })

  it.each(['P0050', 'P0006', 'P0007', 'P0008', 'P0010', 'P0011', '42501', 'XX000'])('人数変更の RPC エラー %s の変換', async code => {
    mock.user = { ...CUSTOMER }
    mock.rpcResults.update_reservation_participants = { data: null, error: { code, message: `fixture ${code}` } }
    const r = await call('PATCH', { action: 'update-participants-with-lock', id: 'r1' }, { new_count: 5 })
    expect([r.status, r.body]).toMatchSnapshot()
  })

  it('new_count が無ければ 400、予約が無ければ 404', async () => {
    mock.user = { ...CUSTOMER }
    const noCount = await call('PATCH', { action: 'update-participants-with-lock', id: 'r1' }, {})
    mock.tables.reservations = []
    const none = await call('PATCH', { action: 'update-participants-with-lock', id: 'r1' }, { new_count: 2 })
    expect({ noCount: [noCount.status, noCount.body], none: [none.status, none.body] }).toMatchInlineSnapshot(`
      {
        "noCount": [
          400,
          {
            "error": "new_count が必要です",
          },
        ],
        "none": [
          404,
          {
            "error": "予約が見つかりません",
          },
        ],
      }
    `)
  })

  it('料金の再計算は RPC admin_recalculate_reservation_prices、他組織は 403', async () => {
    const ok = await call('PATCH', { action: 'recalculate-prices', id: 'r1' }, { participant_names: ['A', 'B'] })
    mock.rpcResults.admin_recalculate_reservation_prices = { data: false, error: null }
    const falsy = await call('PATCH', { action: 'recalculate-prices', id: 'r1' }, {})
    mock.rpcResults.admin_recalculate_reservation_prices = { data: null, error: { message: 'down' } }
    const err = await call('PATCH', { action: 'recalculate-prices', id: 'r1' }, {})
    mock.tables.reservations = [reservationRow({ organization_id: 'org-9' })]
    const other = await call('PATCH', { action: 'recalculate-prices', id: 'r1' }, {})
    expect({ ok: only(ok, 'status', 'body', 'rpcs'), falsy: [falsy.status, falsy.body], err: [err.status, err.body], other: [other.status, other.body] }).toMatchInlineSnapshot(`
      {
        "err": [
          500,
          {
            "detail": "down",
            "error": "料金再計算に失敗しました",
          },
        ],
        "falsy": [
          200,
          {
            "success": false,
          },
        ],
        "ok": {
          "body": {
            "success": true,
          },
          "rpcs": [
            {
              "args": {
                "p_participant_names": [
                  "A",
                  "B",
                ],
                "p_reservation_id": "r1",
              },
              "name": "admin_recalculate_reservation_prices",
            },
          ],
          "status": 200,
        },
        "other": [
          403,
          {
            "error": "他組織の予約は操作できません",
          },
        ],
      }
    `)
  })
})

describe('PATCH sync-staff-reservation-statuses: 複数予約の一括ステータス', () => {
  beforeEach(() => {
    mock.tables.reservations = [
      reservationRow({ id: 'a', participant_names: ['花子'], participant_count: 1, reservation_source: 'staff_entry' }),
      reservationRow({ id: 'b', participant_names: null, participant_count: null, reservation_source: null, schedule_event_id: 'ev2' }),
      reservationRow({ id: 'c', organization_id: 'org-9' }),
    ]
  })

  it('自組織の予約だけを cancelled にし、解除の履歴を予約ごとに残す', async () => {
    const r = await call('PATCH', { action: 'sync-staff-reservation-statuses' }, { reservation_ids: ['a', 'b', 'c'] })
    expect(only(r, 'status', 'body', 'writes', 'history')).toMatchInlineSnapshot(`
      {
        "body": {
          "success": true,
          "updatedCount": 2,
        },
        "history": [
          {
            "actionType": "remove_participant",
            "cellInfo": {
              "date": "2026-10-10",
              "storeId": "store-1",
              "timeSlot": "afternoon",
            },
            "changedByName": "花子（スタッフ参加同期）",
            "changedByStaffId": "staff-1",
            "changedByUserId": "u-staff",
            "newValues": null,
            "notes": "花子 をスタッフ参加同期で解除",
            "oldValues": {
              "participant_count": 1,
              "participant_name": "花子",
              "reservation_id": "a",
              "reservation_source": "staff_entry",
            },
            "organizationId": "org-1",
            "scheduleEventId": "ev1",
          },
          {
            "actionType": "remove_participant",
            "cellInfo": {
              "date": "2026-10-10",
              "storeId": "store-1",
              "timeSlot": "afternoon",
            },
            "changedByName": "花子（スタッフ参加同期）",
            "changedByStaffId": "staff-1",
            "changedByUserId": "u-staff",
            "newValues": null,
            "notes": "(スタッフ) をスタッフ参加同期で解除",
            "oldValues": {
              "participant_count": 1,
              "participant_name": "(スタッフ)",
              "reservation_id": "b",
              "reservation_source": "staff_entry",
            },
            "organizationId": "org-1",
            "scheduleEventId": "ev2",
          },
        ],
        "status": 200,
        "writes": [
          {
            "op": "update",
            "payload": {
              "status": "cancelled",
              "updated_at": "2026-10-02T03:00:00.000Z",
            },
            "table": "reservations",
          },
        ],
      }
    `)
  })

  it('cancelled 以外への変更では履歴を残さず、対象が無ければ 403、ids 不正は 400', async () => {
    const other = await call('PATCH', { action: 'sync-staff-reservation-statuses' }, { reservation_ids: ['a'], status: 'confirmed' })
    const none = await call('PATCH', { action: 'sync-staff-reservation-statuses' }, { reservation_ids: ['c'] })
    const bad = await call('PATCH', { action: 'sync-staff-reservation-statuses' }, { reservation_ids: [] })
    expect({ other: [other.status, other.body, other.history.length, (other.writes[0].payload as { status: string }).status], none: [none.status, none.body], bad: [bad.status, bad.body] }).toMatchInlineSnapshot(`
      {
        "bad": [
          400,
          {
            "error": "reservation_ids（配列）が必要です",
          },
        ],
        "none": [
          403,
          {
            "error": "対象予約が見つからない、または他組織の予約です",
          },
        ],
        "other": [
          200,
          {
            "success": true,
            "updatedCount": 1,
          },
          0,
          "confirmed",
        ],
      }
    `)
  })
})

describe('DELETE と未知のアクション', () => {
  it('削除は RPC admin_delete_reservations_by_ids に 1 件で渡し、他組織は 403', async () => {
    const ok = await call('DELETE', { id: 'r1' })
    mock.tables.reservations = [reservationRow({ organization_id: 'org-9' })]
    const other = await call('DELETE', { id: 'r1' })
    mock.rpcResults.admin_delete_reservations_by_ids = { data: null, error: { message: 'down' } }
    mock.tables.reservations = [reservationRow()]
    const err = await call('DELETE', { id: 'r1' })
    mock.user = { ...CUSTOMER }
    const cust = await call('DELETE', { id: 'r1' })
    expect({ ok: only(ok, 'status', 'body', 'rpcs'), other: [other.status, other.body], err: [err.status, err.body], cust: [cust.status, cust.body] }).toMatchInlineSnapshot(`
      {
        "cust": [
          403,
          {
            "error": "スタッフ権限が必要です",
          },
        ],
        "err": [
          500,
          {
            "detail": "down",
            "error": "予約の削除に失敗しました",
          },
        ],
        "ok": {
          "body": {
            "success": true,
          },
          "rpcs": [
            {
              "args": {
                "p_reservation_ids": [
                  "r1",
                ],
              },
              "name": "admin_delete_reservations_by_ids",
            },
          ],
          "status": 200,
        },
        "other": [
          403,
          {
            "error": "他組織の予約は操作できません",
          },
        ],
      }
    `)
  })

  it('許可しないメソッドは 405、OPTIONS は 204、未知の action は 400', async () => {
    const put = await call('PUT', {})
    const options = await call('OPTIONS', {})
    const post = await call('POST', { action: 'zzz' }, {})
    const patch = await call('PATCH', { action: 'zzz' }, {})
    expect({ put: [put.status, put.body], options: options.status, post: [post.status, post.body], patch: [patch.status, patch.body] }).toMatchInlineSnapshot(`
      {
        "options": 204,
        "patch": [
          400,
          {
            "error": "unknown action: zzz",
          },
        ],
        "post": [
          400,
          {
            "error": "unknown action: zzz",
          },
        ],
        "put": [
          405,
          {
            "error": "Method not allowed",
          },
        ],
      }
    `)
  })
})

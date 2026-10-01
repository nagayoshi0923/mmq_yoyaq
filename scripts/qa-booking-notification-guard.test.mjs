import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { transformSync } from 'esbuild'

const stage = 'https://lavutzztfqbdndjiwluc.supabase.co'
const prod = 'https://cznpcewciwywcqcxktba.supabase.co'
const org = 'bda7cbb7-0d58-4e5c-ab4a-b45d09afdb3e'
const event = 'ade5cca7-317a-49a3-865a-a8a2fbc046ec'
const customer = '57d39609-5c18-408c-95af-a407f3a37a53'
const store = '486e6f7d-e319-47d9-ad21-52d2ad5b654f'
const master = 'e1b1c080-8d1a-45b5-ac24-378993c57630'
const user = '05032480-0349-49f3-bdc2-6cddb245796d'
const email = 'qa-customer-a-20261001@example.invalid'
function loadModule(path) {
  const module = { exports: {} }
  new Function('module', 'exports', transformSync(fs.readFileSync(path, 'utf8'), { loader: 'ts', format: 'cjs' }).code)(module, module.exports)
  return module.exports
}
const { checkQaBookingNotificationGuard } = loadModule('supabase/functions/_shared/qa-booking-notification-guard.ts')
const { confirmedReservationPrice } = loadModule('supabase/functions/_shared/confirmed-reservation-price.ts')
function fixture(options = {}) {
  const reservation = {
    id: 'local-reservation', organization_id: org, customer_id: customer, customer_email: email,
    schedule_event_id: event, store_id: store, scenario_master_id: master,
    private_group_id: null, candidate_datetimes: null, reservation_source: 'web', payment_status: 'pending',
    coupon_usage_id: null, final_price: 1000, total_price: 1000, discount_amount: 0, participant_count: 1,
    status: options.kind === 'cancel' ? 'cancelled' : 'confirmed',
    schedule_events: { is_cancelled: false, store_id: store }, ...options.reservation,
  }
  const rows = {
    reservations: reservation,
    organizations: { id: org, slug: 'mmq-qa-20261001-e9a3353f' },
    schedule_events: { id: event, organization_id: org, store_id: store, scenario_master_id: master,
      organization_scenario_id: '050a9f0d-128f-4d73-ac65-4f5ec3074f0e', category: 'open',
      is_private_booking: false, is_private_request: false, is_cancelled: false },
    customers: { id: customer, user_id: user, organization_id: null, email },
    global_settings: { organization_id: org, enable_email_notifications: false, enable_discord_notifications: false },
    compensated_cancellation_notices: null,
    cancellation_billing_claims: { data: { assessment: { status: 'free', amount: 0 }, contact: { channel: 'mmq' } } },
    booking_email_queue: null, ...options.rows,
  }
  const reads = [], writes = [], sent = [], logs = [], settings = []
  const db = { from(table) {
    const state = { table, filters: {}, columns: null, write: null }
    const query = {
      select(columns) { state.columns = columns; return this },
      eq(key, value) { state.filters[key] = value; return this },
      upsert(data) { state.write = { operation: 'upsert', data }; return this },
      insert(data) { state.write = { operation: 'insert', data }; return this },
      update(data) { state.write = { operation: 'update', data }; return this },
      async execute() {
        if (state.write) { writes.push(structuredClone(state)); return { data: null, error: null } }
        reads.push(structuredClone(state))
        if (options.throwTable === table) throw new Error('local-sensitive-error-must-not-escape')
        if (options.errorTable === table) return { data: null, error: { message: 'local-sensitive-error-must-not-escape' } }
        return { data: rows[table] ?? null, error: null }
      },
      single() { return this.execute() }, maybeSingle() { return this.execute() },
      then(resolve, reject) { return this.execute().then(resolve, reject) },
    }
    return query
  } }
  const path = `supabase/functions/${options.kind === 'cancel' ? 'send-cancellation-confirmation' : 'send-booking-confirmation'}/index.ts`
  const original = fs.readFileSync(path, 'utf8')
  // Compare with the pre-guard handler without importing remote modules or real credentials.
  const source = (options.baseline ? original.replace(/    const qaDecision = await checkQaBookingNotificationGuard[\s\S]*?\n    \)\n/, '') : original).replace(/^import .*$/gm, '')
  let handler
  const env = { SUPABASE_URL: options.url ?? stage, RESEND_API_KEY: 'local-provider-stub', SENDER_EMAIL: 'sender@example.invalid' }
  const names = ['serve', 'createClient', 'getEmailSettings', 'getStoreEmailSettings', 'replaceTemplateVariables',
    'getAnonKey', 'getServiceRoleKey', 'getCorsHeaders', 'maskEmail', 'maskName', 'verifyAuth', 'isCronOrServiceRoleCall',
    'errorResponse', 'sanitizeErrorMessage', 'confirmedReservationPrice', 'insertEmailLog', 'updateEmailLog',
    'checkQaBookingNotificationGuard', 'Deno', 'fetch', 'console']
  new Function(...names, transformSync(source, { loader: 'ts', format: 'cjs' }).code)(
    f => { handler = f }, () => db,
    async () => { settings.push('email'); return { resendApiKey: 'local-provider-stub', senderEmail: 'sender@example.invalid', senderName: 'Local Test' } },
    async () => { settings.push('store'); return null }, value => value,
    () => 'local-anon-stub', () => 'local-service-stub', () => ({}), () => '[masked]', () => '[masked]',
    async () => options.authDenied ? { success: false, error: 'Denied', statusCode: 401 } : { success: true }, () => false,
    (error, status) => Response.json({ success: false, error }, { status }), () => 'redacted', confirmedReservationPrice,
    async (_, record) => { logs.push(record); return 'local-email-log' }, async () => {},
    checkQaBookingNotificationGuard, { env: { get: name => env[name] } },
    async (url, init) => { sent.push({ url, body: JSON.parse(init.body), headers: init.headers }); return Response.json({ id: 'local-provider-message' }) },
    { log() {}, warn() {}, error() {} },
  )
  const body = { reservationId: reservation.id, organizationId: reservation.organization_id, storeId: store,
    customerEmail: reservation.customer_email, customerName: 'Local QA', scenarioTitle: 'Local Scenario',
    eventDate: '2026-10-15', startTime: '10:00', endTime: '11:00', storeName: 'Local Store',
    participantCount: 1, totalPrice: 999999, reservationNumber: 'local-number', cancelledBy: 'customer' }
  return { db, reservation, reads, writes, sent, logs, settings,
    request: override => handler(new Request('https://example.invalid/edge', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...override }) })), handler }
}
function noSideEffects(f) {
  assert.equal(f.sent.length, 0); assert.equal(f.writes.length, 0)
  assert.equal(f.logs.length, 0); assert.equal(f.settings.length, 0)
}
for (const kind of ['confirmation', 'cancel']) {
  test(`${kind}: 固定QAは実ハンドラでskipしprovider・queue・送信ログ0`, async () => {
    const f = fixture({ kind }); const response = await f.request()
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { success: true, skipped: true, reason: 'qa_notification_suppressed' })
    noSideEffects(f)
    assert.deepEqual(f.reads.filter(r => ['organizations', 'schedule_events', 'customers', 'global_settings'].includes(r.table)).map(r => r.table), ['organizations', 'schedule_events', 'customers', 'global_settings'])
    for (const r of f.reads.filter(r => ['schedule_events', 'global_settings'].includes(r.table))) assert.equal(r.filters.organization_id, org)
    assert.equal(f.reads.find(r => r.table === 'customers').filters.user_id, user)
  })
  test(`${kind}: 不一致fixture・空結果・読取error/例外は503で送信へ戻らない`, async () => {
    for (const options of [
      { rows: { organizations: null } }, { rows: { organizations: { id: org, slug: 'other' } } },
      { rows: { schedule_events: null } }, { rows: { schedule_events: { id: event, organization_id: 'other' } } },
      { rows: { customers: null } }, { rows: { customers: { id: customer, user_id: 'other' } } },
      { rows: { global_settings: null } }, { rows: { global_settings: { organization_id: org, enable_email_notifications: true, enable_discord_notifications: false } } },
      ...['organizations', 'schedule_events', 'customers', 'global_settings'].flatMap(table => [{ errorTable: table }, { throwTable: table }]),
    ]) {
      const f = fixture({ kind, ...options }); const response = await f.request()
      assert.equal(response.status, 503, JSON.stringify(options)); assert.doesNotMatch(await response.text(), /local-sensitive-error/)
      noSideEffects(f)
    }
  })
  test(`${kind}: QAの対象外公演/顧客/店舗/貸切/有料済み/クーポンはfail closed`, async () => {
    for (const reservation of [
      { schedule_event_id: 'other' }, { customer_id: 'other' }, { store_id: 'other' },
      { scenario_master_id: 'other' }, { candidate_datetimes: [] }, { private_group_id: 'other' },
      { payment_status: 'paid' }, { reservation_source: 'manual' }, { coupon_usage_id: 'coupon' },
    ]) {
      const f = fixture({ kind, reservation }); assert.equal((await f.request()).status, 503); noSideEffects(f)
    }
  })
  test(`${kind}: clientの偽造QA組織/メールは既存403で拒否`, async () => {
    const ordinary = fixture({ kind, reservation: { organization_id: 'ordinary-org' } })
    assert.equal((await ordinary.request({ organizationId: org })).status, 403); noSideEffects(ordinary)
    const qa = fixture({ kind }); assert.equal((await qa.request({ customerEmail: 'other@example.invalid' })).status, 403); noSideEffects(qa)
  })
  test(`${kind}: 通常stagingと本番のprovider payload/副作用はguard前と同じ`, async () => {
    for (const options of [{ reservation: { organization_id: 'ordinary-org' } }, { url: prod }, { url: prod, reservation: { organization_id: 'ordinary-org' } }]) {
      const f = fixture({ kind, ...options }); const baseline = fixture({ kind, ...options, baseline: true })
      const response = await f.request(); const before = await baseline.request()
      assert.equal(response.status, 200); assert.equal(response.status, before.status)
      assert.deepEqual(await response.json(), await before.json()); assert.equal(f.sent.length, 1)
      assert.deepEqual(f.sent, baseline.sent); assert.equal(f.writes.length, baseline.writes.length)
      assert.equal(f.logs.length, baseline.logs.length); assert.deepEqual(f.settings, baseline.settings)
      assert.equal(f.reads.some(r => ['organizations', 'schedule_events', 'customers', 'global_settings'].includes(r.table)), false)
    }
  })
  test(`${kind}: 既存認証/不在予約拒否とOPTIONSを保持`, async () => {
    const denied = fixture({ kind, authDenied: true }); assert.equal((await denied.request()).status, 401); noSideEffects(denied)
    const absent = fixture({ kind, rows: { reservations: null } }); assert.equal((await absent.request()).status, 404); noSideEffects(absent)
    const options = fixture({ kind }); assert.equal((await options.handler(new Request('https://example.invalid', { method: 'OPTIONS' }))).status, 200); noSideEffects(options)
  })
}
test('guard: URL偽装/欠損/未知環境は固定QAだけfail closed', async () => {
  for (const url of [undefined, '', 'http://lavutzztfqbdndjiwluc.supabase.co', stage + '.evil.invalid', stage + '/other', stage + '?project=prod', 'https://example.invalid', 'https://user:pass@lavutzztfqbdndjiwluc.supabase.co']) {
    const f = fixture(); assert.deepEqual(await checkQaBookingNotificationGuard(f.db, f.reservation, url), { kind: 'blocked', reason: 'qa_environment_unverified' }); noSideEffects(f)
    assert.equal(f.reads.length, 0)
  }
  const f = fixture(); assert.equal((await checkQaBookingNotificationGuard(f.db, { organization_id: 'ordinary-org' }, undefined)).kind, 'not_applicable'); assert.equal(f.reads.length, 0)
})
test('guard: 閉鎖後と旧nullable作品列も公演の作品照合で停止を維持', async () => {
  const f = fixture({ reservation: { scenario_master_id: null } })
  assert.equal((await checkQaBookingNotificationGuard(f.db, f.reservation, stage + '/')).kind, 'suppressed')
  assert.equal((await f.request()).status, 200); noSideEffects(f)
  const missing = fixture({ reservation: { scenario_master_id: undefined } })
  assert.equal((await checkQaBookingNotificationGuard(missing.db, missing.reservation, stage)).kind, 'blocked')
})

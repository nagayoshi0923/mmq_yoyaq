import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { transformSync } from 'esbuild'
const compile = path => transformSync(fs.readFileSync(path, 'utf8').replace(/^import .*$/gm, ''), { loader: 'ts', format: 'cjs' }).code
const handlerCode = compile('supabase/functions/send-private-booking-rejection/index.ts')
const securityCode = compile('supabase/functions/_shared/security.ts')
const org = '11111111-1111-1111-1111-111111111111'
const id = '22222222-2222-2222-2222-222222222222'
function fixture(options = {}) {
  let handler
  const sends = [], logs = [], reads = [], settings = []
  const reservation = { id, organization_id: org, status: 'cancelled', private_group_id: 'group', reservation_source: 'web_private', customer_email: 'saved@example.invalid', customer_name: '保存氏名<test>', title: '保存作品', candidate_datetimes: { candidates: [{ date: '2026-11-01', startTime: '15:30', endTime: '18:00' }] }, customers: { email: 'account@example.invalid', name: 'アカウント氏名' }, ...options.reservation }
  const db = {
    auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: 'staff-user' } : null }, error: token === 'valid' ? null : { message: 'invalid' } }) },
    rpc: async name => ({ data: name === 'is_org_admin' ? !!options.admin : options.userOrg ?? org, error: options.rpcError ?? null }),
    from(table) {
      const filters = {}
      const query = {
        select(columns) { if (table === 'schedule_events') assert.equal(columns, 'is_private_booking,category'); return query }, eq(key, value) { filters[key] = value; return query },
        async maybeSingle() {
          reads.push({ table, filters })
          if (options.queryError === table) return { data: null, error: { message: 'unavailable' } }
          let data
          if (table === 'staff') data = options.active === false ? null : { id: 'staff-id' }
          if (table === 'reservations') data = options.missing || filters.organization_id !== reservation.organization_id ? null : reservation
          if (table === 'private_groups') data = options.missingGroup ? null : { reservation_id: id, status: 'date_adjusting', ...options.group }
          if (table === 'schedule_events') data = { category: 'private', ...options.event }
          return { data, error: null }
        }
      }
      return query
    }
  }
  const Deno = { env: { get: () => 'configured' } }, quiet = { log() {}, warn() {}, error() {} }
  const module = { exports: {} }
  new Function('module', 'createClient', 'Deno', 'console', securityCode)(module, () => db, Deno, quiet)
  const security = module.exports
  const dependencies = {
    serve: f => { handler = f }, createClient: () => db, ...security,
    getEmailSettings: async (_, organizationId) => { settings.push(organizationId); return { resendApiKey: 'key' } },
    getStoreEmailSettings: async () => ({ private_rejection_template: options.template }),
    replaceTemplateVariables: (value, variables) => value.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? ''),
    insertEmailLog: async (_, value) => { logs.push(value); return 'log' }, updateEmailLog: async () => {},
    Deno, console: quiet,
    fetch: async (_, init) => { sends.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'mail' }), { status: options.sendFail ? 503 : 200 }) }
  }
  new Function(...Object.keys(dependencies), handlerCode)(...Object.values(dependencies))
  const request = (body = {}, token = 'valid') => handler(new Request('https://example.invalid/reject', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ organizationId: org, reservationId: id, customerEmail: 'saved@example.invalid', customerName: 'FORGED', scenarioTitle: 'FORGED', candidateDates: [{ date: '2030-01-01' }], rejectionReason: '理由<a>', ...body })
  }))
  return { request, sends, logs, reads, settings, handler }
}
test('実verifyAuthで匿名・無効JWT・公開鍵を拒否し、予約も設定も読まない', async () => {
  for (const token of [null, 'invalid', 'sb_publishable_test', 'sb_secret_test']) {
    const f = fixture(); assert.equal((await f.request({}, token)).status, 401)
    assert.equal(f.reads.length, 0); assert.equal(f.settings.length, 0); assert.equal(f.sends.length, 0)
  }
})
test('顧客・退職スタッフ・他組織管理者を拒否', async () => {
  for (const options of [{ active: false }, { active: false, admin: true, userOrg: 'foreign' }]) {
    const f = fixture(options); assert.equal((await f.request()).status, 403)
    assert.equal(f.reads.some(r => r.table === 'reservations'), false); assert.equal(f.sends.length, 0)
  }
})
test('予約・貸切状態・宛先不整合は設定取得と送信より前に拒否', async () => {
  for (const [options, body, status] of [
    [{ reservation: { status: 'confirmed' } }, {}, 409],
    [{ missing: true }, {}, 404],
    [{ group: { reservation_id: 'new' } }, {}, 409],
    [{ group: { status: 'confirmed' } }, {}, 409],
    [{ missingGroup: true }, {}, 409],
    [{ reservation: { private_group_id: null, reservation_source: 'web' } }, {}, 409],
    [{}, { customerEmail: 'other@example.invalid' }, 409],
    [{ rpcError: { message: 'failed' } }, {}, 503],
    [{ queryError: 'reservations' }, {}, 503],
    [{ queryError: 'private_groups' }, {}, 503]
  ]) {
    const f = fixture(options); assert.equal((await f.request(body)).status, status)
    assert.equal(f.settings.length, 0); assert.equal(f.sends.length, 0)
  }
})
test('有効スタッフと同組織管理者の送信は保存済みの宛先・氏名・作品・候補日を使用', async () => {
  for (const options of [{}, { active: false, admin: true }]) {
    const f = fixture(options); assert.equal((await f.request()).status, 200)
    assert.deepEqual(f.sends[0].to, ['saved@example.invalid']); assert.match(f.sends[0].text, /保存氏名<test>/)
    assert.match(f.sends[0].text, /保存作品/); assert.match(f.sends[0].text, /2026年11月1日/)
    assert.doesNotMatch(f.sends[0].text, /FORGED|2030|アカウント氏名/)
    assert.match(f.sends[0].html, /保存氏名&lt;test&gt;/); assert.match(f.sends[0].html, /理由&lt;a&gt;/)
    for (const r of f.reads) assert.equal(r.filters.organization_id, org)
    assert.equal(f.logs[0].organization_id, org)
  }
})
test('全文編集とテンプレートはテキスト保持・HTMLエスケープ', async () => {
  for (const [options, body] of [[{}, { customEmailBody: '<a href="https://example.invalid">本文</a>' }], [{ template: '{{customer_name}} <a>本文</a>' }, {}]]) {
    const f = fixture(options); assert.equal((await f.request(body)).status, 200)
    assert.match(f.sends[0].text, /<a/); assert.doesNotMatch(f.sends[0].html, /<a[ >]/)
    assert.match(f.sends[0].html, /&lt;a/)
  }
})
test('旧グループなし貸切・categoryのみの貸切と顧客連絡先フォールバックを保持', async () => {
  const f = fixture({ reservation: { private_group_id: null, reservation_source: 'web', schedule_event_id: 'event', customer_email: null, customer_name: null } })
  assert.equal((await f.request({ customerEmail: 'account@example.invalid' })).status, 200)
  assert.deepEqual(f.sends[0].to, ['account@example.invalid']); assert.match(f.sends[0].text, /アカウント氏名/)
})
test('不正本文・メソッド・送信サービス失敗を成功扱いにしない', async () => {
  const f = fixture(); assert.equal((await f.request({ customEmailBody: {} })).status, 400)
  assert.equal((await f.handler(new Request('https://example.invalid'))).status, 405); assert.equal(f.sends.length, 0)
  const failed = fixture({ sendFail: true }); const response = await failed.request()
  assert.equal(response.status, 400); assert.equal((await response.json()).success, false)
})

test('貸切フラグのみの紐づく公演でも送信できる', async () => {
  const f = fixture({ reservation: { private_group_id: null, reservation_source: 'web', schedule_event_id: 'event' }, event: { category: 'normal', is_private_booking: true } })
  assert.equal((await f.request()).status, 200); assert.equal(f.sends.length, 1)
})

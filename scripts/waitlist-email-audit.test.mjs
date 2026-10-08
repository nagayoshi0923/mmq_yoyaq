import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { transformSync } from 'esbuild'
const compile = path => transformSync(fs.readFileSync(path, 'utf8').replace(/^import .*$/gm, ''), { loader: 'ts', format: 'cjs' }).code
const quiet = { log() {}, error() {}, warn() {} }
const mod = { exports: {} }
new Function('module', 'crypto', 'TextEncoder', compile('supabase/functions/notify-waitlist/email-audit.ts'))(mod, globalThis.crypto, TextEncoder)
const audit = mod.exports
const org = '11111111-1111-1111-1111-111111111111'
const event = '22222222-2222-2222-2222-222222222222'
function fixture(options = {}) {
  let handler, fixedPayload
  const sends = [], acknowledgments = [], logs = new Map(), trace = []
  let auditFailure = options.auditFailure, providerRejected = options.providerRejected
  for (const row of options.initialLogs ?? []) logs.set(row.id, structuredClone(row))
  const db = {
    from(table) {
      let updates, operation = 'read'; const filters = []
      const query = {
        select() { return query }, eq(key, value) { filters.push(row => row[key] === value); return query },
        is(key, value) { filters.push(row => (row[key] ?? null) === value); return query },
        in(key, values) { filters.push(row => values.includes(row[key])); return query },
        then(resolve, reject) { return query.maybeSingle().then(resolve, reject) },
        update(value) { updates = value; operation = 'update'; return query },
        upsert(value, opts) {
          assert.equal(opts.ignoreDuplicates, true)
          trace.push('audit-prepare')
          if (!options.insertFailure && !logs.has(value.id)) logs.set(value.id, { ...value })
          return Promise.resolve({ error: options.insertFailure ? { message: 'DB unavailable' } : null })
        },
        async maybeSingle() {
          if (table === 'schedule_events') return { data: { organization_id: org, store_id: 'store' }, error: null }
          if (table === 'email_logs') {
            const row = [...logs.values()].find(row => filters.every(matches => matches(row)))
            if (operation === 'update') {
              trace.push('audit-ack')
              if (auditFailure === 'throw') throw new Error('DB unavailable')
              if (auditFailure === 'error') return { data: null, error: { message: 'DB unavailable' } }
              if (auditFailure === 'missing') return { data: null, error: null }
              if (row) Object.assign(row, updates)
            }
            return { data: row ? { id: row.id } : null, error: null }
          }
          return { data: null, error: null }
        },
        async single() { return { data: { slug: 'fixture' }, error: null } }
      }
      return query
    },
    async rpc(name, args) {
      if (name === 'claim_waitlist_notice') return { data: { noticeId: 'notice', entries: [{ id: 'wait', customer_name: '架空顧客', customer_email: 'qa@example.invalid', deliveryKey: 'fixed-key' }], metadata: { scenarioTitle: '架空作品', eventDate: '2026-11-01', startTime: '19:00', endTime: '23:00', storeName: '架空会場' } }, error: null }
      if (name === 'prepare_waitlist_notice_payload') {
        fixedPayload ??= options.legacyPayload ?? structuredClone(args.p_payload)
        return { data: structuredClone(fixedPayload), error: null }
      }
      if (name === 'finish_waitlist_notice') { trace.push(args.p_sent ? 'delivery-ack' : 'known-failure'); acknowledgments.push(args); return { data: !options.deliveryAckFailure, error: options.deliveryAckFailure ? { message: 'DB unavailable' } : null } }
      throw new Error(name)
    }
  }
  const deps = {
    ...audit, serve: fn => { handler = fn }, createClient: () => db,
    getCorsHeaders: () => ({}), isCronOrServiceRoleCall: () => true,
    getServiceRoleKey: () => 'fake-key', checkRateLimit: async () => ({ allowed: true }),
    errorResponse: (message, status) => new Response(JSON.stringify({ message }), { status }),
    sanitizeErrorMessage: value => String(value), verifyAuth: async () => ({ success: false }), rateLimitResponse: () => new Response('', { status: 429 }),
    getEmailSettings: async () => ({ resendApiKey: 'fake-provider-key' }), getEmailTemplates: async () => ({}), getStoreEmailSettings: async () => ({}),
    emailLogTags: id => [{ name: 'email_log_id', value: id }], emailLogIdFromTags: tags => tags?.find(t => t.name === 'email_log_id')?.value ?? null,
    Deno: { env: { get: () => 'fake-setting' } }, console: quiet, crypto: globalThis.crypto,
    fetch: async (_, init) => { if(options.networkFailure) throw new Error('network unavailable'); if (options.webhookStatus) { for (const row of logs.values()) Object.assign(row, { status: options.webhookStatus, provider_message_id: 'webhook-id', error_message: 'webhook-detail' }) }; sends.push({ body: init.body, key: init.headers['Idempotency-Key'] }); trace.push('provider'); return new Response(JSON.stringify({ id: 'provider-id' }), { status: providerRejected ? 503 : 200 }) }
  }
  new Function(...Object.keys(deps), compile('supabase/functions/notify-waitlist/index.ts'))(...Object.values(deps))
  return { logs, sends, trace, acknowledgments, recover: () => { auditFailure = null; providerRejected = false }, call: () => handler(new Request('https://fixture.invalid', { method: 'POST', body: JSON.stringify({ organizationId: org, scheduleEventId: event }) })) }
}
test('配送キーから監査IDを固定し、別配送と区別する', async () => {
  const id = await audit.waitlistEmailAuditId('one')
  assert.match(id, /^[a-f0-9-]{36}$/)
  assert.equal(id, await audit.waitlistEmailAuditId('one'))
  assert.notEqual(id, await audit.waitlistEmailAuditId('two'))
})
for (const auditFailure of ['error', 'throw', 'missing']) test(`受理後の監査更新${auditFailure}では配送を確定せず、復旧後同じ本文と監査行で再試行`, async () => {
  const f = fixture({ auditFailure })
  assert.equal((await f.call()).status, 503)
  assert.equal(f.sends.length, 1)
  assert.equal(f.acknowledgments.length, 0)
  assert.equal([...f.logs.values()][0].status, 'queued')
  const payload = JSON.parse(f.sends[0].body)
  assert.equal(payload.tags[0].value, [...f.logs.keys()][0])
  f.recover()
  assert.equal((await f.call()).status, 200)
  assert.equal(f.logs.size, 1)
  assert.deepEqual(f.sends[0], f.sends[1])
  assert.equal([...f.logs.values()][0].status, 'sent')
  assert.equal(f.acknowledgments[0].p_sent, true)
})
test('監査行の準備失敗ではメールを送らず既知失敗としてleaseを解放する', async () => {
  const f = fixture({ insertFailure: true })
  assert.equal((await f.call()).status, 503)
  assert.equal(f.sends.length, 0)
  assert.equal(f.acknowledgments[0].p_sent, false)
  assert.equal(f.acknowledgments[0].p_error, 'provider rejected')
})
test('監査更新を配送確定より先に実行する', async () => {
  const f = fixture()
  assert.equal((await f.call()).status, 200)
  assert.deepEqual(f.trace, ['audit-prepare', 'provider', 'audit-ack', 'delivery-ack'])
})
test('配送ackが失敗しても同じ監査行をqueuedへ戻さず再試行する', async () => {
  const f = fixture({ deliveryAckFailure: true })
  assert.equal((await f.call()).status, 503)
  assert.equal((await f.call()).status, 503)
  assert.equal(f.logs.size, 1)
  assert.equal([...f.logs.values()][0].status, 'sent')
  assert.deepEqual(f.sends[0], f.sends[1])
})
test('既存の固定payloadにタグがなくても本文を変更しない', async () => {
  const payload = { from: 'fixture@example.invalid', to: ['qa@example.invalid'], subject: '保存件名', html: '保存本文', text: '保存本文' }
  const f = fixture({ legacyPayload: payload })
  assert.equal((await f.call()).status, 200)
  assert.deepEqual(JSON.parse(f.sends[0].body), payload)
})

test('既知のprovider拒否から復旧すると古いエラーを解除する', async () => {
 const f=fixture({providerRejected:true});assert.equal((await f.call()).status,503)
 assert.equal([...f.logs.values()][0].status,'failed');assert.ok([...f.logs.values()][0].error_message)
 f.recover();assert.equal((await f.call()).status,200);assert.equal([...f.logs.values()][0].status,'sent');assert.equal([...f.logs.values()][0].error_message,null)
 assert.deepEqual(f.sends[0],f.sends[1])
})
for(const status of ['delivered','opened','bounced','complained','failed']) test(`先行Webhookの${status}と詳細を保持して配送だけ確認する`,async()=>{
 const f=fixture({webhookStatus:status});assert.equal((await f.call()).status,200)
 const row=[...f.logs.values()][0];assert.equal(row.status,status);assert.equal(row.error_message,'webhook-detail');assert.equal(f.acknowledgments[0].p_sent,true)
})
test('他組織の固定監査IDでは送信も更新もしない',async()=>{
 const id='33333333-3333-3333-3333-333333333333'
 const row={id,organization_id:'foreign-org',status:'opened',error_message:'foreign-detail'}
 const f=fixture({initialLogs:[row],legacyPayload:{from:'fixture@example.invalid',to:['qa@example.invalid'],subject:'fixture',html:'fixture',tags:[{name:'email_log_id',value:id}]}})
 assert.equal((await f.call()).status,503);assert.equal(f.sends.length,0);assert.deepEqual(f.logs.get(id),row)
 const client={from(){const filters=[];const q={update(){return q},eq(k,v){filters.push([k,v]);return q},is(){return q},in(){return q},select(){return q},maybeSingle:async()=>({data:null,error:null}),then(r){assert.ok(filters.some(([k,v])=>k==='organization_id'&&v===org));return Promise.resolve({data:null,error:null}).then(r)}};return q}}
 assert.equal(await audit.acknowledgeWaitlistEmailAudit(client,id,org,{provider_message_id:'fake',sent_at:'fake'}),false)
 await audit.failWaitlistEmailAudit(client,id,org,'fake')
})

test('providerネットワーク例外でも未定義関数を呼ばず配送leaseを解放する',async()=>{
 const f=fixture({networkFailure:true});assert.equal((await f.call()).status,503);assert.equal(f.acknowledgments.length,1);assert.equal(f.acknowledgments[0].p_sent,false);assert.notEqual(f.acknowledgments[0].p_error,'provider rejected');assert.equal([...f.logs.values()][0].status,'failed')
})

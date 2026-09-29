import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { transformSync } from 'esbuild'
const load = (path, env) => {
  const source = fs.readFileSync(path, 'utf8').replace(/^import .*$/gm, '')
  const module = { exports: {} }
  new Function('module', 'Deno', transformSync(source, { loader: 'ts', format: 'cjs' }).code)(module, { env: { get: name => env[name] } })
  return module.exports
}
const receiver = load('supabase/functions/_shared/security.ts', {
  SUPABASE_SERVICE_ROLE_KEY: 'receiver-runtime-key', MMQ_LEGACY_SERVICE_ROLE_KEY: 'shared-service-key',
})
const { sendScheduledReminder } = load('supabase/functions/_shared/send-scheduled-reminder.ts', {})
const env = name => ({ SUPABASE_URL: 'https://example.invalid/', SUPABASE_SERVICE_ROLE_KEY: 'caller-runtime-key', MMQ_LEGACY_SERVICE_ROLE_KEY: 'shared-service-key' })[name]
test('異なる関数のruntimeキーでは拒否し、共有キーで送信先の認証を通過する', async () => {
  assert.equal(receiver.isCronOrServiceRoleCall(new Request('https://example.invalid', { headers: { Authorization: 'Bearer caller-runtime-key' } })), false)
  const body = { deliveryId: 'delivery', deliveryLeaseToken: 'lease', totalPrice: 0 }
  const sent = await sendScheduledReminder(body, env, async (url, init) => {
    assert.equal(url, 'https://example.invalid/functions/v1/send-reminder-emails')
    assert.equal(receiver.isCronOrServiceRoleCall(new Request(url, init)), true)
    assert.equal(init.headers.apikey, 'shared-service-key')
    assert.deepEqual(JSON.parse(init.body), body)
    assert.ok(init.signal)
    return Response.json({ success: true })
  })
  assert.equal(sent.success, true)
})
test('共有キー欠損で送信せずruntimeキーへ戻さない', async () => {
  let called = false
  await assert.rejects(sendScheduledReminder({}, name => name === 'MMQ_LEGACY_SERVICE_ROLE_KEY' ? undefined : env(name), async () => { called = true }), /not configured/)
  assert.equal(called, false)
})
test('403・不正応答・失敗応答を成功とせず、応答の個人情報をエラーへ転記しない', async () => {
  for (const response of [Response.json({ error: 'private@example.invalid' }, { status: 403 }), Response.json({ success: false }), new Response('invalid')]) {
    await assert.rejects(sendScheduledReminder({}, env, async () => response), error => error.message.startsWith('reminder sender HTTP ') && !error.message.includes('private@'))
  }
})

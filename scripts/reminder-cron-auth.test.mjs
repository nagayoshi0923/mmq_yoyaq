import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { transformSync } from 'esbuild'

const compile = (path) => transformSync(
  fs.readFileSync(path, 'utf8').replace(/^import .*$/gm, ''),
  { loader: 'ts', format: 'cjs' },
).code

const security = compile('supabase/functions/_shared/security.ts')
const handler = compile('supabase/functions/auto-send-reminder-emails/index.ts')

function fixture(overrides = {}) {
  let run
  let reminderCalls = 0
  const appConfig = { trigger_secret: 'db-trigger-secret' }
  const Deno = {
    env: {
      get: (key) => ({
        SUPABASE_URL: 'https://example.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-secret',
        CRON_SECRET: 'shared-cron-secret',
        ...overrides,
      })[key],
    },
  }
  const module = { exports: {} }
  new Function('module', 'Deno', security)(module, Deno)
  const deps = {
    ...module.exports,
    Deno,
    serve: (fn) => { run = fn },
    createClient: () => ({
      from: (table) => ({
        select: () => ({
          eq: (_key, value) => ({
            maybeSingle: async () => ({
              data: table === 'app_config' ? { value: appConfig[value] } : null,
              error: null,
            }),
          }),
        }),
      }),
    }),
    runScheduledReminders: async () => {
      reminderCalls += 1
      return { success: true, sent: 0, skipped: 0, failures: 0 }
    },
  }
  new Function(...Object.keys(deps), handler)(...Object.values(deps))
  return {
    request: (headers = {}) => run(new Request('https://example.invalid', { method: 'POST', headers })),
    counts: () => ({ reminderCalls }),
  }
}

test('匿名・偽cronはリマインドを起動しない', async () => {
  for (const headers of [{}, { 'x-cron-secret': 'wrong' }, { Authorization: 'Bearer ordinary-user-token' }]) {
    const f = fixture({ REMINDER_CRON_SECRET: 'dedicated-reminder-secret', CRON_SECRET: '' })
    assert.equal((await f.request(headers)).status, 401)
    assert.deepEqual(f.counts(), { reminderCalls: 0 })
  }
})

test('REMINDER_CRON_SECRET / CRON_SECRET / service role で起動する', async () => {
  const cases = [
    [{ 'x-cron-secret': 'dedicated-reminder-secret' }, { REMINDER_CRON_SECRET: 'dedicated-reminder-secret' }],
    [{ 'x-cron-secret': 'shared-cron-secret' }, {}],
    [{ Authorization: 'Bearer test-service-secret' }, { REMINDER_CRON_SECRET: '', CRON_SECRET: '' }],
  ]
  for (const [headers, env] of cases) {
    const f = fixture(env)
    assert.equal((await f.request(headers)).status, 200)
    assert.deepEqual(f.counts(), { reminderCalls: 1 })
  }
})

test('専用env未設定でも app_config.trigger_secret と一致すれば起動する', async () => {
  const f = fixture({ REMINDER_CRON_SECRET: '', CRON_SECRET: 'other-actions-secret' })
  assert.equal((await f.request({ 'x-cron-secret': 'db-trigger-secret' })).status, 200)
  assert.deepEqual(f.counts(), { reminderCalls: 1 })
})

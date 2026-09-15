import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/functions/senshin-discord-join/index.ts', 'utf8').replace(/^import .*$/gm, '')
const reservation = '00000000-0000-4000-8000-000000000000'

function harness({ member = true, invite = 'https://discord.gg/Valid-code', invalidCode = false, putOk = true } = {}) {
  let handler
  const calls = []
  const context = {
    URL,
    URLSearchParams,
    Response,
    serve: (fn) => {
      handler = fn
    },
    getCorsHeaders: () => ({}),
    getServiceRoleKey: () => 'fixture-key',
    CHANNEL_VIEW: 68608,
    SENSHIN_DISCORD: { guildId: 'guild' },
    Deno: {
      env: {
        get: (key) => (key === 'SUPABASE_URL' ? 'https://fixture.supabase.co' : 'fixture-secret'),
      },
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options })
      if (url.endsWith('/oauth2/token')) {
        return new Response(JSON.stringify(invalidCode ? {} : { access_token: 'fixture-access' }), {
          status: invalidCode ? 401 : 200,
        })
      }
      if (url.endsWith('/users/@me')) return Response.json({ id: 'user' })
      if (url.includes('/rest/v1/')) {
        return Response.json([
          {
            player_channel_id: 'player',
            spectator_channel_id: 'spectator',
            player_invite_url: invite,
            spectator_invite_url: invite,
          },
        ])
      }
      if (url.endsWith('/members/user')) return new Response(null, { status: member ? 200 : 404 })
      if (url.includes('/permissions/')) return new Response(null, { status: putOk ? 204 : 500 })
      throw Error('unexpected request')
    },
  }
  vm.runInNewContext(source, context)
  return { handler, calls }
}

for (const kind of ['player', 'spectator']) {
  test(`${kind}: 本人認証後に対応する公演チャンネルへ権限付与`, async () => {
    const { handler, calls } = harness()
    const res = await handler(
      new Request(`https://fixture.supabase.co/functions/v1/senshin-discord-join?code=fixture&state=${reservation}:${kind}`),
    )
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), `https://discord.com/channels/guild/${kind}`)
    assert.equal(calls.filter((c) => c.options.method === 'PUT').length, 1)
    assert.ok(calls.at(-1).url.endsWith(`/channels/${kind}/permissions/user`))
  })
}

test('初参加者には参加後にメールを開き直す手順を返し、権限はまだ付けない', async () => {
  const { handler, calls } = harness({ member: false })
  const res = await handler(
    new Request(`https://fixture.supabase.co/functions/v1/senshin-discord-join?code=fixture&state=${reservation}:player`),
  )
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('location'), null)
  const body = await res.text()
  assert.match(body, /https:\/\/discord\.gg\/Valid-code/)
  assert.match(body, /同じ参加用・観戦用リンクをもう一度/)
  assert.doesNotMatch(body, /<a\s/i)
  assert.ok(!calls.some((c) => c.options.method === 'PUT'))
})

for (const invite of [
  'https://example.org/evil',
  'https://discord.gg.evil.org/test',
  'javascript:alert(1)',
  'https://discord.gg/code?evil=true',
  'http://discord.gg/code',
  'https://discord.com/invite/code',
  '',
]) {
  test(`不正な招待先を拒否: ${invite || '(empty)'}`, async () => {
    const { handler } = harness({ member: false, invite })
    const res = await handler(
      new Request(`https://fixture.supabase.co/functions/v1/senshin-discord-join?code=fixture&state=${reservation}:player`),
    )
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('location'), null)
    const body = await res.text()
    assert.match(body, /参加用URLが見つかりません/)
    assert.doesNotMatch(body, /example\.org|evil|javascript:/i)
    assert.doesNotMatch(body, /<a\s/i)
  })
}

test('権限付与失敗時はユーザー向けメッセージを返す', async () => {
  const { handler } = harness({ putOk: false })
  const res = await handler(
    new Request(`https://fixture.supabase.co/functions/v1/senshin-discord-join?code=fixture&state=${reservation}:player`),
  )
  assert.equal(res.status, 500)
  assert.equal(res.headers.get('location'), null)
  assert.match(await res.text(), /チャンネルに入れませんでした/)
})

test('Discord認証失敗では権限付与もDB照会もしない', async () => {
  const { handler, calls } = harness({ invalidCode: true })
  const res = await handler(
    new Request(`https://fixture.supabase.co/functions/v1/senshin-discord-join?code=fixture&state=${reservation}:player`),
  )
  assert.equal(res.status, 401)
  assert.equal(calls.length, 1)
})

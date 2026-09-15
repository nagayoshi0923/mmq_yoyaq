import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function checkConfig(config, workflow) {
  const section = config.match(/^\[functions\.senshin-discord-join\]\s*\n([^]*?)(?=^\[|$(?![^]))/m)?.[1]
  assert.ok(section && /^verify_jwt\s*=\s*false\s*$/m.test(section), 'Discord入口のverify_jwt=falseが必要です')
  const lists = [...workflow.matchAll(/NO_VERIFY_JWT_FUNCTIONS=\(([^]*?)\)/g)]
  assert.equal(lists.length, 2, '両環境の配備設定を確認してください')
  for (const [, list] of lists) assert.ok(list.includes('"senshin-discord-join"'), 'Discord入口が配備時のJWT除外リストから欠落しています')
}

export async function smoke(origin, request = fetch) {
  const base = new URL('/functions/v1/senshin-discord-join', origin)
  // 架空の予約IDで認証画面への入口だけを検査。OAuth完了・権限付与はしない。
  const reservation = '00000000-0000-4000-8000-000000000000'
  const results = []
  for (const kind of ['player', 'spectator']) {
    const url = new URL(base)
    url.searchParams.set('reservation', reservation)
    url.searchParams.set('kind', kind)
    const response = await request(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    assert.equal(response.status, 302, `${kind}: Discord認証へ進めません（HTTP ${response.status}）`)
    const target = new URL(response.headers.get('location'))
    assert.equal(target.origin, 'https://discord.com')
    assert.equal(target.pathname, '/oauth2/authorize')
    assert.equal(target.searchParams.get('response_type'), 'code')
    assert.equal(target.searchParams.get('scope'), 'identify')
    assert.equal(target.searchParams.get('client_id'), '1532875462244831302')
    assert.equal(target.searchParams.get('redirect_uri'), base.href)
    assert.equal(target.searchParams.get('state'), `${reservation}:${kind}`)
    results.push({ kind, status: response.status, validRedirect: true })
  }
  const invalid = await request(base, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
  assert.equal(invalid.status, 400, '不正リンクの拒否が変わっています')
  results.push({ kind: 'invalid', status: invalid.status })
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = { checkedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, ok: false }
  try {
    checkConfig(readFileSync('supabase/config.toml', 'utf8'), readFileSync('.github/workflows/deploy-supabase.yml', 'utf8'))
    if (process.argv.includes('--live')) {
      const ref = process.env.SUPABASE_PROJECT_REF
      assert.match(ref || '', /^[a-z0-9]{20}$/)
      report.results = await smoke(`https://${ref}.supabase.co`)
    }
    report.ok = true
    console.log('Discord入口の検査: PASS')
  } catch (error) {
    report.error = error.message
    console.error(error.message)
    process.exitCode = 1
  } finally {
    if (process.env.DISCORD_JOIN_REPORT) writeFileSync(process.env.DISCORD_JOIN_REPORT, JSON.stringify(report, null, 2))
  }
}

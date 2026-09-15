import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkConfig, smoke } from './check-discord-join-release.mjs'
const config = readFileSync('supabase/config.toml', 'utf8')
const workflow = readFileSync('.github/workflows/deploy-supabase.yml', 'utf8')
test('設定欠落と各環境の配備リスト欠落を検出', () => {
  checkConfig(config, workflow)
  assert.throws(() => checkConfig(config.replace('[functions.senshin-discord-join]', '[functions.other]'), workflow))
  const matches = [...workflow.matchAll(/            "senshin-discord-join"/g)]
  assert.equal(matches.length, 2)
  for (const match of matches) assert.throws(() => checkConfig(config, workflow.slice(0, match.index) + workflow.slice(match.index + match[0].length)))
})
const origin = 'https://example.supabase.co'
function redirect(url) {
  const target = new URL('https://discord.com/oauth2/authorize')
  target.search = new URLSearchParams({client_id:'1532875462244831302',response_type:'code',scope:'identify guilds.join',redirect_uri:origin+'/functions/v1/senshin-discord-join',state:url.searchParams.get('reservation')+':'+url.searchParams.get('kind')}).toString()
  return new Response(null, {status:302,headers:{location:target.href}})
}
test('認証ヘッダなし・転送追跡なしで参加/観戦/不正リンクを検証', async () => {
  const calls=[]
  const results=await smoke(origin, async (url, options) => {
    calls.push(url.href)
    assert.equal(options.redirect,'manual');assert.equal(options.headers,undefined)
    return url.search ? redirect(url) : new Response(null,{status:400})
  })
  assert.equal(calls.length,3);assert.equal(results.length,3)
})
for (const status of [401,200,500]) test(`旧障害HTTP ${status}を失敗にする`, async()=>{
  await assert.rejects(smoke(origin,async()=>new Response(null,{status})))
})
test('別の転送先、観戦の誤配線、通信失敗を検出',async()=>{
  await assert.rejects(smoke(origin,async()=>new Response(null,{status:302,headers:{location:'https://example.org/'}})))
  await assert.rejects(smoke(origin,async url=>{url.searchParams.set('kind','player');return redirect(url)}))
  await assert.rejects(smoke(origin,async()=>{throw new Error('network')}))
})

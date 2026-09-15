import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
const source=readFileSync('supabase/functions/senshin-discord-join/index.ts','utf8').replace(/^import .*$/gm,'')
const reservation='00000000-0000-4000-8000-000000000000'
function harness({member=true,invalidCode=false,scope='identify guilds.join',joinStatus=201,lookupStatus,roomMissing=false,grantStatus=204}={}) {
  let handler
  const calls=[]
  const context={URL,URLSearchParams,Response,serve:fn=>{handler=fn},getCorsHeaders:()=>({}),getServiceRoleKey:()=> 'fixture-key',CHANNEL_VIEW:68608,SENSHIN_DISCORD:{guildId:'guild'},Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://fixture.supabase.co':'fixture-secret'}},fetch:async(url,options={})=>{
    calls.push({url,options})
    if(url.endsWith('/oauth2/token'))return new Response(JSON.stringify(invalidCode?{}:{access_token:'fixture-access',scope}),{status:invalidCode?401:200})
    if(url.endsWith('/users/@me'))return Response.json({id:'user'})
    if(url.includes('/rest/v1/'))return Response.json(roomMissing?[]:[{player_channel_id:'player',spectator_channel_id:'spectator'}])
    if(url.endsWith('/members/user')) {
      if(options.method==='PUT') {
        if(joinStatus==='network')throw Error('network')
        return new Response(null,{status:joinStatus})
      }
      return new Response(null,{status:lookupStatus??(member?200:404)})
    }
    if(url.includes('/permissions/'))return new Response(null,{status:grantStatus})
    throw Error('unexpected request')
  }}
  vm.runInNewContext(source,context)
  return {handler,calls}
}
const callback=kind=>new Request(`https://fixture.supabase.co/functions/v1/senshin-discord-join?code=fixture&state=${reservation}:${kind}`)
for(const kind of ['player','spectator']) for(const member of [true,false]) test(`${kind}: ${member?'参加済み':'初参加'}でも1回の認証から正しいチャンネルへ`,async()=>{
  const {handler,calls}=harness({member})
  const res=await handler(callback(kind))
  assert.equal(res.status,302);assert.equal(res.headers.get('location'),`https://discord.com/channels/guild/${kind}`)
  const writes=calls.filter(c=>c.options.method==='PUT')
  assert.equal(writes.length,member?1:2)
  if(!member){assert.ok(writes[0].url.endsWith('/guilds/guild/members/user'));assert.deepEqual(JSON.parse(writes[0].options.body),{access_token:'fixture-access'})}
  assert.ok(writes.at(-1).url.endsWith(`/channels/${kind}/permissions/user`))
  assert.equal(JSON.parse(writes.at(-1).options.body).allow,'68608')
})
test('入室前の同意画面はidentifyとguilds.joinだけを要求する',async()=>{
  const {handler,calls}=harness()
  const res=await handler(new Request(`https://fixture.supabase.co/functions/v1/senshin-discord-join?reservation=${reservation}&kind=player`))
  const target=new URL(res.headers.get('location'));assert.equal(target.searchParams.get('scope'),'identify guilds.join');assert.equal(calls.length,0)
})
for(const joinStatus of [204,201]) test(`サーバー参加成功${joinStatus}後に権限を付与`,async()=>{
 const {handler}=harness({member:false,joinStatus});assert.equal((await handler(callback('player'))).status,302)
})
for(const joinStatus of [403,429,500,'network']) test(`参加失敗${joinStatus}ではチャンネル権限を付けない`,async()=>{
 const {handler,calls}=harness({member:false,joinStatus});const res=await handler(callback('player'));assert.equal(res.status,joinStatus==='network'?503:502);assert.ok(!calls.some(c=>c.url.includes('/permissions/')))
})
for(const lookupStatus of [403,429,500]) test(`参加状況確認失敗${lookupStatus}を未参加扱いしない`,async()=>{
 const {handler,calls}=harness({lookupStatus});assert.equal((await handler(callback('player'))).status,503);assert.ok(!calls.some(c=>c.options.method==='PUT'))
})
test('旧認証画面から戻った初参加者はメール再クリックなしで新しい同意へ',async()=>{
 const {handler,calls}=harness({member:false,scope:'identify'});const res=await handler(callback('player'));const target=new URL(res.headers.get('location'));assert.equal(res.status,302);assert.equal(target.searchParams.get('scope'),'identify guilds.join');assert.ok(!calls.some(c=>c.options.method==='PUT'))
})
test('予約不明ではサーバー参加させない',async()=>{
 const {handler,calls}=harness({member:false,roomMissing:true});assert.equal((await handler(callback('player'))).status,404);assert.ok(!calls.some(c=>c.options.method==='PUT'))
})
test('Discord認証失敗では権限付与もDB照会もしない',async()=>{
 const {handler,calls}=harness({invalidCode:true});assert.equal((await handler(callback('player'))).status,401);assert.equal(calls.length,1)
})
test('チャンネル権限の付与失敗を成功にしない',async()=>{
 const {handler}=harness({member:false,grantStatus:403});assert.equal((await handler(callback('spectator'))).status,500)
})

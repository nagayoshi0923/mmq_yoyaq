import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {transformSync} from 'esbuild'
const compile=p=>transformSync(fs.readFileSync(p,'utf8').replace(/^import .*$/gm,''),{loader:'ts',format:'cjs'}).code
const security=compile('supabase/functions/_shared/security.ts')
const handler=compile('supabase/functions/process-private-survey-deliveries/index.ts')
function fixture(overrides={}){
 let run,dbCalls=0,deliveries=0
 const Deno={env:{get:k=>({CRON_SECRET:'test-cron-secret',SUPABASE_SERVICE_ROLE_KEY:'test-service-secret',SUPABASE_URL:'https://example.invalid',...overrides})[k]}}
 const module={exports:{}};new Function('module','Deno',security)(module,Deno)
 const deps={...module.exports,Deno,serve:f=>{run=f},createClient:()=>{dbCalls++;return {}},surveyDeliveryStore:()=>({}),deliverPrivateSurveys:async()=>{deliveries++;return {sent:0,retrying:0,stopped:0}}}
 new Function(...Object.keys(deps),handler)(...Object.values(deps))
 return {request:(headers={},method='POST')=>run(new Request('https://example.invalid',{method,headers})),counts:()=>({dbCalls,deliveries})}
}
test('匿名・顧客JWT・偽cronはDBにも触れない',async()=>{
 for(const headers of [{},{Authorization:'Bearer ordinary-user-token'},{'x-cron-secret':'wrong'},{Authorization:'Bearer sb_publishable_test'}]){
  const f=fixture();assert.equal((await f.request(headers)).status,401);assert.deepEqual(f.counts(),{dbCalls:0,deliveries:0})
 }
})
test('設定済みcron/serviceだけ配送ワーカーを起動する',async()=>{
 for(const headers of [{'x-cron-secret':'test-cron-secret'},{Authorization:'Bearer test-service-secret'}]){
  const f=fixture();assert.equal((await f.request(headers)).status,200);assert.deepEqual(f.counts(),{dbCalls:1,deliveries:1})
 }
})
test('OPTIONS/GETは配送しない',async()=>{
 for(const [method,status] of [['OPTIONS',200],['GET',405]]){const f=fixture();assert.equal((await f.request({},method)).status,status);assert.equal(f.counts().deliveries,0)}
})

test('専用cronは既存の共通secretを変更せず認証できる',async()=>{
 const f=fixture({SURVEY_DELIVERY_CRON_SECRET:'dedicated-delivery-secret'})
 assert.equal((await f.request({'x-cron-secret':'dedicated-delivery-secret'})).status,200)
 assert.deepEqual(f.counts(),{dbCalls:1,deliveries:1})
 const blank=fixture({CRON_SECRET:'',SURVEY_DELIVERY_CRON_SECRET:' '})
 assert.equal((await blank.request({'x-cron-secret':' '})).status,401)
 assert.deepEqual(blank.counts(),{dbCalls:0,deliveries:0})
})

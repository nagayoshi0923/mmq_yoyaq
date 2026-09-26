import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { transformSync } from 'esbuild'
const source=fs.readFileSync('supabase/functions/send-guest-pin/index.ts','utf8').replace(/^import .*$/gm,'')
const code=transformSync(source,{loader:'ts',format:'cjs'}).code
function fixture({sessionValid=true,memberValid=true}={}) {
 let handler; const sent=[]; const logs=[]; const calls=[]
 const db={rpc:async(name)=>{
  calls.push(name)
  if(name==='private_group_member_action')return {data:null,error:sessionValid?null:{code:'42501'}}
  return {data:[{member_id:memberValid?'member':'other',guest_name:'DB Guest'}],error:null}
 },from:()=>({select:()=>({eq:()=>({single:async()=>({data:{invite_code:'trusted',scenario_masters:{title:'DB Scenario'}},error:null})})})})}
 new Function('serve','createClient','getCorsHeaders','errorResponse','maskEmail','sanitizeErrorMessage','getServiceRoleKey','insertEmailLog','updateEmailLog','Deno','fetch','console',code)(
  f=>handler=f,()=>db,()=>({}),(m,status)=>new Response(m,{status}),()=> '[masked]',()=> '[redacted]',()=> 'service',async(_,log)=>{logs.push(log);return 'log'},async()=>{},
  {env:{get:()=> 'configured'}},async(_,options)=>{sent.push(JSON.parse(options.body));return new Response(JSON.stringify({id:'mail'}))},{log(){},warn(){},error(){}},
 )
 const request=body=>handler(new Request('https://example.invalid/send-pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groupId:'group',memberId:'member',email:'test@example.invalid',pin:'1234',guestToken:'proof',scenarioName:'FORGED',inviteUrl:'https://evil.invalid',...body})}))
 return {request,sent,logs,calls,handler}
}
test('requires guest session before PIN validation or email',async()=>{
 const f=fixture({sessionValid:false});assert.equal((await f.request({})).status,403);assert.deepEqual(f.calls,['private_group_member_action']);assert.equal(f.sent.length,0)
})
test('rejects missing token and mismatched member',async()=>{
 const f=fixture();assert.equal((await f.request({guestToken:null})).status,400);assert.equal(f.sent.length,0)
 const bad=fixture({memberValid:false});assert.equal((await bad.request({})).status,403);assert.equal(bad.sent.length,0)
})
test('uses database identity and canonical URL, and never persists the PIN in email logs',async()=>{
 const f=fixture();assert.equal((await f.request({})).status,200);assert.equal(f.sent.length,1)
 assert.match(f.sent[0].text,/DB Scenario/);assert.match(f.sent[0].text,/DB Guest/);assert.match(f.sent[0].text,/https:\/\/mmq.game\/group\/invite\/trusted/);assert.match(f.sent[0].text,/1234/)
 assert.doesNotMatch(f.sent[0].text,/FORGED|evil.invalid/);assert.doesNotMatch(f.logs[0].body_text,/1234/)
})
test('rejects unsupported methods without mail side effects',async()=>{
 const f=fixture();assert.equal((await f.handler(new Request('https://example.invalid'))).status,405);assert.equal(f.sent.length,0)
})

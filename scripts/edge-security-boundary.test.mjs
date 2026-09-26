import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
const source=ts.transpileModule(readFileSync('supabase/functions/_shared/security.ts','utf8').replace(/^import .*$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
function setup(env={}){
 const exports={}
 vm.runInNewContext(source,{exports,Deno:{env:{get:k=>env[k]}},atob,TextEncoder,Date,console:{log(){},error(){},warn(){}}})
 return exports
}
const request=(token,headers={})=>new Request('https://fixture.invalid',{headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...headers}})
const forged=`${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"role":"service_role"}').toString('base64url')}.fake`
test('偽造service_role JWT・未知キー・空ヘッダーを拒否',()=>{
 const s=setup({SUPABASE_SERVICE_ROLE_KEY:'real',CRON_SECRET:'cron'})
 for(const token of [forged,'unknown','',null])assert.equal(s.isCronOrServiceRoleCall(request(token)),false)
 assert.equal(s.isCronOrServiceRoleCall(request(null,{'x-cron-secret':'unknown'})),false)
})
test('明示された正規JWT/secret/cronキーを受け入れる',()=>{
 const s=setup({SUPABASE_SERVICE_ROLE_KEY:'real-jwt',MMQ_SB_SECRET_KEY:'sb_secret_real',CRON_SECRET:'cron'})
 for(const token of ['real-jwt','sb_secret_real'])assert.equal(s.isCronOrServiceRoleCall(request(token)),true)
 for(const key of ['x-cron-secret','x-edge-cron-secret','x-mmq-cron-secret'])assert.equal(s.isCronOrServiceRoleCall(request(null,{[key]:'cron'})),true)
 assert.equal(setup({SERVICE_ROLE_KEY:'fallback'}).isCronOrServiceRoleCall(request('fallback')),true)
 assert.equal(setup({SB_SECRET_KEY:'secret'}).isCronOrServiceRoleCall(request('secret')),true)
 assert.equal(setup({EDGE_FUNCTION_CRON_SECRET:'cron'}).isCronOrServiceRoleCall(request(null,{'x-cron-secret':'cron'})),true)
})
test('環境キー未設定でもJWTの自己申告を信用しない',()=>assert.equal(setup().isCronOrServiceRoleCall(request(forged)),false))
test('レート制限の正常結果と超過を維持',async()=>{
 const s=setup();let args
 const result=await s.checkRateLimit({rpc:async(name,p)=>{args=[name,p];return {data:[{allowed:true,current_count:2,reset_at:'2026-09-27T00:00:00Z',retry_after:0}],error:null}}},'caller','fixture',10,60)
 assert.equal(result.allowed,true);assert.equal(result.currentCount,2);assert.equal(args[0],'check_rate_limit');assert.equal(args[1].p_identifier,'caller')
 const denied=await s.checkRateLimit({rpc:async()=>({data:{allowed:false,current_count:11,retry_after:42},error:null})},'caller','fixture',10,60)
 assert.equal(denied.allowed,false);assert.equal(denied.retryAfter,42)
})
for(const [label,rpc] of [['error',async()=>({error:{message:'unavailable'}})],['throw',async()=>{throw Error('offline')}],['empty',async()=>({data:null,error:null})]])test(`レート制限取得${label}は拒否`,async()=>{
 const result=await setup().checkRateLimit({rpc},'caller','fixture',10,60);assert.equal(result.allowed,false)
})

test('内部用キーと外部旧JWTを別々に明示して検証する',()=>{
 const s=setup({SUPABASE_SERVICE_ROLE_KEY:'internal',MMQ_LEGACY_SERVICE_ROLE_KEY:'external'})
 for(const key of ['internal','external'])assert.equal(s.isCronOrServiceRoleCall(request(key)),true)
 assert.equal(s.isCronOrServiceRoleCall(request(forged)),false)
})
test('名前付きsecretキーを許可し不正な設定は無視',()=>{
 assert.equal(setup({SUPABASE_SECRET_KEYS:'{"default":"named-secret"}'}).isCronOrServiceRoleCall(request('named-secret')),true)
 for(const config of ['invalid','null','["untrusted-array"]','{"default":42}'])assert.equal(setup({SUPABASE_SECRET_KEYS:config}).isCronOrServiceRoleCall(request('untrusted-array')),false)
})

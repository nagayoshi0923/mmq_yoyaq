import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import ts from 'typescript'
import {readFileSync} from 'node:fs'
const source=ts.transpileModule(readFileSync('supabase/functions/invite-staff/index.ts','utf8').replace(/^import .*$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText
function setup({profileOrg='own',staffOrg=null,emailOrg=null,emailUser=null,targetRole='customer',lookupError=false}={}){
 let handler;const writes=[]
 const client={auth:{getUser:async()=>({data:{user:{id:'actor',email:'admin@example.invalid'}},error:null}),admin:{listUsers:async()=>({data:{users:[{id:'target',email:'target@example.invalid'}]},error:null}),createUser:async()=>{writes.push('createAuth');throw Error('unexpected')}}},from:table=>{
  const filters={};const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q},maybeSingle:async()=>read(),single:async()=>read(),upsert:async row=>{writes.push({table,row});return {error:{message:'fixture stop after profile'}}}}
  function read(){
   if(table==='users')return {data:filters.id==='actor'?{role:'admin',organization_id:'own'}:{role:targetRole,organization_id:profileOrg},error:null}
   if(table==='staff'){
    if(filters.user_id==='actor')return {data:{organization_id:'own'},error:null}
    if(filters.email)return {data:emailOrg?{organization_id:emailOrg,user_id:emailUser}:null,error:lookupError?{message:'offline'}:null}
    return {data:staffOrg?{organization_id:staffOrg}:null,error:null}
   }
   throw Error(`unexpected table ${table}`)
  }
  return q
 }}
 const context={serve:fn=>{handler=fn},createClient:()=>client,Deno:{env:{get:()=>''}},getCorsHeaders:()=>({}),getServiceRoleKey:()=>'',getAnonKey:()=>'',maskEmail:x=>x,maskName:x=>x,sanitizeErrorMessage:x=>x,Response,console:{log(){},warn(){},error(){}}}
 vm.runInNewContext(source,context)
 return {writes,call:()=>handler(new Request('https://fixture.invalid/invite-staff',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({email:'target@example.invalid',name:'Fixture',organization_id:'own'})}))}
}
for(const [label,options] of [['profile',{profileOrg:'other'}],['linked staff',{staffOrg:'other'}],['email staff',{emailOrg:'other'}],['different identity',{emailOrg:'own',emailUser:'someone-else'}]])test(`${label}: 他組織・別人を招待前に拒否し書き込まない`,async()=>{const h=setup(options);assert.equal((await h.call()).status,403);assert.equal(h.writes.length,0)})
test('所属取得失敗では招待を進めない',async()=>{const h=setup({lookupError:true});assert.equal((await h.call()).status,500);assert.equal(h.writes.length,0)})
for(const targetRole of ['customer','staff','admin','license_admin'])test(`${targetRole}: スタッフ保存前には既存権限を変更しない`,async()=>{const h=setup({targetRole});await h.call();assert.equal(h.writes.length,1);assert.equal(h.writes[0].row.role,targetRole)})

import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => {
  process.env.SUPABASE_URL='https://compensation-fixture.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY='compensation-fixture-key'
  return { date:'2020-01-15',category:'open',recorded:null as number|null,historyError:false,legacy:false,orgOnly:false,ambiguous:false,costs:[] as {role:string;reward:number;category?:string}[],tables:[] as string[] }
})
const database=vi.hoisted(()=>({from:vi.fn()}))
vi.mock('./_lib/db.js',()=>({db:database,getMissingEnvError:()=>null}))
vi.mock('@supabase/supabase-js',()=>({createClient:()=>database}))
vi.mock('./_lib/auth.js',async original=>({...await original<typeof import('./_lib/auth.js')>(),requireAuth:async()=>({orgId:'org',role:'admin',userId:'user',jwt:'fixture'})}))
import salesHandler from './sales'
import scenariosHandler from './scenarios'
const old={effective_from:'2020-01-01',gm_base_pay:1000,gm_hourly_rate:1000,gm_test_base_pay:0,gm_test_hourly_rate:500,reception_fixed_pay:0,use_hourly_table:false,hourly_rates:[],gm_test_hourly_rates:[]}
const newer={...old,effective_from:'2020-01-16',gm_hourly_rate:2000,reception_fixed_pay:500}
const names=['受付','サブ','メイン','三人目','参加','見学']
const roles=['reception','sub','main','sub','staff','observer']
function builder(table:string){
 mock.tables.push(table)
 let fields='';let single=false;let head=false
 const filters:Array<[string,...unknown[]]>=[]
 const q:any={select:(v:string,opts?:{head?:boolean})=>{fields=v;head=!!opts?.head;return q}}
 for(const method of ['eq','in','or','order','limit','gte','lte','gt','neq','range','is','not'])q[method]=(...args:unknown[])=>{filters.push([method,...args]);return q}
 const result=()=>{
  let data:any=[];let error:any=null
  if(table==='salary_settings_history'){
   error=mock.historyError?{message:'offline'}:null
   if(single){const date=String(filters.find(f=>f[0]==='lte')?.[2]??'');data=date>='2020-01-16'?newer:old}
   else data=filters.some(f=>f[0]==='gt' && String(f[2])<'2020-01-16')?[newer]:[]
  }
  if(table==='staff')data=names.map((name,i)=>({id:String(i),name,stores:i===2?[]:['store']}))
  if(table==='stores')data=[{id:'store',name:'店舗',short_name:'店',transport_allowance:500}]
  if(table==='organization_scenarios_with_master')data=[{id:'master',scenario_master_id:'master',title:'作品',duration:240,gm_costs:mock.costs,player_count_max:6}]
  if(table==='organization_scenarios_with_master' && mock.ambiguous)data.push({...data[0],id:'other',scenario_master_id:'other'})
  if(table==='organization_scenarios'){
   data=mock.orgOnly?[{id:'org-scenario',scenario_master_id:'master',duration:null}]:[]
   if(fields.split(',').map(field=>field.trim()).includes('license_rewards')) error={message:'column organization_scenarios.license_rewards does not exist'}
  }
  if(table==='schedule_events')data=[{id:'event',date:mock.date,category:mock.category,scenario_master_id:mock.legacy||mock.orgOnly?null:'master',organization_scenario_id:mock.orgOnly?'org-scenario':null,scenario:'作品',store_id:'store',gms:names,gm_roles:Object.fromEntries(names.map((n,i)=>[n,roles[i]])),gm_cost:mock.recorded,is_cancelled:false,start_time:'14:00',end_time:'17:00',stores:{transport_allowance:500}}]
  if(single&&Array.isArray(data))data=data[0]??null
  if(head)data=null
  return {data,error,count:1}
 }
 q.single=q.maybeSingle=async()=>{single=true;return result()}
 q.then=(resolve:(v:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)
 return q
}
async function request(handler:typeof salesHandler,type:string){
 const res:any={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),setHeader:vi.fn()}
 await handler({method:'GET',headers:{authorization:'Bearer fixture'},query:{type,start:'2020-01-01',end:'2020-01-31',scenarioId:'master'}} as any,res)
 return {status:res.status.mock.calls.at(-1)?.[0],data:res.json.mock.calls.at(-1)?.[0]}
}
beforeEach(()=>{mock.date='2020-01-15';mock.category='open';mock.recorded=null;mock.historyError=false;mock.legacy=false;mock.orgOnly=false;mock.ambiguous=false;mock.tables=[];mock.costs=[{role:'main',reward:0},{role:'sub',reward:2000},{role:'gm3',reward:1234}];database.from.mockImplementation(builder)})
describe('CSVと作品統計の報酬計算',()=>{
 it('個別0円・GM3・受付・交通費を同じ値で計算する',async()=>{
  const csv=await request(salesHandler,'schedule-export');const stats=await request(scenariosHandler,'stats')
  expect(csv.status).toBe(200);expect(stats.status).toBe(200)
  expect(csv.data[0].gm_cost).toBe(3734);expect(stats.data.totalGmCost).toBe(3734)
  expect(mock.tables).not.toContain('global_settings')
 })
 it('作品ID未設定でも一意な作品名から組織の実効時間を解決し、同名別作品なら拒否する',async()=>{
  mock.legacy=true;mock.costs=[]
  expect((await request(salesHandler,'schedule-export')).data[0].gm_cost).toBe(15500)
  mock.ambiguous=true
  expect((await request(salesHandler,'schedule-export')).status).toBe(422)
 })
 it('組織作品IDだけの旧公演でも原本から継承した実効時間を使う',async()=>{
  mock.orgOnly=true;mock.costs=[]
  expect((await request(salesHandler,'schedule-export')).data[0].gm_cost).toBe(15500)
 })
 it('GMテストは通常の個別報酬を引き継がず実効240分を使う',async()=>{
  mock.category='gmtest'
  expect((await request(salesHandler,'schedule-export')).data[0].gm_cost).toBe(6500)
  expect((await request(scenariosHandler,'stats')).data.totalGmCost).toBe(6500)
 })
 it('月途中の改定以降だけ新しい履歴を使う',async()=>{
  mock.costs=[];mock.date='2020-01-20'
  expect((await request(salesHandler,'schedule-export')).data[0].gm_cost).toBe(28000)
  expect((await request(scenariosHandler,'stats')).data.totalGmCost).toBe(28000)
 })
 it('保存済みの公演費用は0円も含めて再計算で上書きしない',async()=>{
  mock.recorded=0;expect((await request(scenariosHandler,'stats')).data.totalGmCost).toBe(0)
  mock.recorded=123;expect((await request(scenariosHandler,'stats')).data.totalGmCost).toBe(123)
 })
 it('記録済み費用だけの集計は報酬履歴の通信に依存しない',async()=>{
  mock.recorded=123;mock.historyError=true
  expect((await request(scenariosHandler,'stats')).data.totalGmCost).toBe(123)
  expect(mock.tables).not.toContain('salary_settings_history')
 })
 it('履歴取得失敗を現在設定や0円で埋めない',async()=>{
  mock.historyError=true
  expect((await request(salesHandler,'schedule-export')).status).toBe(500)
  expect((await request(scenariosHandler,'stats')).status).toBe(500)
 })
})

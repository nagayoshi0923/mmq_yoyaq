import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ required:2, errorTable:'', active:['a','b'], assignments:[] as Array<{staff_id:string;can_main_gm:boolean;can_sub_gm:boolean}>, responses:[] as Array<{staff_id:string;response_status:string;available_candidates:number[]}>, queries:[] as Array<{table:string;filters:Record<string,unknown>}> }))
vi.mock('@/lib/gmResponseApi', () => ({getGmResponses:async()=>state.responses}))
vi.mock('@/lib/supabase', () => ({supabase:{from:(table:string)=>{
  const filters:Record<string,unknown>={};state.queries.push({table,filters})
  const result=()=>({error:state.errorTable===table ? new Error('read failed'):null,data:table==='reservations'?{organization_id:'org',scenario_master_id:'scenario',candidate_datetimes:{candidates:[{},{}]}}:table==='organization_scenarios_with_master'?{gm_count:state.required}:table==='staff'?state.active.map(id=>({id})):state.assignments})
  const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q},in:(k:string,v:unknown)=>{filters[k]=v;return q},maybeSingle:async()=>result(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)}
  return q
}}}))
import { isReservationReadyForStoreAfterGmResponses as ready } from './privateBookingGmReadiness'
const assignment=(staff_id:string,can_main_gm:boolean,can_sub_gm:boolean)=>({staff_id,can_main_gm,can_sub_gm})
beforeEach(()=>{state.required=2;state.errorTable='';state.active=['a','b'];state.assignments=[assignment('a',true,false),assignment('b',false,true)];state.responses=state.active.map(staff_id=>({staff_id,response_status:'available',available_candidates:[0]}));state.queries=[]})
it('同じ候補に別々のメインとサブが揃うときだけ店舗確認待ちへ進める',async()=>{
  expect(await ready('r')).toBe(true)
  state.responses[1].available_candidates=[1]
  expect(await ready('r')).toBe(false)
})
it('1人の兼任を2役として重複計上しない',async()=>{
  state.assignments=[assignment('a',true,true),assignment('b',false,false)]
  expect(await ready('r')).toBe(false)
})
it('担当未登録や退職スタッフを推測で利用可能にしない',async()=>{
  state.assignments=[];expect(await ready('r')).toBe(false)
  state.assignments=[assignment('a',true,false),assignment('b',false,true)];state.active=['a']
  expect(await ready('r')).toBe(false)
})
it.each(['reservations','organization_scenarios_with_master','staff','staff_scenario_assignments'])('%sの取得失敗は判定結果として握りつぶさない',async(table)=>{
  state.errorTable=table;await expect(ready('r')).rejects.toThrow('read failed')
})
it('1人GMもメイン資格を確認し、担当と在籍は同じ組織に限定する',async()=>{
  state.required=1;state.assignments=[assignment('a',false,true),assignment('b',false,true)]
  expect(await ready('r')).toBe(false)
  state.assignments=[assignment('a',true,false)];expect(await ready('r')).toBe(true)
  expect(state.queries.filter(q=>q.table!=='reservations').every(q=>q.filters.organization_id==='org')).toBe(true)
  expect(state.queries.find(q=>q.table==='staff')?.filters.status).toBe('active')
})

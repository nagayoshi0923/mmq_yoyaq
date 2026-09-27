import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasReadyGmTeam, readPrivateBookingReadiness, nextGmResponseStatus } from '../../supabase/functions/_shared/privateBookingReadiness'
import { readGmReadiness, readGmPendingCount } from './gmResponses'
import type { AuthUser } from './auth'
import { RESERVATION_SOURCE } from '../../src/lib/constants'
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const org = 'org'
const user = {orgId:org,userId:'user',role:'staff'} as AuthUser
const booking = {id:id(1), organization_id:org, scenario_master_id:'scenario', candidate_datetimes:{candidates:[{},{}]}, status:'pending',reservation_source:RESERVATION_SOURCE.WEB_PRIVATE}
const response = (staff_id:string, candidates:number[]=[0]) => ({id:staff_id,staff_id,reservation_id:id(1),organization_id:org,'staff.organization_id':org,'staff.status':'active',response_status:'available',available_candidates:candidates})
const assignment = (staff_id:string, main:boolean, sub:boolean) => ({staff_id, scenario_master_id:'scenario', organization_id:org,can_main_gm:main,can_sub_gm:sub})
let rows: Record<string,any[]>
let failTable = ''
const database = {from(table:string) {
  const filters: Array<(r:any)=>boolean> = []
  let first=0,last=Infinity
  const result = () => ({data:rows[table]?.filter(r=>filters.every(f=>f(r))).slice(first,last+1)||[], error:failTable===table?new Error('read failed'):null})
  const q:any={
    select:()=>q,order:()=>q,
    eq:(key:string,value:unknown)=>{filters.push(r=>r[key]===value);return q},
    in:(key:string,values:unknown[])=>{filters.push(r=>values.includes(r[key]));return q},
    range:(start:number,end:number)=>{first=start;last=end;return q},
    then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result()).then(resolve),
  };return q
}} as unknown as SupabaseClient
beforeEach(()=>{failTable='';rows={reservations:[booking],organization_scenarios_with_master:[{scenario_master_id:'scenario',organization_id:org,gm_count:2}],gm_availability_responses:[response('a'),response('b')],staff_scenario_assignments:[assignment('a',true,false),assignment('b',false,true)]}})
describe('店舗承認待ちの共通判定',()=>{
  it('同じ候補の別人メインとサブが揃う場合のみ、一覧APIと件数APIの双方で成立する',async()=>{
    expect(await readGmReadiness(database,user,{reservation_ids:id(1)})).toEqual({readiness:{[id(1)]:true}})
    expect(await readGmPendingCount(database,user)).toEqual({count:1})
    rows.gm_availability_responses[1].available_candidates=[1]
    expect(await readGmReadiness(database,user,{reservation_ids:id(1)})).toEqual({readiness:{[id(1)]:false}})
    expect(await readGmPendingCount(database,user)).toEqual({count:0})
  })
  it('回答者の重複や1人の主副兼任を必要人数に重複計上しない',()=>{
    expect(hasReadyGmTeam(2,2,[response('a'),response('a'),response('b')],[assignment('a',true,true),assignment('b',false,false)])).toBe(false)
  })
  it('全て不可・候補なし・担当未登録を成立させない',()=>{
    expect(hasReadyGmTeam(2,1,[{...response('a'),response_status:'all_unavailable'}],[assignment('a',true,true)])).toBe(false)
    expect(hasReadyGmTeam(0,1,[response('a')],[assignment('a',true,true)])).toBe(false)
    expect(hasReadyGmTeam(2,1,[response('a')],[])).toBe(false)
  })
  it('旧available/候補未設定は対応可能を保持し、明示した候補だけの回答は広げない',()=>{
    expect(hasReadyGmTeam(1,1,[response('a',[])],[assignment('a',true,false)])).toBe(true)
    expect(hasReadyGmTeam(1,1,[response('a',[1])],[assignment('a',true,false)])).toBe(false)
  })
  it.each(['organization_id','staff.organization_id','staff.status'])('他組織・退職の回答を%sから除外し、古いpending_storeを数えない',async(key)=>{
    rows.reservations=[{...booking,status:'pending_store'}]
    rows.gm_availability_responses[1][key]='foreign-or-inactive'
    expect(await readGmPendingCount(database,user)).toEqual({count:0})
  })
  it('他組織の予約・担当を混ぜず、確定後の予約は承認待ち件数に含めない',async()=>{
    rows.reservations.push({...booking,id:id(2),organization_id:'foreign'},{...booking,id:id(3),status:'confirmed'})
    rows.staff_scenario_assignments[1].organization_id='foreign'
    expect(await readGmReadiness(database,user,{reservation_ids:[id(1),id(2)].join(',')})).toEqual({readiness:{[id(1)]:false}})
    expect(await readGmPendingCount(database,user)).toEqual({count:0})
  })
  it.each(['reservations','organization_scenarios_with_master','gm_availability_responses','staff_scenario_assignments'])('%s取得失敗をゼロ件に変換しない',async(table)=>{
    failTable=table;await expect(readGmPendingCount(database,user)).rejects.toThrow('店舗承認待ち件数')
  })
  it('必要人数の元作品が不明なら判定を止める',async()=>{
    rows.organization_scenarios_with_master=[]
    await expect(readPrivateBookingReadiness(database,org,[booking])).rejects.toThrow('必要GM数')
  })
  it('1000件超の予約も集計し、応答の後続ページも読む',async()=>{
    rows.reservations=Array.from({length:1001},(_,i)=>({...booking,id:id(i+1)}))
    rows.gm_availability_responses=rows.reservations.flatMap(r=>[...Array.from({length:11},(_,i)=>({...response(`none-${i}`),id:`${r.id}-none-${i}`,reservation_id:r.id,response_status:'unavailable'})),...['a','b'].map(staff=>({...response(staff),id:`${r.id}-${staff}`,reservation_id:r.id}))])
    expect(await readGmPendingCount(database,user)).toEqual({count:1001})
  })
})

it('GM回答による状態更新は許可済みの遷移だけを行い、確定/取消/承認段階を戻さない',()=>{
  expect(nextGmResponseStatus('pending',true)).toBe('gm_confirmed')
  expect(nextGmResponseStatus('pending_gm',true)).toBe('gm_confirmed')
  expect(nextGmResponseStatus('pending',false)).toBe('pending_gm')
  for(const status of ['pending_store','gm_confirmed','confirmed','completed','cancelled','checked_in','no_show']) {
    expect(nextGmResponseStatus(status,true)).toBe(status)
    expect(nextGmResponseStatus(status,false)).toBe(status)
  }
})

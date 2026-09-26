import {beforeEach,describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({filters:[] as string[]}))
vi.mock('../../api/_lib/db.js',()=>({db:{from:(table:string)=>{const q={select:()=>q,eq:(key:string,value:string)=>{state.filters.push(`${table}:${key}=${value}`);return q},then:(resolve:(x:unknown)=>unknown)=>Promise.resolve(resolve({error:null,data:table==='organization_scenarios'?[{id:'scenario',scenario_master_id:'master',extra_preparation_time:30}]:[{settings:{preparation_minutes:120,company_email:'private@example.invalid'}},{store_id:'store',settings:{preparation_minutes:0,reminder_template:'private text'}},{organization_scenario_id:'scenario',settings:{preparation_minutes:null}},{schedule_event_id:'event',settings:{preparation_minutes:15}}]}))};return q}}}))
import {preparationSettings} from '../../api/_lib/preparationSettings'
const res={setHeader:vi.fn(),status:()=>res,json:vi.fn()}
const user={userId:'staff',orgId:'org-a',role:'staff',jwt:'test-only'} as const
beforeEach(()=>{state.filters=[];res.json.mockClear()})
describe('準備時間APIの公開範囲',()=>{
 it('認証組織だけを参照し、準備時間以外の設定を返さない',async()=>{
  await preparationSettings({query:{organization_id:'foreign'}} as never,res as never,user)
  expect(state.filters).toEqual(['organization_scenarios:organization_id=org-a','operating_setting_overrides:organization_id=org-a'])
  expect(res.json).toHaveBeenCalledWith({organization:120,stores:{store:0},scenarios:{scenario:null,master:null},performances:{event:15}})
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('private')
 })
 it('顧客の設定一覧取得を拒否する',async()=>{
  await expect(preparationSettings({} as never,res as never,{...user,role:'customer'})).rejects.toMatchObject({status:403})
  expect(state.filters).toEqual([])
 })
})

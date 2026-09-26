import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://scope-fixture.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'scope-fixture-key'
  return { role: 'admin', org: 'own-org', staffStatus: 'active', activeOrg: true, calls: [] as {table:string; fields:string; filters:unknown[]}[] }
})
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({data:{user:{id:'actor'}},error:null}) },
  from: (table:string) => {
    const call={table,fields:'',filters:[] as unknown[]};mock.calls.push(call)
    const q:any={}
    q.select=(fields:string)=>{call.fields=fields;return q}
    for(const method of ['eq','in','or','order','limit','gte','lte','gt','neq','range','is'])q[method]=(...args:unknown[])=>{call.filters.push([method,...args]);return q}
    const result=()=>({data:table==='users'?{organization_id:mock.org,role:mock.role}:table==='staff'?[{status:mock.staffStatus}]:table==='organizations'?(mock.activeOrg?{id:'target',is_active:true}:null):{id:'scenario',title:'公開作品'},error:null})
    q.single=q.maybeSingle=async()=>result()
    q.then=(resolve: (value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)
    return q
  },
}) }))
import handler from './scenarios'
async function request(query:Record<string,string>,method='GET',body?:Record<string,string>,auth=true){
  const res:any={status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis(),setHeader:vi.fn()}
  await handler({method,headers:auth?{authorization:'Bearer fixture'}:{},query,body} as any,res)
  return res
}
beforeEach(()=>{mock.role='admin';mock.org='own-org';mock.staffStatus='active';mock.activeOrg=true;mock.calls=[]})
describe('作品APIの管理情報境界',()=>{
  it.each(['customer','unexpected'])('%sは管理統計を取得できない',async role=>{
    mock.role=role
    expect((await request({type:'stats',scenarioId:'scenario',org_id:'foreign-org'})).status).toHaveBeenCalledWith(403)
    expect(mock.calls.some(c=>c.table==='organization_scenarios_with_master')).toBe(false)
  })
  it('管理者も指定した他組織の一覧や更新へ進めない',async()=>{
    expect((await request({type:'paginated',org_id:'foreign-org'})).status).toHaveBeenCalledWith(403)
    expect((await request({id:'scenario'},'PATCH',{org_id:'foreign-org',title:'changed'})).status).toHaveBeenCalledWith(403)
  })
  it('利用停止スタッフは管理情報を取得できない',async()=>{
    mock.staffStatus='inactive'
    expect((await request({type:'stats',scenarioId:'scenario'})).status).toHaveBeenCalledWith(403)
  })
  it.each(['customer','staff'])('%sによる他組織の公開詳細は公開カラムのみ',async role=>{
    mock.role=role
    expect((await request({id:'scenario',org_id:'foreign-org'})).status).toHaveBeenCalledWith(200)
    const call=mock.calls.find(c=>c.table==='organization_scenarios_with_master')!
    expect(call.fields).not.toContain('gm_costs');expect(call.fields).not.toContain('author_email')
    expect(call.filters).toContainEqual(['eq','organization_id','foreign-org'])
    expect(call.filters).toContainEqual(['eq','status','available'])
  })
  it('同組織スタッフの編集用詳細は維持する',async()=>{
    mock.role='staff'
    expect((await request({id:'scenario'})).status).toHaveBeenCalledWith(200)
    const call=mock.calls.find(c=>c.table==='organization_scenarios_with_master')!
    expect(call.fields).toContain('gm_costs');expect(call.filters).toContainEqual(['eq','organization_id','own-org'])
  })
  it('顧客の書込と組織不明スタッフを拒否する',async()=>{
    mock.role='customer';expect((await request({},'POST')).status).toHaveBeenCalledWith(403)
    mock.role='staff';mock.org='';expect((await request({id:'scenario'})).status).toHaveBeenCalledWith(403)
  })
  it('匿名の公開詳細を維持し、非公開組織は返さない',async()=>{
    expect((await request({id:'scenario',org_id:'foreign-org'},'GET',undefined,false)).status).toHaveBeenCalledWith(200)
    mock.activeOrg=false;expect((await request({id:'scenario',org_id:'foreign-org'},'GET',undefined,false)).status).toHaveBeenCalledWith(404)
  })
})

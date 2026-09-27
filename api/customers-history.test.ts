import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ calls: [] as unknown[][], pages: [] as Array<{ data: object[] | null; error: object | null }> }))
vi.mock('./_lib/auth.js', () => ({ requireAuth: async () => ({ orgId: 'verified-org' }), requireStaff: () => {}, requireAdmin: () => {}, ApiError: class extends Error {} }))
vi.mock('./_lib/db.js', () => ({ getMissingEnvError: () => null, db: { from: (table: string) => {
 mock.calls.push(['from',table]); const q: any = {}
 for (const m of ['select','eq','order']) q[m] = (...args: unknown[]) => { mock.calls.push([m,...args]); return q }
 q.range = async (...args: unknown[]) => { mock.calls.push(['range', ...args]); return mock.pages.shift() ?? { data: [], error: null } }
 return q
} } }))
import handler from './customers'
async function request(customerId: string | undefined = 'customer', action = 'reservationHistory') {
 const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }
 await handler({ method: 'GET', query: { action, customerId, organization_id: 'forged' }, headers: {} } as any,res)
 return res
}
beforeEach(() => { mock.calls=[]; mock.pages=[] })
it('restricts every page to the verified organization and requested customer', async () => {
 mock.pages=[{data:Array.from({length:500},(_,i)=>({id:String(i)})),error:null},{data:Array.from({length:500},(_,i)=>({id:String(i+500)})),error:null},{data:[{id:'last'}],error:null}]
 const res=await request()
 expect(res.status).toHaveBeenCalledWith(200); expect(res.json.mock.calls[0][0]).toHaveLength(1001)
 expect(mock.calls.filter(c=>c[0]==='eq')).toEqual([['eq','organization_id','verified-org'],['eq','customer_id','customer'],['eq','organization_id','verified-org'],['eq','customer_id','customer'],['eq','organization_id','verified-org'],['eq','customer_id','customer']])
 expect(mock.calls.filter(c=>c[0]==='range')).toEqual([['range',0,499],['range',500,999],['range',1000,1499]])
 expect(mock.calls).toContainEqual(['order','id',{ascending:false}])
 expect(mock.calls).toContainEqual(['select','id, title, scenario_master_id, requested_datetime, participant_count, final_price, status'])
})
it('does not return a partial success when a later page fails', async () => {
 mock.pages=[{data:Array.from({length:500},()=>({id:'fixture'})),error:null},{data:null,error:{message:'unavailable'}}]
 const res=await request(); expect(res.status).toHaveBeenCalledWith(500); expect(res.json).toHaveBeenCalledWith({error:'予約履歴を取得できませんでした'})
})
it('returns an empty history within the tenant',async()=>{ expect((await request()).json).toHaveBeenCalledWith([]) })
it('requires a customer before querying',async()=>{ expect((await request('')).status).toHaveBeenCalledWith(400); expect(mock.calls).toEqual([]) })

it('scopes available scenario options on the server and paginates',async()=>{
 mock.pages=[{data:Array.from({length:500},()=>({scenario_master_id:'fixture'})),error:null},{data:[],error:null}]
 expect((await request('','playedScenarioOptions')).status).toHaveBeenCalledWith(200)
 expect(mock.calls.filter(c=>c[0]==='from')).toEqual([['from','organization_scenarios_with_master'],['from','organization_scenarios_with_master']])
 expect(mock.calls.filter(c=>c[0]==='eq')).toEqual([['eq','organization_id','verified-org'],['eq','org_status','available'],['eq','organization_id','verified-org'],['eq','org_status','available']])
})
it('does not mask a scenario-options failure as an empty list',async()=>{
 mock.pages=[{data:null,error:{message:'failure'}}]
 expect((await request('','playedScenarioOptions')).status).toHaveBeenCalledWith(500)
})

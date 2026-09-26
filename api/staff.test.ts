import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {VercelRequest,VercelResponse} from '@vercel/node'
const m=vi.hoisted(()=>({role:'admin',org:'own-org',rpc:vi.fn(),update:vi.fn(),from:vi.fn(),existingOrg:'own-org'}))
vi.mock('./_lib/db.js',()=>({getMissingEnvError:()=>null,db:{from:m.from,rpc:m.rpc}}))
vi.mock('./_lib/auth.js',async importOriginal=>({...(await importOriginal<typeof import('./_lib/auth')>()),requireAuth:async()=>({userId:'actor',orgId:m.org,role:m.role,jwt:'jwt'})}))
import handler from './staff'
const target='11111111-1111-4111-8111-111111111111'
beforeEach(()=>{
 vi.clearAllMocks();m.role='admin';m.org='own-org';m.existingOrg='own-org';m.rpc.mockResolvedValue({error:null})
 const chain={select:()=>chain,eq:()=>chain,update:m.update,maybeSingle:async()=>({data:{id:'staff',organization_id:m.existingOrg,user_id:null,name:'Staff'},error:null}),single:async()=>({data:{id:'staff'},error:null})}
 m.update.mockReturnValue(chain);m.from.mockReturnValue(chain)
})
async function patch(body:unknown,action?:string){
 const res={status:vi.fn(),json:vi.fn(),setHeader:vi.fn(),end:vi.fn()};res.status.mockReturnValue(res)
 await handler({method:'PATCH',headers:{},query:{id:'staff',action},body} as unknown as VercelRequest,res as unknown as VercelResponse)
 return res
}
describe('staff API account mutation boundary',()=>{
 it('連携は旧連携解除を含む1つのRPCへ渡す',async()=>{
  expect((await patch({user_id:target,email:'test@example.invalid'},'linkAccount')).status).toHaveBeenCalledWith(200)
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith('admin_link_staff_account',{p_actor_id:'actor',p_staff_id:'staff',p_user_id:target,p_email:'test@example.invalid'})
  expect(m.update).not.toHaveBeenCalled()
 })
 it.each(['staff','customer'])('%sは連携できない',async role=>{m.role=role;expect((await patch({user_id:target},'linkAccount')).status).toHaveBeenCalledWith(403);expect(m.rpc).not.toHaveBeenCalled()})
 it.each(['staff','customer'])('%sは利用状態を変えられない',async role=>{m.role=role;expect((await patch({status:'active'})).status).toHaveBeenCalledWith(403);expect(m.update).not.toHaveBeenCalled()})
 it('別組織スタッフをRPCへ渡さない',async()=>{m.existingOrg='other-org';expect((await patch({user_id:target},'linkAccount')).status).toHaveBeenCalledWith(403);expect(m.rpc).not.toHaveBeenCalled()})
 it.each([undefined,123,'invalid-id'])('不正な連携先%sを拒否する',async user_id=>{expect((await patch({user_id},'linkAccount')).status).toHaveBeenCalledWith(400);expect(m.rpc).not.toHaveBeenCalled()})
 it('DB失敗を成功扱いしない',async()=>{m.rpc.mockResolvedValue({error:{code:'23505'}});expect((await patch({user_id:target},'linkAccount')).status).toHaveBeenCalledWith(409)})
 it('連携解除も同じRPCへ渡す',async()=>{await patch({user_id:null},'linkAccount');expect(m.rpc).toHaveBeenCalledWith('admin_link_staff_account',expect.objectContaining({p_user_id:null}))})
 it('通常更新後にusersの別更新を行わない',async()=>{expect((await patch({role:['gm']})).status).toHaveBeenCalledWith(200);expect(m.from.mock.calls.every(([table])=>table==='staff')).toBe(true)})
})

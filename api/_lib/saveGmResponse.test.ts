import { beforeEach, expect, it, vi } from 'vitest'
import { saveGmResponse } from './saveGmResponse'
const org='00000000-0000-0000-0000-000000000001', staff='00000000-0000-0000-0000-000000000002', reservation='00000000-0000-0000-0000-000000000003'
const rpc=vi.fn(); let target:any;let user:any;let filters:unknown[]
const database:any={rpc,from:()=>{const query:any={select:()=>query,eq:(...args:unknown[])=>{filters.push(args);return query},maybeSingle:async()=>({data:target,error:null})};return query}}
const body={staffId:staff,reservationId:reservation,candidates:[{date:'2027-01-01'}],expectedResponse:{id:'response',updated_at:null},availableCandidates:[0],responseStatus:'available',notes:'note'}
beforeEach(()=>{vi.clearAllMocks();filters=[];target={id:staff,user_id:'self'};user={userId:'self',orgId:org,role:'staff'};rpc.mockResolvedValue({data:{id:'saved'},error:null})})
it('本人を組織と有効状態で確認し、読込時の候補と回答版をDBへ渡す',async()=>{
 await expect(saveGmResponse(database,user,body)).resolves.toEqual({response:{id:'saved'}})
 expect(filters).toContainEqual(['organization_id',org]);expect(filters).toContainEqual(['status','active'])
 expect(rpc).toHaveBeenCalledWith('save_gm_response_atomic',expect.objectContaining({p_org:org,p_candidates:body.candidates,p_expected_response:body.expectedResponse}))
})
it('別のGMへのスタッフ書込と顧客を拒否する',async()=>{
 user.userId='other';await expect(saveGmResponse(database,user,body)).rejects.toMatchObject({status:403});expect(rpc).not.toHaveBeenCalled()
 user.role='customer';await expect(saveGmResponse(database,user,body)).rejects.toMatchObject({status:403})
})
it('管理者の同組織への手動回答を許可し、候補競合は409で返す',async()=>{
 user.role='admin';user.userId='admin';rpc.mockResolvedValue({error:{code:'40001'}})
 await expect(saveGmResponse(database,user,body)).rejects.toMatchObject({status:409})
})
it('他組織または停止済みスタッフを許可しない',async()=>{
 target=null;await expect(saveGmResponse(database,user,body)).rejects.toMatchObject({status:403});expect(rpc).not.toHaveBeenCalled()
})

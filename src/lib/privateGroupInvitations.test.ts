import { beforeEach, expect, it, vi } from 'vitest'
const rpc=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/supabase',()=>({supabase:{rpc}}))
import { readPrivateGroupInvitations, managePrivateGroupInvitation, searchPrivateGroupInvitee } from './privateGroupInvitations'
beforeEach(()=>vi.clearAllMocks())
it('loads beyond100 and does not return partial history after later failure',async()=>{
 const page=Array.from({length:100},(_,i)=>({id:String(i).padStart(3,'0'),created_at:'2026-01-01'}))
 rpc.mockResolvedValueOnce({data:page,error:null}).mockResolvedValueOnce({data:[{id:'100',created_at:'2026-01-01'}],error:null})
 expect(await readPrivateGroupInvitations('g')).toHaveLength(101)
 expect(rpc).toHaveBeenLastCalledWith('private_group_read_invitations',{p_group_id:'g',p_after_id:'099',p_limit:100})
 rpc.mockResolvedValueOnce({data:page,error:null}).mockResolvedValueOnce({data:null,error:new Error('later page')})
 await expect(readPrivateGroupInvitations('g')).rejects.toThrow('later page')
})
it('does not treat malformed save results or lookup errors as success or not found',async()=>{
 rpc.mockResolvedValueOnce({data:{success:false},error:null});await expect(managePrivateGroupInvitation('g','create','target','x@example.invalid')).rejects.toThrow('保存結果')
 rpc.mockResolvedValueOnce({data:null,error:new Error('unauthorized')});await expect(searchPrivateGroupInvitee('g','x@example.invalid')).rejects.toThrow('unauthorized')
 rpc.mockResolvedValueOnce({data:{id:'i',status:'cancelled'},error:null});await managePrivateGroupInvitation('g','cancel','i')
 expect(rpc).toHaveBeenLastCalledWith('private_group_manage_invitation',{p_group_id:'g',p_action:'cancel',p_invitation_id:'i'})
})

it('passes the known email with the target identity when creating an invitation',async()=>{
 rpc.mockResolvedValueOnce({data:{id:'i',status:'pending'},error:null})
 await managePrivateGroupInvitation('g','create','target','x@example.invalid')
 expect(rpc).toHaveBeenCalledWith('private_group_manage_invitation',{p_group_id:'g',p_action:'create',p_target_user_id:'target',p_email:'x@example.invalid'})
})

it('preserves database rejection messages returned as plain error objects',async()=>{
 rpc.mockResolvedValueOnce({data:null,error:{message:'回答済みの招待は再送できません',code:'23514'}})
 await expect(managePrivateGroupInvitation('g','create','target','x@example.invalid')).rejects.toThrow('回答済みの招待は再送できません')
})

// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { beforeEach,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('@/lib/supabase',()=>({supabase:{rpc:mocks.rpc}}))
import { readSurveyDeliveries,sendSurveyNotice } from './privateSurveyDelivery'
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true})
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear()})
it('retains request identity on transport failure and never sends client email/body',async()=>{
 mocks.rpc.mockResolvedValueOnce({data:null,error:new Error('network')})
 await expect(sendSurveyNotice('group','reservation','actor')).rejects.toThrow('network')
 const first=mocks.rpc.mock.calls[0][1]
 expect(Object.keys(first).sort()).toEqual(['p_expected_reservation_id','p_group_id','p_request_id'])
 mocks.rpc.mockResolvedValueOnce({data:{success:true,delivery_id:first.p_request_id,status:'pending',replayed:true},error:null})
 expect((await sendSurveyNotice('group','reservation','actor')).status).toBe('pending')
 expect(mocks.rpc.mock.calls[1][1]).toEqual(first)
})
it('does not report a false or malformed RPC response as success',async()=>{
 mocks.rpc.mockResolvedValue({data:{success:false},error:null})
 await expect(sendSurveyNotice('group','reservation','actor')).rejects.toThrow('保存結果')
 mocks.rpc.mockResolvedValue({data:{deliveries:[]},error:null})
 await expect(readSurveyDeliveries('group')).rejects.toThrow('通知履歴')
})

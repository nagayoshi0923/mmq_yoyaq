import { beforeEach, expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{rpc:mock.rpc}}))
import { fetchPlayedOverrideIds, removePlayedOverride } from './playedOverrides'
import { customerPlayHistory } from './customerPlayHistory'
beforeEach(()=>mock.rpc.mockReset())
it.each([true,false])('preserves removed=%s returned by the authorized operation',async removed=>{
 mock.rpc.mockResolvedValue({data:{removed},error:null})
 await expect(removePlayedOverride('customer','scenario')).resolves.toBe(removed)
 expect(mock.rpc).toHaveBeenCalledWith('customer_play_history_action',{p_customer_id:'customer',p_action:'remove_override',p_record:{scenario_master_id:'scenario'}})
})
it('does not turn a failed snapshot into an empty exclusion set',async()=>{
 const error=new Error('forbidden');mock.rpc.mockResolvedValue({data:null,error})
 await expect(fetchPlayedOverrideIds('customer')).rejects.toBe(error)
})
it('reads exclusions from the verified snapshot',async()=>{
 mock.rpc.mockResolvedValue({data:{manual:[],overrides:[{scenario_master_id:'a'},{scenario_master_id:'b'}]},error:null})
 await expect(fetchPlayedOverrideIds('customer')).resolves.toEqual(new Set(['a','b']))
})
it('does not report an absent mutation response as success',async()=>{
 mock.rpc.mockResolvedValue({data:null,error:null})
 await expect(customerPlayHistory.add('customer',{scenario_title:'Fixture'})).rejects.toThrow('処理結果')
})
it('propagates mutation errors',async()=>{
 const error=new Error('unavailable');mock.rpc.mockResolvedValue({data:null,error})
 await expect(removePlayedOverride('customer','scenario')).rejects.toBe(error)
})

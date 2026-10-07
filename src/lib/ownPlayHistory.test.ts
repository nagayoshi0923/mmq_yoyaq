import { expect,it,vi } from 'vitest'
const snapshot=vi.hoisted(()=>vi.fn())
vi.mock('./customerPlayHistory',()=>({customerPlayHistory:{snapshot}}))
import {snapshotAllCustomers,findManualHistoryOwner} from './ownPlayHistory'
it('全本人IDの履歴と未体験指定を集約し重複IDは1回だけ読む',async()=>{
 snapshot.mockImplementation(async(id:string)=>({can_edit:true,manual:id==='legacy'?[{id:'M',scenario_master_id:'S'}]:[],overrides:id==='global'?[{scenario_master_id:'O'}]:[]}))
 const result=await snapshotAllCustomers(['global','legacy','legacy'])
 expect(result.manual).toEqual([{id:'M',scenario_master_id:'S'}]);expect(result.overrides).toEqual([{scenario_master_id:'O'}]);expect(snapshot).toHaveBeenCalledTimes(2)
 expect(await findManualHistoryOwner(['global','legacy'],'M')).toBe('legacy')
 expect(await findManualHistoryOwner(['global','legacy'],'missing')).toBeNull()
})
it('別本人行の取得失敗を空履歴と誤認しない',async()=>{
 snapshot.mockImplementation(async(id:string)=>{if(id==='legacy')throw Error('offline');return {can_edit:true,manual:[],overrides:[]}})
 await expect(snapshotAllCustomers(['global','legacy'])).rejects.toThrow('offline')
})

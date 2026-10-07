import { expect,it,vi } from 'vitest'
const {snapshot,updateDate}=vi.hoisted(()=>({snapshot:vi.fn(),updateDate:vi.fn()}))
vi.mock('./customerPlayHistory',()=>({customerPlayHistory:{snapshot,updateDate}}))
import {snapshotAllCustomers,findManualHistoryOwner,updateOwnManualDate} from './ownPlayHistory'
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

it('別本人CIDの手動日付を所有CIDで更新し不明IDには書き込まない',async()=>{
 snapshot.mockImplementation(async(id:string)=>({can_edit:true,manual:id==='legacy'?[{id:'M'}]:[],overrides:[]}))
 updateDate.mockResolvedValue(true)
 expect(await updateOwnManualDate(['global','legacy'],'M','2026-10-08')).toBe(true)
 expect(updateDate).toHaveBeenCalledWith('legacy','M','2026-10-08')
 updateDate.mockClear()
 await expect(updateOwnManualDate(['global','legacy'],'foreign','2026-10-08')).rejects.toThrow('ご本人')
 expect(updateDate).not.toHaveBeenCalled()
})

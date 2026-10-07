import { beforeEach, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({snapshot:vi.fn(),add:vi.fn(),removeOverride:vi.fn(),reservations:vi.fn()}))
vi.mock('./supabase',()=>({supabase:{}}))
vi.mock('./customerPlayHistory',()=>({customerPlayHistory:m}))
vi.mock('./playedStatus',async original=>({...await original<object>(),fetchPlayedReservations:m.reservations}))
import {registerPlayedScenario} from './registerPlayedScenario'
beforeEach(()=>{vi.resetAllMocks();m.snapshot.mockResolvedValue({can_edit:true,manual:[],overrides:[]});m.reservations.mockResolvedValue([]);m.add.mockResolvedValue({});m.removeOverride.mockResolvedValue(false)})
it('全本人顧客の旧overrideを解除し、他行にある既存体験を重複登録しない',async()=>{
 m.snapshot.mockImplementation(async id=>({can_edit:true,manual:id==='legacy'?[{scenario_master_id:'work'}]:[],overrides:[{scenario_master_id:'work'}]}))
 expect(await registerPlayedScenario(['global','legacy'],'work','架空作品',null)).toBe(true)
 expect(m.add).not.toHaveBeenCalled();expect(m.removeOverride.mock.calls).toEqual([['global','work'],['legacy','work']])
})
it('解除の一部失敗では成功しない。再試行は既に追加した履歴を再追加しない',async()=>{
 m.removeOverride.mockImplementation(async id=>{if(id==='legacy')throw Error('read unavailable');return false})
 await expect(registerPlayedScenario(['global','legacy'],'work','架空作品',null)).rejects.toThrow('read unavailable')
 expect(m.add).toHaveBeenCalledTimes(1)
 m.snapshot.mockResolvedValue({can_edit:true,manual:[{scenario_master_id:'work'}],overrides:[]});m.removeOverride.mockResolvedValue(false)
 expect(await registerPlayedScenario(['global','legacy'],'work','架空作品',null)).toBe(true);expect(m.add).toHaveBeenCalledTimes(1)
})
it('本人行の読取・権限確認に失敗すると書込みを始めない',async()=>{
 m.snapshot.mockImplementation(async id=>({can_edit:id!=='legacy',manual:[],overrides:[]}))
 await expect(registerPlayedScenario(['global','legacy'],'work','架空作品',null)).rejects.toThrow('権限')
 expect(m.add).not.toHaveBeenCalled();expect(m.removeOverride).not.toHaveBeenCalled()
})

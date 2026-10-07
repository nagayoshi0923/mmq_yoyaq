// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({snap:vi.fn(),played:vi.fn()}))
vi.mock('@/lib/supabase',()=>({supabase:{}}))
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'owner'}})}))
vi.mock('@/lib/api/customerHookReadApi',()=>({customerLookupReadApi:{listIdsByUserId:async()=>({data:[{id:'global'},{id:'legacy'}],error:null})}}))
vi.mock('@/lib/customerPlayHistory',()=>({customerPlayHistory:{snapshot:m.snap}}))
vi.mock('@/lib/playedStatus',async importOriginal=>({...await importOriginal<object>(),fetchPlayedReservations:m.played}))
import {usePlayedScenarios} from './usePlayedScenarios'
let root:Root,result:ReturnType<typeof usePlayedScenarios>
function Fixture(){result=usePlayedScenarios();return null}
afterEach(async()=>{await act(async()=>root?.unmount())})
it('本人の全顧客行の手動/予約履歴を統合し、未体験指定を全体に適用する',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 m.snap.mockImplementation(async id=>({manual:[{scenario_master_id:id==='global'?'A':'B'}],overrides:id==='global'?[{scenario_master_id:'C'}]:[]}))
 m.played.mockImplementation(async id=>[{scenario_master_id:id==='global'?'C':'D'}])
 root=createRoot(document.createElement('div'));await act(async()=>root.render(<Fixture/>))
 expect([...result.playedScenarioIds].sort()).toEqual(['A','B','D'])
 expect(m.snap).toHaveBeenCalledWith('legacy');expect(m.played).toHaveBeenCalledWith('legacy')
 expect(result.customerId).toBe('global')
})

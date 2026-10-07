// @vitest-environment jsdom
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({snap:vi.fn(),played:vi.fn(),userId:'owner',lookupError:null as Error|null}))
vi.mock('@/lib/supabase',()=>({supabase:{}}))
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:m.userId}})}))
vi.mock('@/lib/api/customerHookReadApi',()=>({customerLookupReadApi:{listIdsByUserId:async()=>({data:m.lookupError?null:[{id:'global'},{id:'legacy'}],error:m.lookupError})}}))
vi.mock('@/lib/customerPlayHistory',()=>({customerPlayHistory:{snapshot:m.snap}}))
vi.mock('@/lib/playedStatus',async importOriginal=>({...await importOriginal<object>(),fetchPlayedReservations:m.played}))
import {usePlayedScenarios} from './usePlayedScenarios'
let root:Root,result:ReturnType<typeof usePlayedScenarios>
function Fixture(){result=usePlayedScenarios();return null}
afterEach(async()=>{await act(async()=>root?.unmount());m.userId='owner';m.lookupError=null})
it('本人の全顧客行の手動/予約履歴を統合し、未体験指定を全体に適用する',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 m.snap.mockImplementation(async id=>({manual:[{scenario_master_id:id==='global'?'A':'B'}],overrides:id==='global'?[{scenario_master_id:'C'}]:[]}))
 m.played.mockImplementation(async id=>[{scenario_master_id:id==='global'?'C':'D'}])
 root=createRoot(document.createElement('div'));await act(async()=>root.render(<Fixture/>))
 expect([...result.playedScenarioIds].sort()).toEqual(['A','B','D'])
 expect(m.snap).toHaveBeenCalledWith('legacy');expect(m.played).toHaveBeenCalledWith('legacy')
 expect(result.customerId).toBe('global')
})

it('別画面の履歴更新イベント後に一覧も再取得し同じ判定に戻る',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 m.snap.mockImplementation(async()=>({can_edit:true,manual:[],overrides:[]}));m.played.mockResolvedValue([])
 root=createRoot(document.createElement('div'));await act(async()=>root.render(<Fixture/>));expect(result.isPlayed('NEW')).toBe(false)
 m.snap.mockImplementation(async(id:string)=>({can_edit:true,manual:id==='legacy'?[{scenario_master_id:'NEW'}]:[],overrides:[]}))
 await act(async()=>window.dispatchEvent(new window.Event('mmq:play-history-changed')))
 expect(result.isPlayed('NEW')).toBe(true)
})

it('認証切替後の取得失敗でも前利用者のIDと履歴を残さない',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 m.snap.mockResolvedValue({manual:[{scenario_master_id:'OLD'}],overrides:[]});m.played.mockResolvedValue([])
 root=createRoot(document.createElement('div'));await act(async()=>root.render(<Fixture/>))
 expect(result.isPlayed('OLD')).toBe(true)
 m.userId='another-owner';m.lookupError=new Error('fixture lookup failed')
 await act(async()=>root.render(<Fixture/>))
 expect(result.customerId).toBeNull();expect(result.customerIds).toEqual([])
 expect([...result.playedScenarioIds]).toEqual([]);expect(result.loading).toBe(false)
})

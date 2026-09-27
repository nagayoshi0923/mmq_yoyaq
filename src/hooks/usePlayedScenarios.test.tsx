// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({past:vi.fn(),history:vi.fn()}))
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{email:'fixture@example.test'}})}))
vi.mock('@/lib/supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'customer'}})})})})}}))
vi.mock('@/lib/customerPlayHistory',()=>({customerPlayHistory:{snapshot:mocks.history}}))
vi.mock('@/lib/playedStatus',async importOriginal=>({...await importOriginal<object>(),fetchPlayedReservations:mocks.past}))
vi.mock('@/utils/logger',()=>({logger:{error:vi.fn()}}))
import { usePlayedScenarios } from './usePlayedScenarios'
let root:Root,host:HTMLDivElement
function View(){const state=usePlayedScenarios();return <div>{Array.from(state.playedScenarioIds).join(',')}</div>}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.resetAllMocks();host=document.createElement('div');root=createRoot(host);mocks.past.mockRejectedValue(new Error('reservation query failed'))})
afterEach(async()=>{await act(async()=>root.unmount())})
it('予約取得が失敗しても確認済みの手動履歴を体験済みに保つ',async()=>{
 mocks.history.mockResolvedValue({manual:[{scenario_master_id:'manual'}],overrides:[]})
 await act(async()=>root.render(<View/>))
 expect(host.textContent).toBe('manual')
})
it('予約取得失敗時も未体験指定を優先する',async()=>{
 mocks.history.mockResolvedValue({manual:[{scenario_master_id:'manual'}],overrides:[{scenario_master_id:'manual'}]})
 await act(async()=>root.render(<View/>))
 expect(host.textContent).toBe('')
})

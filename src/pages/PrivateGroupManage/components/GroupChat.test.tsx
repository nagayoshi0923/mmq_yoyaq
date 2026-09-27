// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { GroupChat } from './GroupChat'
const fixture = vi.hoisted(() => ({
 group: { members: [{id:'m1',status:'joined',guest_name:'一人目'},{id:'m2',status:'joined',guest_name:'二人目'}], character_assignments: {m1:'a',m2:'b'} },
 refresh: vi.fn(), rpc: vi.fn(), success: vi.fn(), error: vi.fn(), confirmed: vi.fn(),
}))
vi.mock('@/hooks/usePrivateGroupSnapshot',()=>({usePrivateGroupSnapshot:()=>({group:fixture.group,refetch:fixture.refresh})}))
vi.mock('@/hooks/usePrivateGroupMessages',()=>({usePrivateGroupMessages:()=>({messages:[],loading:false,error:false,refetch:vi.fn()})}))
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'user'}})}))
vi.mock('@/lib/supabase',()=>({supabase:{rpc:fixture.rpc}}))
vi.mock('@/utils/logger',()=>({logger:{log:vi.fn(),error:vi.fn(),warn:vi.fn()}}))
vi.mock('@/lib/sentry',()=>({Sentry:{captureMessage:vi.fn()}}))
vi.mock('sonner',()=>({toast:{success:fixture.success,error:fixture.error}}))
vi.mock('@/pages/PrivateGroupInvite/components/SurveyResponseForm',()=>({SurveyResponseForm:()=>null}))
let root:Root
let container:HTMLDivElement
const render=async()=>{await act(async()=>root.render(<GroupChat groupId="g" currentMemberId="m1" members={[]} isOrganizer charAssignmentMethod="self" characters={[{id:'a',name:'A'},{id:'b',name:'B'}]} scenarioPlayerCount={2} onCharAssignmentConfirmed={fixture.confirmed}/>))}
const click=async(text:string)=>{const button=[...container.querySelectorAll('button')].find(b=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>button!.click())}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 HTMLElement.prototype.scrollIntoView=vi.fn()
 vi.clearAllMocks()
 fixture.group={members:[{id:'m1',status:'joined',guest_name:'一人目'},{id:'m2',status:'joined',guest_name:'二人目'}],character_assignments:{m1:'a',m2:'b'}}
 fixture.refresh.mockImplementation(async()=>({group:fixture.group}))
 fixture.rpc.mockResolvedValue({error:null})
 container=document.createElement('div');document.body.append(container);root=createRoot(container)
})
afterEach(async()=>{await act(async()=>root.unmount());container.remove()})
describe('貸切の配役確定',()=>{
 it('確認開始時の希望を固定し、定期取得後も古い確認内容の検出に使う',async()=>{
  await render();await click('配役を確定する')
  fixture.group={...fixture.group,character_assignments:{m1:'b',m2:'a'}}
  await render();await click('配役を確定')
  expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith('private_group_confirm_characters',{p_group_id:'g',p_assignments:{m1:'a',m2:'b'},p_expected_assignments:{m1:'a',m2:'b'}})
  expect(fixture.success).toHaveBeenCalledWith('配役を確定しました')
  expect(fixture.confirmed).toHaveBeenCalledOnce()
 })
 it('保存エラー時は成功通知や確定済みへの切替を行わない',async()=>{
  fixture.rpc.mockResolvedValue({error:{code:'40001',message:'changed'}})
  await render();await click('配役を確定する');await click('配役を確定')
  expect(fixture.success).not.toHaveBeenCalled();expect(fixture.confirmed).not.toHaveBeenCalled()
  expect(fixture.error).toHaveBeenCalledOnce()
  expect(container.textContent).toContain('配役を確定')
 })
 it('最新情報を取得できない場合は確認画面へ進まない',async()=>{
  fixture.refresh.mockResolvedValue(null)
  await render();await click('配役を確定する')
  expect(fixture.rpc).not.toHaveBeenCalled();expect(fixture.error).toHaveBeenCalledOnce()
  expect(container.textContent).toContain('配役を確定する')
 })
})

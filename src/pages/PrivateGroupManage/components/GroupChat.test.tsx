// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { GroupChat } from './GroupChat'
const fixture = vi.hoisted(() => ({
 group: { members: [{id:'m1',status:'joined',guest_name:'一人目'},{id:'m2',status:'joined',guest_name:'二人目'}], character_assignments: {m1:'a',m2:'b'} as Record<string,string> },
 messages: [] as Array<{id:string,message:string,created_at:string,member_id:null}>,
 refresh: vi.fn(), rpc: vi.fn(), success: vi.fn(), error: vi.fn(), confirmed: vi.fn(),
}))
vi.mock('@/hooks/usePrivateGroupSnapshot',()=>({usePrivateGroupSnapshot:()=>({group:fixture.group,refetch:fixture.refresh})}))
vi.mock('@/hooks/usePrivateGroupMessages',()=>({usePrivateGroupMessages:()=>({messages:fixture.messages,loading:false,error:false,refetch:vi.fn()})}))
vi.mock('@/hooks/usePrivateGroupChatState',()=>({usePrivateGroupChatState:()=>({state:{my_last_read_at:null,read_times:[],reactions:[]},loaded:true,refetch:vi.fn(),markRead:vi.fn(),react:vi.fn()})}))
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'user'}})}))
vi.mock('@/lib/supabase',()=>({supabase:{rpc:fixture.rpc,channel:()=>({on(){return this},subscribe(){return this},send:vi.fn()}),removeChannel:vi.fn()}}))
vi.mock('@/utils/logger',()=>({logger:{log:vi.fn(),error:vi.fn(),warn:vi.fn()}}))
vi.mock('@/lib/sentry',()=>({Sentry:{captureMessage:vi.fn()}}))
vi.mock('sonner',()=>({toast:{success:fixture.success,error:fixture.error}}))
vi.mock('@/pages/PrivateGroupInvite/components/SurveyResponseForm',()=>({SurveyResponseForm:()=>null}))
let root:Root
let container:HTMLDivElement
const render=async(overrides:Partial<ComponentProps<typeof GroupChat>>={})=>{await act(async()=>root.render(<GroupChat groupId="g" currentMemberId="m1" members={[]} isOrganizer charAssignmentMethod="self" characters={[{id:'a',name:'A'},{id:'b',name:'B'}]} {...overrides}/>))}
const click=async(text:string)=>{const button=[...container.querySelectorAll('button')].find(b=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>button!.click())}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 HTMLElement.prototype.scrollIntoView=vi.fn()
 vi.clearAllMocks()
 fixture.messages=[]
 fixture.group={members:[{id:'m1',status:'joined',guest_name:'一人目'},{id:'m2',status:'joined',guest_name:'二人目'}],character_assignments:{m1:'a',m2:'b'}}
 fixture.refresh.mockImplementation(async()=>({group:fixture.group}))
 fixture.rpc.mockResolvedValue({error:null})
 container=document.createElement('div');document.body.append(container);root=createRoot(container)
})
describe('チャットの自動のお知らせ（カードを流さない）',()=>{
 it('店舗の確定・候補日の追加・引き継ぎの依頼は灰色の 1 行で、引き継ぎは宛先本人だけ',async()=>{
  const sys=(id:string,body:Record<string,unknown>)=>({id,created_at:'2026-10-10T01:00:00+00:00',member_id:null,message:JSON.stringify({type:'system',...body})})
  fixture.messages=[
   sys('c',{action:'candidate_dates_added',count:2,dates:[]}),
   sys('s',{action:'schedule_confirmed',confirmedDate:'2026-11-07',confirmedTimeSlot:'14:00〜17:00',title:'日程が確定いたしました',body:'ご予約ありがとうございます。'}),
   sys('h',{action:'individual_notice',target_member_id:'m2',handover_request_id:'h1',message:'一人目さんから「作品」の…'}),
  ]
  const goOverview=vi.fn()
  await render({charAssignmentMethod:null,onGoToOverview:goOverview})
  const lines=[...container.querySelectorAll('[data-testid="system-notice-line"]')].map(e=>e.textContent)
  expect(lines).toEqual(['退出したメンバーさんが候補日を 2 件追加','店舗が日程を確定しました 11/7(土) 14:00〜17:00› 概要を見る'])
  expect(container.textContent).not.toContain('ご予約ありがとうございます')
  await click('› 概要を見る');expect(goOverview).toHaveBeenCalledOnce()
  await render({currentMemberId:'m2',charAssignmentMethod:null,onOpenHandover:vi.fn()})
  expect(container.textContent).toContain('一人目さんから主催者の引き継ぎの依頼› 確認する')
 })
})
afterEach(async()=>{await act(async()=>root.unmount());container.remove()})
describe('配役はチャットに出さない（概要タブの配役欄へ）',()=>{
 it('決め方の選択・希望の選択・確定のカードは出さず、状態の灰色 1 行だけ',async()=>{
  const goCasting=vi.fn(),openSheet=vi.fn()
  await render({charAssignmentMethod:null,needsCharAssignmentChoice:true,onGoToCasting:goCasting,onOpenCastingSheet:openSheet})
  expect(container.textContent).not.toContain('自分たちで決める')
  expect(container.textContent).toContain('配役の決め方を選んでください› 選ぶ')
  await click('› 選ぶ');expect(openSheet).toHaveBeenCalledWith('casting-method')
  // self で自分の希望が未選択
  fixture.group={...fixture.group,character_assignments:{m2:'b'}}
  await render({onOpenCastingSheet:openSheet})
  expect(container.textContent).not.toContain('配役を確定する')
  expect(container.textContent).toContain('やりたいキャラクターを選んでください› 選ぶ')
  await click('› 選ぶ');expect(openSheet).toHaveBeenLastCalledWith('casting-pick')
  // 確定のお知らせ
  fixture.messages=[{id:'done',created_at:'2026-09-27T00:00:00+00:00',member_id:null,message:JSON.stringify({type:'system',action:'character_assignment',title:'過去の配役確定',body:'A: 一人目'})}]
  fixture.group={...fixture.group,character_assignments:{m1:'a',m2:'b'}}
  await render({onGoToCasting:goCasting})
  expect([...container.querySelectorAll('[data-testid="system-notice-line"]')].map(e=>e.textContent)).toEqual(['配役が確定しました› 概要'])
  await click('› 概要');expect(goCasting).toHaveBeenCalledOnce()
 })
})

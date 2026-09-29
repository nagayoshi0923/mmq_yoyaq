// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { SurveyResponsesTab } from './SurveyResponsesTab'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),success:vi.fn(),error:vi.fn()}))
vi.mock('@/lib/surveyQuestionSettings',()=>({readSurveyQuestionSettings:async()=>({revision:'loaded',questions:[{id:'q',question_text:'質問',question_type:'text',options:[]}]})}))
vi.mock('@/lib/privateGroupRead',()=>({
 readPrivateGroupByReservation:async()=>({group:{id:'g',organization_id:'org',scenario_master_id:'scenario',members:[{id:'m',guest_name:'公開名',staff_display_name:'管理画面名'}]}}),
 readPrivateGroupSurveyResponses:async()=>[],readPrivateGroupMessageHistory:async()=>[],
}))
vi.mock('@/lib/supabase',()=>({supabase:{rpc:mocks.rpc,from:(table:string)=>{
 const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:{org_scenario_id:'os',characters:[],individual_notice_template:'定型文'}}),order:async()=>({data:table==='org_scenario_survey_questions'?[{id:'q',question_text:'質問',question_type:'text',options:[]}]:[]})};return chain
}}}))
vi.mock('@/utils/toast',()=>({showToast:{success:mocks.success,error:mocks.error}}))
vi.mock('@/utils/logger',()=>({logger:{log:vi.fn(),error:vi.fn()}}))
let root:Root
let container:HTMLDivElement
const click=async(text:string)=>{const b=[...container.querySelectorAll('button')].find(x=>x.textContent?.includes(text));expect(b).toBeTruthy();await act(async()=>b!.click())}
const open=async()=>{await act(async()=>root.render(<SurveyResponsesTab reservationId="r"/>));await click('管理画面名')}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks()
 container=document.createElement('div');document.body.append(container);root=createRoot(container)
 mocks.rpc.mockResolvedValue({data:{id:'saved-id',created_at:'2025-01-01T00:00:00+00:00',message:JSON.stringify({target_member_id:'m',target_member_name:'公開名',sent_by:'サーバーの送信者',character_name:'サーバーの配役'})},error:null})
})
afterEach(async()=>{await act(async()=>root.unmount());container.remove()})
describe('個別通知の保存',()=>{
 it('宛先や資料をクライアントで組み立てず、保存結果の履歴を表示する',async()=>{
  await open();await click('送信')
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('private_group_send_individual_notice',{p_group_id:'g',p_member_id:'m',p_message:'',p_character_id:null,p_attach_template:true})
  expect(container.textContent).toContain('サーバーの送信者');expect(container.textContent).toContain('サーバーの配役')
  expect(container.textContent).toContain('09:00');expect(mocks.success).toHaveBeenCalledOnce()
 })
 it('保存失敗時は履歴や成功表示を追加せず、再送する内容を保持する',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:'42501'}})
  await open();await click('送信')
  expect(mocks.success).not.toHaveBeenCalled();expect(mocks.error).toHaveBeenCalledOnce()
  expect(container.textContent).not.toContain('送信履歴');expect(container.textContent).toContain('定型文')
  expect(container.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')).toBe('true')
 })
 it('保存結果が欠けている場合も成功扱いにしない',async()=>{
  mocks.rpc.mockResolvedValue({data:{},error:null})
  await open();await click('送信')
  expect(mocks.success).not.toHaveBeenCalled();expect(mocks.error).toHaveBeenCalledOnce()
 })
})

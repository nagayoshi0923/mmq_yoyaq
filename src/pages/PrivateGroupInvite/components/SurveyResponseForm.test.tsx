// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,expect,it,vi} from 'vitest'
const action=vi.fn()
vi.mock('@/lib/privateGroupGuestSession',()=>({privateGroupMemberAction:(...a:unknown[])=>action(...a)}))
vi.mock('@/lib/supabase',()=>({supabase:{}}))
const toastError=vi.fn()
vi.mock('sonner',()=>({toast:{error:(...a:unknown[])=>toastError(...a),success:vi.fn()}}))
import {SurveyResponseForm} from './SurveyResponseForm'
const charQ={id:'q1',question_text:'希望キャラクター',question_type:'character_selection',is_required:true,options:[],order_num:1}
const textQ={id:'q2',question_text:'苦手な表現',question_type:'text',is_required:false,options:[],order_num:2}
const survey=(questions:unknown[])=>({data:{survey_enabled:true,questions,characters:[{id:'c1',name:'探偵'}]},error:null})
beforeEach(()=>{action.mockReset();toastError.mockReset();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})})
async function render(props:Record<string,unknown>){
 const host=document.createElement('div'),root=createRoot(host)
 await act(async()=>root.render(<SurveyResponseForm groupId="g" memberId="m" {...props}/>))
 return {host,root}
}
it('配役方法が「アンケート」でない場合は、キャラクターの質問を出さず、必須でも送信できる（#911）',async()=>{
 action.mockImplementation(async(_g:string,_m:string,kind:string)=>kind==='survey_read'?survey([charQ,textQ]):{data:'r1',error:null})
 const {host,root}=await render({hideCharacterSelection:true})
 try {
  expect(host.textContent).toContain('苦手な表現');expect(host.textContent).not.toContain('希望キャラクター')
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('送信'))!
  await act(async()=>{button.click()})
  expect(toastError).not.toHaveBeenCalled()
  expect(action).toHaveBeenCalledWith('g','m','survey_write',{})
 }finally{await act(async()=>root.unmount())}
})
it('配役方法が「アンケート」の場合は、キャラクターの質問を出し、未回答なら止める',async()=>{
 action.mockResolvedValue(survey([charQ,textQ]))
 const {host,root}=await render({})
 try {
  expect(host.textContent).toContain('希望キャラクター')
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('送信'))!
  await act(async()=>{button.click()})
  expect(toastError).toHaveBeenCalledWith(expect.stringContaining('希望キャラクター'))
  expect(action).not.toHaveBeenCalledWith('g','m','survey_write',expect.anything())
 }finally{await act(async()=>root.unmount())}
})
it('質問がキャラクター選択だけで、それを出さない場合は何も表示しない',async()=>{
 action.mockResolvedValue(survey([charQ]))
 const {host,root}=await render({hideCharacterSelection:true})
 try { expect(host.textContent).toBe('') }finally{await act(async()=>root.unmount())}
})
it('出していないキャラクター希望の古い回答は送信しない（#915）',async()=>{
 action.mockImplementation(async(_g:string,_m:string,kind:string)=>kind==='survey_read'
  ?{data:{survey_enabled:true,questions:[charQ,textQ],existing_response_id:'r1',existing_responses:{q1:'c1',q2:'なし'}},error:null}
  :{data:'r1',error:null})
 const {host,root}=await render({hideCharacterSelection:true})
 try {
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('更新'))!
  await act(async()=>{button.click()})
  expect(action).toHaveBeenCalledWith('g','m','survey_write',{q2:'なし'})
 }finally{await act(async()=>root.unmount())}
})
it('送信済みでも、いま必須のキャラクター希望が空なら回答済みにしない（#915）',async()=>{
 action.mockResolvedValue({data:{survey_enabled:true,questions:[charQ,textQ],characters:[{id:'c1',name:'探偵'}],existing_response_id:'r1',existing_responses:{q2:'なし'}},error:null})
 const {host,root}=await render({})
 try {
  expect(host.textContent).toContain('未回答の質問があります');expect(host.textContent).not.toContain('回答済み')
 }finally{await act(async()=>root.unmount())}
})

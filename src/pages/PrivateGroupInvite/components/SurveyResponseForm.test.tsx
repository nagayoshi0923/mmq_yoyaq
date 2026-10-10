// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {beforeEach,expect,it,vi} from 'vitest'
const action=vi.fn()
vi.mock('@/lib/privateGroupGuestSession',()=>({privateGroupMemberAction:(...a:unknown[])=>action(...a)}))
vi.mock('@/lib/supabase',()=>({supabase:{}}))
const toastError=vi.fn()
vi.mock('sonner',()=>({toast:{error:(...a:unknown[])=>toastError(...a),success:vi.fn()}}))
const reportMock=vi.fn()
vi.mock('@/lib/surveyDiagnostics',()=>({reportSurveyEvent:(...a:unknown[])=>reportMock(...a)}))
import {SurveyResponseForm} from './SurveyResponseForm'
const charQ={id:'q1',question_text:'希望キャラクター',question_type:'character_selection',is_required:true,options:[],order_num:1}
const textQ={id:'q2',question_text:'苦手な表現',question_type:'text',is_required:false,options:[],order_num:2}
const choiceQ={id:'q3',question_text:'経験',question_type:'single_choice',is_required:true,options:[{value:'first',label:'初めて'},{value:'some',label:'2〜5 回'}],order_num:0}
const chars=[{id:'c1',name:'探偵',gender:'male'},{id:'c2',name:'画家'},{id:'c3',name:'医師',gender:'any'}]
const survey=(questions:unknown[],extra:Record<string,unknown>={})=>({data:{survey_enabled:true,questions,characters:chars,...extra},error:null})
beforeEach(()=>{action.mockReset();reportMock.mockReset();toastError.mockReset();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})})
async function render(props:Record<string,unknown>){
 const host=document.createElement('div'),root=createRoot(host)
 const onClose=vi.fn(),onSubmitted=vi.fn()
 await act(async()=>root.render(<SurveyResponseForm groupId="g" memberId="m" onClose={onClose} onSubmitted={onSubmitted} {...props}/>))
 return {host,root,onClose,onSubmitted}
}
const submitButton=(host:HTMLElement)=>host.querySelector<HTMLButtonElement>('[data-testid="survey-submit"]')
const writeRespondsOk=()=>action.mockImplementation(async(_g:string,_m:string,kind:string)=>kind==='survey_read'?survey([charQ,textQ]):{data:'r1',error:null})

it('全画面のシートとして、題名・帯・作品と開催日時・店舗・回答期限を出す',async()=>{
 action.mockResolvedValue(survey([charQ,textQ],{survey_deadline_at:'2099-11-05T14:59:59Z'}))
 const {host,root}=await render({scenarioTitle:'告別詩',performanceDate:'2099-11-07',startTime:'14:00:00',storeName:'高田馬場店'})
 try {
  expect(host.textContent).toContain('事前配役アンケート')
  expect(host.textContent).toContain('回答は店舗と GM にだけ届きます。配役は当日お伝えします。')
  const meta=host.querySelector('[data-testid="survey-meta"]')!.textContent!
  expect(meta).toContain('告別詩');expect(meta).toContain('14:00 高田馬場店');expect(meta).toMatch(/回答期限 11\/5\(.\)/)
  expect(submitButton(host)!.textContent).toBe('回答を送る')
  expect(host.textContent).toContain('送ったあとも期限までは変更できます')
 }finally{await act(async()=>root.unmount())}
})
it('配役方法が「アンケート」でない場合は、キャラクターの質問を出さず、必須でも送信できる（#911）',async()=>{
 writeRespondsOk()
 const {host,root,onClose,onSubmitted}=await render({hideCharacterSelection:true})
 try {
  expect(host.textContent).toContain('苦手な表現');expect(host.textContent).not.toContain('やってみたいキャラクター')
  await act(async()=>{submitButton(host)!.click()})
  expect(toastError).not.toHaveBeenCalled()
  expect(action).toHaveBeenCalledWith('g','m','survey_write',{})
  expect(onSubmitted).toHaveBeenCalled();expect(onClose).toHaveBeenCalled()
 }finally{await act(async()=>root.unmount())}
})
it('配役方法が「アンケート」の場合は、キャラクターを 1. に出し、未回答なら止める',async()=>{
 action.mockResolvedValue(survey([textQ,charQ]))
 const {host,root}=await render({})
 try {
  const qs=[...host.querySelectorAll('[data-testid="survey-question"]')]
  expect(qs[0].textContent).toContain('1. やってみたいキャラクター');expect(qs[0].textContent).toContain('必須')
  expect(qs[1].textContent).toContain('2. 苦手な表現');expect(qs[1].textContent).toContain('任意')
  expect(host.textContent).toContain('男性役');expect(host.textContent).toContain('性別自由')
  await act(async()=>{submitButton(host)!.click()})
  expect(toastError).toHaveBeenCalledWith(expect.stringContaining('希望キャラクター'))
  expect(action).not.toHaveBeenCalledWith('g','m','survey_write',expect.anything())
 }finally{await act(async()=>root.unmount())}
})
it('押す順に第 1・第 2 希望の印を付け、保存は従来どおり第 1 希望のキャラクター id だけ',async()=>{
 writeRespondsOk()
 const {host,root}=await render({})
 try {
  const cards=()=>[...host.querySelectorAll<HTMLButtonElement>('[data-testid="survey-character"]')]
  await act(async()=>{cards()[1].click()})
  await act(async()=>{cards()[0].click()})
  expect(cards()[1].dataset.rank).toBe('1');expect(cards()[1].textContent).toContain('第 1 希望')
  expect(cards()[0].dataset.rank).toBe('2');expect(cards()[0].textContent).toContain('第 2 希望')
  await act(async()=>{submitButton(host)!.click()})
  expect(action).toHaveBeenCalledWith('g','m','survey_write',{q1:'c2'})
 }finally{await act(async()=>root.unmount())}
})
it('「おまかせ」を選ぶと印を外し、キャラクターの回答は「おまかせ」で保存する',async()=>{
 writeRespondsOk()
 const {host,root}=await render({})
 try {
  await act(async()=>{host.querySelector<HTMLButtonElement>('[data-testid="survey-character"]')!.click()})
  await act(async()=>{host.querySelector<HTMLButtonElement>('[data-testid="survey-character-any"]')!.click()})
  expect(host.querySelector('[data-rank]')).toBeNull()
  await act(async()=>{submitButton(host)!.click()})
  expect(action).toHaveBeenCalledWith('g','m','survey_write',{q1:'おまかせ'})
 }finally{await act(async()=>root.unmount())}
})
it('作品にキャラクターがいないときは、キャラクターの質問を出さず問わない',async()=>{
 action.mockImplementation(async(_g:string,_m:string,kind:string)=>kind==='survey_read'?survey([charQ,textQ],{characters:[]}):{data:'r1',error:null})
 const {host,root}=await render({})
 try {
  expect(host.textContent).not.toContain('やってみたいキャラクター')
  await act(async()=>{submitButton(host)!.click()})
  expect(toastError).not.toHaveBeenCalled();expect(action).toHaveBeenCalledWith('g','m','survey_write',{})
 }finally{await act(async()=>root.unmount())}
})
it('選択肢はチップで選ぶ（もう一度押すと外す）',async()=>{
 action.mockImplementation(async(_g:string,_m:string,kind:string)=>kind==='survey_read'?survey([choiceQ]):{data:'r1',error:null})
 const {host,root}=await render({hideCharacterSelection:true})
 try {
  const chip=()=>[...host.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find(b=>b.textContent?.includes('2〜5 回'))!
  await act(async()=>{chip().click()})
  expect(chip().getAttribute('aria-checked')).toBe('true')
  await act(async()=>{submitButton(host)!.click()})
  expect(action).toHaveBeenCalledWith('g','m','survey_write',{q3:'some'})
 }finally{await act(async()=>root.unmount())}
})
it('質問がキャラクター選択だけで、それを出さない場合は理由を出し、送るボタンを出さない',async()=>{
 action.mockResolvedValue(survey([charQ]))
 const {host,root}=await render({hideCharacterSelection:true})
 try { expect(host.textContent).toContain('いまご回答いただく質問はありません');expect(submitButton(host)).toBeNull() }finally{await act(async()=>root.unmount())}
})
it('出していないキャラクター希望の古い回答は送信しない（#915）・回答済みなら「回答を変更する」',async()=>{
 action.mockImplementation(async(_g:string,_m:string,kind:string)=>kind==='survey_read'
  ?{data:{survey_enabled:true,questions:[charQ,textQ],existing_response_id:'r1',existing_responses:{q1:'c1',q2:'なし'}},error:null}
  :{data:'r1',error:null})
 const {host,root}=await render({hideCharacterSelection:true})
 try {
  expect(submitButton(host)!.textContent).toBe('回答を変更する')
  await act(async()=>{submitButton(host)!.click()})
  expect(action).toHaveBeenCalledWith('g','m','survey_write',{q2:'なし'})
 }finally{await act(async()=>root.unmount())}
})
it('回答期限を過ぎたら送れない',async()=>{
 action.mockResolvedValue(survey([textQ],{survey_deadline_at:'2000-01-01T00:00:00Z'}))
 const {host,root}=await render({hideCharacterSelection:true})
 try {
  expect(submitButton(host)!.disabled).toBe(true);expect(host.textContent).toContain('回答期限を過ぎました')
  expect(host.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(true)
 }finally{await act(async()=>root.unmount())}
})
it('開いた・読み込んだ・枠の大きさ・送信を記録する（回答の中身は送らない）',async()=>{
 vi.useFakeTimers({shouldAdvanceTime:true})
 writeRespondsOk()
 const {host,root}=await render({})
 try {
  await act(async()=>{vi.advanceTimersByTime(600)})
  const events=reportMock.mock.calls.map(c=>c[2])
  expect(events).toEqual(expect.arrayContaining(['open','loaded','layout']))
  const loaded=reportMock.mock.calls.find(c=>c[2]==='loaded')![3]
  expect(loaded).toMatchObject({status:'ready',questions:2,characterQuestions:1,existing:false})
  const layout=reportMock.mock.calls.find(c=>c[2]==='layout')![3]
  expect(layout).toMatchObject({status:'ready'}); expect(layout.inputs).toBeGreaterThan(0)
  await act(async()=>{host.querySelector<HTMLButtonElement>('[data-testid="survey-character"]')!.click()})
  await act(async()=>{submitButton(host)!.click()})
  const submit=reportMock.mock.calls.find(c=>c[2]==='submit')![3]
  expect(JSON.stringify(submit)).not.toContain('c1')
 }finally{await act(async()=>root.unmount());vi.useRealTimers()}
})
it('アンケートが無効でも空にせず理由を出す',async()=>{
 action.mockResolvedValue({data:{survey_enabled:false},error:null})
 const a=await render({})
 try { expect(a.host.textContent).toContain('現在受け付けていません');expect(submitButton(a.host)).toBeNull() }finally{await act(async()=>a.root.unmount())}
 expect(reportMock.mock.calls.filter(c=>c[2]==='loaded').map(c=>c[3].status)).toEqual(['disabled'])
})

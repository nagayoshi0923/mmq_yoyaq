// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
vi.mock('@/lib/supabase',()=>({supabase:{}}))
vi.mock('./DeliveryHistoryDialog',()=>({DeliveryHistoryDialog:()=>null}))
import {BookingRequestCard} from './BookingRequestCard'
it('手動回答中の再取得でも表示日時と保存比較基準を開始時点に保つ',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const host=document.createElement('div'),root=createRoot(host),save=vi.fn().mockResolvedValue(undefined)
 const candidate={order:1,date:'2027-01-01',timeSlot:'夜',startTime:'19:00',endTime:'22:00',status:'pending'}
 const request:any={id:'booking',reservation_number:'test',scenario_title:'test',customer_name:'test',participant_count:1,status:'pending',created_at:'2026-09-29',candidate_datetimes:{candidates:[candidate]},response_candidate_snapshot:[candidate],gm_responses:[]}
 const render=(r:any)=>root.render(<BookingRequestCard request={r} gmList={[{id:'gm',name:'GM'}]} onGMResponseSave={save}/>)
 try {
  await act(async()=>render(request))
  const button=(name:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===name)!
  await act(async()=>button('出欠を記録').click())
  await act(async()=>{const select=host.querySelector('select')!;select.value='gm';select.dispatchEvent(new Event('change',{bubbles:true}));host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click()})
  const changed={...candidate,date:'2027-02-01'}
  await act(async()=>render({...request,candidate_datetimes:{candidates:[changed]},response_candidate_snapshot:[changed]}))
  expect(host.querySelector('label')?.textContent).toContain('2027年1月1日')
  await act(async()=>button('保存').click())
  expect(save).toHaveBeenCalledWith('booking','gm',[0],expect.objectContaining({storedCandidates:[candidate]}))
 } finally {await act(async()=>root.unmount());host.remove()}
})

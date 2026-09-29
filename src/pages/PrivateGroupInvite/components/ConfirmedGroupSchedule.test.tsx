// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it} from 'vitest'
import {ConfirmedGroupSchedule} from './ConfirmedGroupSchedule'
it('申請候補19時ではなく確定公演15時半を表示し、変更後も最新公演を表示する',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const host=document.createElement('div'),root=createRoot(host)
 const group:any={status:'confirmed',candidate_dates:[{date:'2026-11-01',start_time:'19:00',end_time:'23:00'}],confirmed_performance:{date:'2026-11-01',start_time:'15:30:00',end_time:'19:30:00',store_name:'会場'}}
 try {
  await act(async()=>root.render(<ConfirmedGroupSchedule group={group}/>))
  expect(host.textContent).toContain('15:30〜19:30');expect(host.textContent).not.toContain('19:00')
  await act(async()=>root.render(<ConfirmedGroupSchedule group={{...group,confirmed_performance:{...group.confirmed_performance,start_time:'16:00'}}}/>))
  expect(host.textContent).toContain('16:00〜19:30')
  await act(async()=>root.render(<ConfirmedGroupSchedule group={{...group,confirmed_performance:null}}/>))
  expect(host.textContent).toContain('確認できません');expect(host.textContent).not.toContain('19:00')
  await act(async()=>root.render(<ConfirmedGroupSchedule group={{...group,status:'gathering',confirmed_performance:null}}/>))
  expect(host.textContent).toBe('')
  await act(async()=>root.render(<ConfirmedGroupSchedule group={{...group,confirmed_performance:null,confirmed_performance_access:'preview'}}/>))
  expect(host.textContent).toContain('参加後');expect(host.textContent).not.toContain('お問い合わせ')
 }finally{await act(async()=>root.unmount())}
})

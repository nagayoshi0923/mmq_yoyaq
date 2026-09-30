import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { useEventSave } from '../../src/hooks/eventOperations/useEventSave'
import { useEventMoveCopy } from '../../src/hooks/eventOperations/useEventMoveCopy'
import { original,fixtureState } from './notification-acceptance-mocks'
import '../../src/index.css'
function Fixture(){
 const [events,setEvents]=useState([original]),[result,setResult]=useState('未操作'),[mode,setMode]=useState('invoke_error')
 const save=useEventSave({events,setEvents,stores:[{id:'store',name:'試験店舗',short_name:'試験'}],scenarios:[],modalMode:'edit',organizationId:'fixture-org'})
 const move=useEventMoveCopy({events,setEvents,stores:[{id:'store',name:'試験店舗',short_name:'試験'}],scenarios:[],organizationId:'fixture-org',getSlotDefaults:()=>({start_time:'19:00',end_time:'22:00'}),draggedEvent:original,dropTarget:{date:'2027-01-17',venue:'store',timeSlot:'evening'},setDraggedEvent:()=>{},setDropTarget:()=>{}})
 const run=async(kind:string)=>{
  fixtureState.mode=mode
  if(kind==='move'){await move.handleMoveEvent();setResult(fixtureState.saved?'保存済み':'保存失敗')}
  else {
   const ok=await save.handleSavePerformance({...original,date:'2027-01-17',capacity:7,max_participants:7,is_private_request:kind==='reservation',reservation_name:'新表示名'})
   setResult(ok?'保存済み':'保存失敗')
  }
 }
 return <main style={{padding:32,maxWidth:900,margin:'auto'}}>
  <h1>通知失敗時の画面受入（ローカルモック）</h1><p>実際の保存hook・通知helper・toastを使用。保存API/認証/送信はモックです。</p>
  <label>試験応答<select aria-label="試験応答" value={mode} onChange={e=>setMode(e.target.value)}>{['invoke_error','business_false','invoke_throw','read_error','missing_email','accepted','save_error'].map(v=><option key={v}>{v}</option>)}</select></label>
  <p><button onClick={()=>run('event')}>公演更新</button> <button onClick={()=>run('reservation')}>貸切予約更新</button> <button onClick={()=>run('move')}>公演移動</button></p>
  <p role="status" data-testid="save-result">{result}</p><p data-testid="saved-date">現在の公演日：{events[0].date}</p>
  <output data-testid="counts">{JSON.stringify({saved:fixtureState.saved,sent:fixtureState.sent,read:fixtureState.reservationRead})}</output>
  <Toaster richColors />
 </main>
}
createRoot(document.getElementById('root')!).render(<Fixture/>)

import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { BookingConfirmation } from '@/pages/BookingConfirmation'
import { StaffProfile } from '@/pages/StaffProfile'
import { state } from './functional-qa-mocks'
import '@/index.css'
function Fixture(){
 const [key,setKey]=useState(0)
 const [page,setPage]=useState('booking')
 return <><p>実画面＋ローカルAPI/Authモック。実DB/認証/メール未検証。</p><select aria-label="試験モード" onChange={e=>{state.mode=e.target.value;state.writes=0;state.sends=0;setKey(k=>k+1)}}>{['accepted','email-false','email-error','email-throw','email-skip','sold-out','seat-race','server-race','read-error','offline','signed-out','load-error','forbidden'].map(m=><option key={m}>{m}</option>)}</select><button onClick={()=>{setPage('staff');setKey(k=>k+1)}}>担当作品画面</button><button onClick={()=>{(document.getElementById('counts') as HTMLElement).textContent=JSON.stringify(state)}}>試験結果を取得</button><output id="counts"/>
 <QueryClientProvider key={key} client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BrowserRouter>{page==='booking'?<BookingConfirmation eventId="qa-event" scenarioTitle="QA作品" scenarioId="qa-scenario" storeId="qa-store" eventDate="2098-10-01" startTime="10:00" endTime="13:00" storeName="QA店舗" maxParticipants={8} currentParticipants={0} participationFee={4500} initialParticipantCount={2} onBack={()=>{}}/>:<StaffProfile/>}</BrowserRouter></QueryClientProvider><Toaster richColors/></>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )

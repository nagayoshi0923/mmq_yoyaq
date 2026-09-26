import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BookingCouponSelector } from '../../src/pages/BookingConfirmation/components/BookingCouponSelector'
import { useBookingCoupon } from '../../src/pages/BookingConfirmation/hooks/useBookingCoupon'
import { OperatingScalarSettings } from '../../src/components/settings/OperatingScalarSettings'
import { apiClient } from '../../src/lib/apiClient'
import '../../src/index.css'
let duration: number | null = 240
apiClient.get = async url => {
  if (url.includes('operating-settings')) return {layers:{organization:{default_performance_duration:210},store:{default_performance_duration:duration}},revisions:{store:1},can_edit:true} as never
  return [{id:'valid',coupon_campaigns:{name:'25%クーポン'}},{id:'invalid',coupon_campaigns:{name:'対象外クーポン'}}] as never
}
apiClient.patch = async (_url,body:any) => {duration=body.settings.default_performance_duration;return {} as never}
apiClient.post = async (_url,body:any) => {
  await new Promise(resolve=>setTimeout(resolve,300))
  if(body.customer_coupon_id==='invalid') throw new Error('対象シナリオではありません')
  const amount=4000*body.participant_count
  return {success:true,total_price:amount,discount_amount:amount/4,final_price:amount*3/4} as never
}
function App(){
 const[count,setCount]=useState(1)
 const[event,setEvent]=useState('first')
 const state=useBookingCoupon('fixture-user',event,count)
 return <main className="p-6 space-y-6 max-w-2xl">
  <h1>予約設定の検証</h1><label>人数<input aria-label="人数" type="number" value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
  <BookingCouponSelector state={state} disabled={false}/><button disabled={!state.couponReady}>予約確定</button><button onClick={()=>setEvent('second')}>公演を切替</button>
  <OperatingScalarSettings scope="store" targetId="fixture" title="公演時間" keys={['default_performance_duration']}/>
 </main>
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><App/></QueryClientProvider>)

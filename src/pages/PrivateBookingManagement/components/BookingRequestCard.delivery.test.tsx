import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe,expect,it,vi } from 'vitest'
import { BookingRequestCard } from './BookingRequestCard'
import type { RejectionDeliveryStatus } from '../hooks/useRejectionDeliveryStatus'
vi.mock('@/lib/supabase',()=>({supabase:{}}))
const request={id:'r',reservation_number:'R-1',scenario_title:'作品',customer_name:'幹事',participant_count:4,status:'cancelled',created_at:'2026-09-27T00:00:00Z'}
function render(status:RejectionDeliveryStatus['status'],retry=false,error=false,req:typeof request&{cancellation_reason?:string}=request){
 return renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><BookingRequestCard request={req} rejectionDelivery={{reservation_id:'r',status,can_retry:retry,attempt_count:1,last_error:null,updated_at:'2026-09-27T00:00:00Z'}} rejectionDeliveryError={error} onRetryRejectionDelivery={()=>{}} /></QueryClientProvider>)
}
describe('却下メール状態表示',()=>{
 it('待機と受付済みを区別し、到達を保証しない',()=>{
  expect(render('pending')).toContain('メール送信待ち');expect(render('sending')).toContain('メール送信処理中')
  expect(render('sent')).toContain('メール送信受付済み');expect(render('sent')).not.toContain('到達済み')
 })
 it('未送信の失敗だけ再試行ボタンを表示する',()=>{
  expect(render('failed',true)).toContain('登録済み連絡先でメールを再試行')
  expect(render('uncertain')).not.toContain('登録済み連絡先でメールを再試行');expect(render('uncertain')).toContain('重複再送しないでください')
 })
 it('取得失敗は古い送信済み表示と再試行ボタンを隠す',()=>{
  const html=render('sent',true,true);expect(html).toContain('送信状況を取得できません');expect(html).not.toContain('メール送信受付済み');expect(html).not.toContain('登録済み連絡先でメールを再試行')
 })
 it('お客様の申込取り下げは「お客様が取り下げ」と出し、却下メールの状況・再試行を出さない',()=>{
  const withdrawn={...request,cancellation_reason:'お客様による貸切申込の取り下げ'}
  for(const html of [render('failed',true,false,withdrawn),render('sent',false,true,withdrawn)]){
   expect(html).toContain('お客様が取り下げ');expect(html).toContain('取り下げ: お客様');expect(html).not.toContain('却下')
   expect(html).not.toContain('メール');expect(html).not.toContain('登録済み連絡先でメールを再試行')
  }
 })
})

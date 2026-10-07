import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, errorResponse, getServiceRoleKey, isCronOrServiceRoleCall } from '../_shared/security.ts'
serve(async req => {
 const headers = getCorsHeaders(req.headers.get('origin'))
 if (req.method === 'OPTIONS') return new Response('ok', { headers })
 if (!isCronOrServiceRoleCall(req)) return errorResponse('Unauthorized',401,headers)
 const key=getServiceRoleKey(), url=Deno.env.get('SUPABASE_URL') ?? ''
 const client=createClient(url,key)
 const {count: legacyPendingCount,error: legacyError}=await client.from('waitlist_notification_queue').select('id',{count:'exact',head:true}).in('status',['pending','processing'])
 if(legacyError) return errorResponse('旧通知キューの切替状態を確認できません',503,headers)
 const {data, error}=await client.rpc('list_pending_waitlist_notice_events',{p_limit:10})
 if(error) return errorResponse('通知キュー取得失敗',503,headers)
 const events=[...new Map((data??[]).map(row=>[row.schedule_event_id,row])).values()]
 const results=await Promise.all(events.map(async event=>{
  try { const r=await fetch(`${url}/functions/v1/notify-waitlist`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({organizationId:event.organization_id,scheduleEventId:event.schedule_event_id})});return r.ok } catch {return false}
 }))
 return new Response(JSON.stringify({success:results.every(Boolean)&&!legacyPendingCount,legacyPendingCount:legacyPendingCount??0,legacyReviewRequired:!!legacyPendingCount,processedCount:events.length,failedCount:results.filter(x=>!x).length}),{status:results.every(Boolean)&&!legacyPendingCount?200:503,headers:{...headers,'Content-Type':'application/json'}})
})

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, errorResponse, getServiceRoleKey, isCronOrServiceRoleCall } from '../_shared/security.ts'
serve(async req => {
 const headers = getCorsHeaders(req.headers.get('origin'))
 if (req.method === 'OPTIONS') return new Response('ok', { headers })
 if (!isCronOrServiceRoleCall(req)) return errorResponse('Unauthorized',401,headers)
 const key=getServiceRoleKey(), url=Deno.env.get('SUPABASE_URL') ?? ''
 const client=createClient(url,key)
 const {data, error}=await client.from('waitlist_notice_events').select('schedule_event_id,organization_id').is('completed_at',null).eq('requires_review',false).order('last_attempt_at',{nullsFirst:true}).order('created_at').limit(10)
 if(error) return errorResponse('通知キュー取得失敗',503,headers)
 const events=[...new Map((data??[]).map(row=>[row.schedule_event_id,row])).values()]
 const results=await Promise.all(events.map(async event=>{
  try { const r=await fetch(`${url}/functions/v1/notify-waitlist`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({organizationId:event.organization_id,scheduleEventId:event.schedule_event_id})});return r.ok } catch {return false}
 }))
 return new Response(JSON.stringify({success:results.every(Boolean),processedCount:events.length,failedCount:results.filter(x=>!x).length}),{status:results.every(Boolean)?200:503,headers:{...headers,'Content-Type':'application/json'}})
})

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, getServiceRoleKey, isCronOrServiceRoleCall, timingSafeEqualString, errorResponse } from '../_shared/security.ts'
import { deliverPrivateApprovals } from '../_shared/private-approval-delivery.ts'
import { approvalDeliveryTransport } from '../_shared/private-approval-transport.ts'
import { approvalDeliveryStore } from '../_shared/private-approval-delivery-store.ts'

serve(async req => {
  const headers=getCorsHeaders(req.headers.get('origin'))
  if(req.method==='OPTIONS') return new Response('ok',{headers})
  if(req.method!=='POST') return errorResponse('POSTが必要です',405,headers)
  const deliverySecret = (Deno.env.get('APPROVAL_DELIVERY_CRON_SECRET') || '').trim()
  const suppliedSecret = (req.headers.get('x-cron-secret') || '').trim()
  const dedicatedCron = Boolean(deliverySecret && suppliedSecret && timingSafeEqualString(deliverySecret, suppliedSecret))
  if(!dedicatedCron && !isCronOrServiceRoleCall(req)) return errorResponse('サーバーからの実行が必要です',401,headers)
  const db=createClient(Deno.env.get('SUPABASE_URL')??'',getServiceRoleKey())
  try {
    const body=await req.json().catch(()=>({}))
    if(body?.dryRun === true) {
      const {data,error}=await db.from('private_booking_approval_deliveries').select('id').eq('status','pending').limit(1)
      if(error) throw error
      return new Response(JSON.stringify({success:true,dryRun:true,hasPending:(data?.length??0)>0}),{headers:{...headers,'Content-Type':'application/json'}})
    }
    const result=await deliverPrivateApprovals(approvalDeliveryStore(db),approvalDeliveryTransport(db,name=>Deno.env.get(name),getServiceRoleKey()))
    return new Response(JSON.stringify({success:true,...result}),{headers:{...headers,'Content-Type':'application/json'}})
  } catch {
    console.error('private_approval_delivery_worker_failed')
    return errorResponse('送信記録の処理を完了できませんでした',503,headers)
  }
})

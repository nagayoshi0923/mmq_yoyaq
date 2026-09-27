import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizePrivateApprovalNotification } from '../_shared/private-approval-authorization.ts'
import { loadLegacyApprovalNotification, LegacyApprovalError } from '../_shared/private-approval-legacy.ts'
import { getServiceRoleKey, getCorsHeaders, errorResponse } from '../_shared/security.ts'

// 旧クライアントも一意な配送記録を作成する。外部送信は共通workerだけが行う。
serve(async req=>{
 const headers=getCorsHeaders(req.headers.get('origin'))
 if(req.method==='OPTIONS') return new Response('ok',{headers})
 if(req.method!=='POST') return errorResponse('POSTが必要です',405,headers)
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',getServiceRoleKey())
 try {
  const input=await req.json()
  const auth=await authorizePrivateApprovalNotification(req,db,input?.organizationId)
  const correction=auth.service&&Boolean(input?.emailSubject||input?.templateOverride)
  if(correction&&(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId||'')
   ||(input.emailSubject!=null&&(typeof input.emailSubject!=='string'||input.emailSubject.length>500))
   ||(input.templateOverride!=null&&(typeof input.templateOverride!=='string'||input.templateOverride.length>20000)))) {
   return errorResponse('訂正要求IDと文面を確認してください。同じ訂正の再操作には同じrequestIdを使用してください',400,headers)
  }
  const loaded=await loadLegacyApprovalNotification(db,input.organizationId,input.reservationId,undefined,{allowQueued:true})
  if(loaded.queued) throw new Error('unexpected_queue_shortcut')
  const snapshot={...loaded.snapshot}
  if(correction){snapshot.emailSubject=input.emailSubject;snapshot.templateOverride=input.templateOverride}
  const result=await db.rpc('enqueue_legacy_private_approval_delivery',{
   p_organization_id:input.organizationId,p_reservation_id:input.reservationId,p_kind:'confirmation_email',
   p_snapshot:snapshot,p_correction_id:correction?input.requestId:null,
  })
  if(result.error||!result.data) throw result.error||new Error('delivery_not_saved')
  const ids=[result.data]
  return new Response(JSON.stringify({success:true,queued:true,deliveryIds:ids,message:'通知はサーバーで配送します'}),{headers:{...headers,'Content-Type':'application/json'}})
 } catch(error) {
  if(error instanceof LegacyApprovalError) return errorResponse(error.message,error.status,headers)
  console.error('private_approval_compatibility_enqueue_failed')
  return errorResponse('通知の登録を完了できませんでした。通知履歴をご確認ください',503,headers)
 }
})

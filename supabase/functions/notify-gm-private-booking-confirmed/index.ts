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
  await authorizePrivateApprovalNotification(req,db,input?.organizationId)
  if(!input.gmId) return errorResponse('担当GMを指定してください',400,headers)
  const loaded=await loadLegacyApprovalNotification(db,input.organizationId,input.reservationId,input.gmId,{allowQueued:true})
  if(loaded.queued) throw new Error('unexpected_queue_shortcut')
  const ids:string[]=[]
  for(const kind of ['gm_email','gm_discord']) {
   const result=await db.rpc('enqueue_legacy_private_approval_delivery',{
    p_organization_id:input.organizationId,p_reservation_id:input.reservationId,p_kind:kind,p_snapshot:loaded.snapshot,p_correction_id:null,
   })
   if(result.error||!result.data) throw result.error||new Error('delivery_not_saved')
   ids.push(result.data)
  }
  return new Response(JSON.stringify({success:true,queued:true,deliveryIds:ids,message:'通知はサーバーで配送します'}),{headers:{...headers,'Content-Type':'application/json'}})
 } catch(error) {
  if(error instanceof LegacyApprovalError) return errorResponse(error.message,error.status,headers)
  console.error('private_approval_compatibility_enqueue_failed')
  return errorResponse('通知の登録を完了できませんでした。通知履歴をご確認ください',503,headers)
 }
})

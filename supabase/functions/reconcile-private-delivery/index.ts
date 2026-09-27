import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAuth,getServiceRoleKey,getCorsHeaders,errorResponse } from '../_shared/security.ts'
import { authorizePrivateApprovalNotification } from '../_shared/private-approval-authorization.ts'
import { LegacyApprovalError } from '../_shared/private-approval-legacy.ts'
import { verifyPrivateDeliveryReceipt,ReceiptVerificationError,type DeliveryReceiptRow } from '../_shared/private-delivery-receipt.ts'
serve(async req=>{
 const headers=getCorsHeaders(req.headers.get('origin'))
 if(req.method==='OPTIONS') return new Response('ok',{headers})
 if(req.method!=='POST') return errorResponse('POSTが必要です',405,headers)
 try {
  const auth=await verifyAuth(req)
  if(!auth.success) return errorResponse('認証が必要です',401,headers)
  const input=await req.json()
  const tables:Record<string,string>={approval:'private_booking_approval_deliveries',survey:'private_group_survey_deliveries',rejection:'private_booking_rejection_deliveries'}
  const table=tables[input?.kind]
  if(!table||typeof input?.providerId!=='string'||input.providerId.length>100||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input?.deliveryId||'')) return errorResponse('配送と受付IDを指定してください',400,headers)
  const db=createClient(Deno.env.get('SUPABASE_URL')||'',getServiceRoleKey())
  await authorizePrivateApprovalNotification(req,db,input.organizationId)
  const {data:row,error}=await db.from(table).select('id,organization_id,status,updated_at,first_attempt_at,provider_payload,provider_account_hash,provider_message_id'+(input.kind==='approval'?',kind,provider_target':'')).eq('id',input.deliveryId).eq('organization_id',input.organizationId).maybeSingle<DeliveryReceiptRow & {organization_id:string;status:string;updated_at:string}>()
  if(error) throw error
  if(!row||!['uncertain','failed','superseded','sent'].includes(row.status)) return errorResponse('照合対象の通知状態が変わりました。再読み込みしてください',409,headers)
  const settings=await db.from('organization_settings').select('resend_api_key,discord_bot_token').eq('organization_id',input.organizationId).maybeSingle()
  if(settings.error) throw settings.error
  const key=row.kind==='gm_discord'?settings.data?.discord_bot_token||Deno.env.get('DISCORD_BOT_TOKEN'):settings.data?.resend_api_key||Deno.env.get('RESEND_API_KEY')
  if(!key) return errorResponse('プロバイダー設定を確認してください',409,headers)
  const proof=await verifyPrivateDeliveryReceipt(row,input.providerId,key)
  const saved=await db.rpc('reconcile_private_delivery_receipt',{
   p_kind:input.kind,p_delivery_id:row.id,p_organization_id:row.organization_id,p_actor_id:auth.user!.id,
   p_expected_updated_at:row.updated_at,p_provider_id:proof.providerId,p_sent_at:proof.sentAt,
  })
  if(saved.error||saved.data!==true) return errorResponse('照合中に状態が変わったか、履歴を保存できませんでした。再読み込みしてください',409,headers)
  return new Response(JSON.stringify({success:true}),{headers:{...headers,'Content-Type':'application/json'}})
 } catch(error) {
  if(error instanceof ReceiptVerificationError) return errorResponse(error.message,409,headers)
  if(error instanceof LegacyApprovalError) return errorResponse(error.message,error.status,headers)
  console.error('private_delivery_reconciliation_failed')
  return errorResponse('通知の照合を完了できませんでした。送信状態は変更していません',503,headers)
 }
})

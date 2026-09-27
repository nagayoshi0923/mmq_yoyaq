import type { ApprovalDeliveryStore } from './private-approval-delivery.ts'
const TABLE='private_booking_approval_deliveries'
const COLUMNS='id,request_id,organization_id,reservation_id,schedule_event_id,kind,recipient_key,snapshot,status,attempt_count,next_attempt_at,first_attempt_at,preparation_attempted_at,provider_payload,provider_target,provider_account_hash,provider_message_id,email_log_id'
export function approvalDeliveryStore(db: any): ApprovalDeliveryStore {
 return {
  async recoverExpired(now) {
   const {error}=await db.from(TABLE).update({status:'pending',lease_token:null,lease_until:null,updated_at:now})
    .eq('status','sending').lt('lease_until',now)
   if(error) throw error
  },
  async due(now) {
   const {data,error}=await db.from(TABLE).select(COLUMNS).eq('status','pending').lte('next_attempt_at',now).order('next_attempt_at').limit(12)
   if(error) throw error; return data||[]
  },
  async claim(row,token,now,until) {
   const {data,error}=await db.from(TABLE).update({status:'sending',lease_token:token,lease_until:until,updated_at:now})
    .eq('id',row.id).eq('organization_id',row.organization_id).eq('status','pending')
    .eq('attempt_count',row.attempt_count).eq('next_attempt_at',row.next_attempt_at).select(COLUMNS).maybeSingle()
   if(error) throw error; return data
  },
  async save(row,token,patch) {
   const {data,error}=await db.from(TABLE).update({...patch,updated_at:new Date().toISOString()})
    .eq('id',row.id).eq('organization_id',row.organization_id).eq('status','sending').eq('lease_token',token).select('id').maybeSingle()
   if(error) throw error; if(!data) throw new Error('delivery_lease_lost')
  },
  async isCurrent(row) {
   const {data,error}=await db.rpc('is_private_approval_delivery_current',{p_delivery_id:row.id})
   if(error) throw error; return data===true
  },
  async ensureLog(row,payload) {
   if(row.kind==='gm_discord') return
   const expected={organization_id:row.organization_id,reservation_id:row.reservation_id,
    to_email:row.kind==='confirmation_email'?row.snapshot.customerEmail:row.snapshot.gmEmail,
    subject:payload.subject,body_html:payload.html,body_text:payload.text,
    email_type:row.kind==='confirmation_email'?'reservation_confirmed':'gm_notification'}
   const {data,error}=await db.from('email_logs').select(Object.keys(expected).join(',')).eq('id',row.email_log_id??row.id).maybeSingle()
   if(error) throw error
   if(data) {
    for(const [k,v] of Object.entries(expected)) if(data[k]!==v) throw new Error('delivery_log_conflict')
   } else {
    const inserted=await db.from('email_logs').insert({id:row.email_log_id??row.id,...expected,schedule_event_id:row.schedule_event_id,
     to_name:row.kind==='confirmation_email'?row.snapshot.customerName:row.snapshot.gmName,provider:'resend',status:'queued'})
    if(inserted.error) throw inserted.error
   }
  },
  async complete(row,token,providerId,now) {
   const {data,error}=await db.rpc('complete_private_approval_delivery',{
    p_delivery_id:row.id,p_lease_token:token,p_provider_id:providerId,p_sent_at:now,
   })
   if(error) throw error; if(data!==true) throw new Error('delivery_completion_failed')
  },
 }
}

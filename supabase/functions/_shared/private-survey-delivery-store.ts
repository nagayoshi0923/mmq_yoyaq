import type { SurveyDelivery, SurveyDeliveryStore } from './private-survey-delivery.ts'
const TABLE = 'private_group_survey_deliveries'
const COLUMNS = 'id,organization_id,reservation_id,group_id,schedule_event_id,customer_email,customer_name,subject,message_body,status,attempt_count,first_attempt_at,provider_payload,provider_account_hash,provider_message_id,email_log_id,lease_token,next_attempt_at'
// service_role専用。組織IDはキュー行由来で固定し、クライアント入力の本文/宛先は受け取らない。
export function surveyDeliveryStore(db: any): SurveyDeliveryStore {
  return {
    async recoverExpired(now) {
      const {error}=await db.from(TABLE).update({status:'pending',lease_token:null,lease_until:null,last_error:'delivery_lease_expired',updated_at:now})
        .eq('status','sending').lt('lease_until',now)
      if(error) throw error
    },
    async due(now,id) {
      let q=db.from(TABLE).select(COLUMNS).eq('status','pending').lte('next_attempt_at',now).order('next_attempt_at',{ascending:true}).limit(20)
      if(id) q=q.eq('id',id)
      const {data,error}=await q;if(error) throw error;return data||[]
    },
    async claim(row,token,now,lease) {
      const {data,error}=await db.from(TABLE).update({status:'sending',lease_token:token,lease_until:lease,updated_at:now})
        .eq('id',row.id).eq('organization_id',row.organization_id).eq('status','pending')
        .eq('attempt_count',row.attempt_count).eq('next_attempt_at',row.next_attempt_at).lte('next_attempt_at',now).select(COLUMNS).maybeSingle()
      if(error) throw error;return data
    },
    async save(row,token,values) {
      const {data,error}=await db.from(TABLE).update({...values,updated_at:new Date().toISOString()})
        .eq('id',row.id).eq('organization_id',row.organization_id).eq('status','sending').eq('lease_token',token).select('id').maybeSingle()
      if(error) throw error;if(!data) throw new Error('delivery_lease_lost')
    },
    async isCurrent(row) {
      const reservation=await db.from('reservations').select('id')
        .eq('id',row.reservation_id).eq('organization_id',row.organization_id)
        .eq('private_group_id',row.group_id).eq('schedule_event_id',row.schedule_event_id)
        .in('status',['confirmed','gm_confirmed','checked_in','completed']).maybeSingle()
      if(reservation.error) throw reservation.error;if(!reservation.data) return false
      const group=await db.from('private_groups').select('id').eq('id',row.group_id)
        .eq('organization_id',row.organization_id).eq('reservation_id',row.reservation_id).eq('status','confirmed').maybeSingle()
      if(group.error) throw group.error;if(!group.data) return false
      const event=await db.from('schedule_events').select('id').eq('id',row.schedule_event_id)
        .eq('organization_id',row.organization_id).eq('is_cancelled',false).maybeSingle()
      if(event.error) throw event.error;return !!event.data
    },
    async ensureLog(row,payload) {
      const {data,error}=await db.from('email_logs').select('organization_id,reservation_id,to_email,subject,body_html,body_text')
        .eq('id',row.email_log_id ?? row.id).maybeSingle()
      if(error) throw error
      const expected={organization_id:row.organization_id,reservation_id:row.reservation_id,to_email:row.customer_email,
        subject:payload.subject,body_html:payload.html,body_text:payload.text}
      if(data) {
        for(const [key,value] of Object.entries(expected)) if(data[key]!==value) throw new Error('delivery_log_conflict')
        return
      }
      const inserted=await db.from('email_logs').insert({id:row.email_log_id ?? row.id,...expected,to_name:row.customer_name,email_type:'other',provider:'resend',status:'queued'})
      if(inserted.error) throw inserted.error
    },
    async complete(row,token,providerId,now) {
      const {data,error}=await db.rpc('complete_private_survey_delivery',{
        p_delivery_id:row.id,p_lease_token:token,p_provider_id:providerId,p_sent_at:now,
      })
      if(error) throw error;if(data!==true) throw new Error('delivery_completion_failed')
    },
  }
}

import { ApprovalDeliveryError, type ApprovalDelivery, type ApprovalDeliveryTransport } from './private-approval-delivery.ts'
import { buildPrivateConfirmationPayload, type PrivateBookingConfirmationRequest } from './private-confirmation-payload.ts'
import { buildPrivateGmEmailPayload, buildPrivateGmDiscordPayload, type GMNotificationRequest } from './private-gm-payload.ts'
import { loadEffectiveEmailSettings } from './effective-email-settings.ts'
import { isSenshinScenario } from './senshin-discord.ts'

export function approvalDeliveryTransport(db: any, env: (name: string) => string | undefined, serviceKey: string, send: typeof fetch = fetch): ApprovalDeliveryTransport {
 const url=(env('SUPABASE_URL')||'').replace(/\/$/,'')
 return {
  async credentials(row) {
   const result=await db.from('organization_settings')
    .select('resend_api_key,reply_to_email,discord_bot_token,discord_private_booking_channel_id,notification_settings')
    .eq('organization_id',row.organization_id).maybeSingle()
   if(result.error) throw result.error
   const flags=await db.from('global_settings').select('enable_email_notifications,enable_discord_notifications').eq('organization_id',row.organization_id).maybeSingle()
   if(flags.error) throw flags.error
   const config={...result.data,...flags.data}
   // GM への Discord 連絡は、他の Discord 通知（貸切リクエスト・シフト）と同じく貸切設定の
   // 「貸切の Discord 通知」（notification_settings.private_booking_discord）だけで判定する。
   // 組織全体の enable_discord_notifications は既定値 false のまま他の経路で参照されておらず、
   // これを見ると確定連絡だけが見送られる（#644、2026-09-28〜）。
   config.disabledReason=row.kind==='gm_discord'
    ? (config.notification_settings?.private_booking_discord===false?'discord_notifications_disabled':null)
    : (config.enable_email_notifications===false||config.notification_settings?.private_booking_email===false?'email_notifications_disabled':null)
   return {key:row.kind==='gm_discord' ? config.discord_bot_token||env('DISCORD_BOT_TOKEN')||'' : config.resend_api_key||env('RESEND_API_KEY')||'',config}
  },
  async prepare(row,config,checkpoint) {
   const data={...row.snapshot}
   if(row.kind==='gm_discord') {
    if(config.notification_settings?.private_booking_discord===false) return {skip:'discord_notifications_disabled'}
    const token=config.discord_bot_token||env('DISCORD_BOT_TOKEN')||''
    const targets:string[]=[]
    let invalidTarget=false
    const normalize=(value:unknown)=>typeof value==='string'?value.trim():''
    const addTarget=(value:unknown)=>{
     const id=normalize(value)
     if(/^\d+$/.test(id)) targets.push(id)
     else if(value) invalidTarget=true
    }
    addTarget(data.gmDiscordChannelId)
    let dmUnavailable=false
    const userId=normalize(data.gmDiscordUserId)
    if(data.gmDiscordUserId&&!/^\d+$/.test(userId)) invalidTarget=true
    if(/^\d+$/.test(userId) && token) {
     try {
      const response=await send('https://discord.com/api/v10/users/@me/channels',{
       method:'POST',headers:{Authorization:`Bot ${token}`,'Content-Type':'application/json'},
       body:JSON.stringify({recipient_id:userId}),signal:AbortSignal.timeout(10_000),
      })
      if(response.ok) {const dm=await response.json();if(typeof dm?.id==='string'&&/^\d+$/.test(dm.id.trim())) addTarget(dm.id);else dmUnavailable=true}
      else dmUnavailable=true
     } catch {dmUnavailable=true} // DMの作成はメッセージ送信ではない。個人/共通チャンネルを妨げない。
    }
    const fallback=config.discord_private_booking_channel_id||env('DISCORD_PRIVATE_BOOKING_CHANNEL_ID')
    addTarget(fallback)
    if(!targets.length&&dmUnavailable) throw new ApprovalDeliveryError('discord_dm_unavailable',true)
    if(!targets.length&&invalidTarget) throw new ApprovalDeliveryError('discord_target_invalid')
    if(!targets.length) return {skip:'gm_discord_not_configured'}
    // Discordのnonceは「数分」のみ有効。応答不明後の自動再送には依存しない。
    // https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx
    const nonce=row.id.replace(/-/g,'').slice(0,25)
    return {payload:{...buildPrivateGmDiscordPayload(data as GMNotificationRequest),nonce,enforce_nonce:true},target:JSON.stringify([...new Set(targets)])}
   }
   if(config.enable_email_notifications===false || config.notification_settings?.private_booking_email===false) return {skip:'email_notifications_disabled'}
   const recipient=row.kind==='confirmation_email'?data.customerEmail:data.gmEmail
   if(!recipient && row.kind==='gm_email') return {skip:'gm_email_not_configured'}
   if(typeof recipient!=='string'||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) throw new ApprovalDeliveryError('recipient_missing_or_invalid')
   if(!(config.resend_api_key||env('RESEND_API_KEY'))) throw new ApprovalDeliveryError('sender_not_configured')
   const senderEmail=env('SENDER_EMAIL')||'noreply@mmq.game',senderName=env('SENDER_NAME')||'MMQ予約システム'
   let payload:Record<string,unknown>
   if(row.kind==='confirmation_email') {
    if(isSenshinScenario(data.scenarioMasterId,data.scenarioTitle)) {
     const existing=await db.from('private_booking_discord_rooms').select('schedule_event_id,player_invite_url,spectator_invite_url')
      .eq('reservation_id',row.reservation_id).eq('organization_id',row.organization_id).maybeSingle()
     if(existing.error) throw existing.error
     if(existing.data) {
      if(existing.data.schedule_event_id!==row.schedule_event_id) throw new ApprovalDeliveryError('discord_room_event_changed')
      data.discordPlayerUrl=existing.data.player_invite_url;data.discordSpectatorUrl=existing.data.spectator_invite_url
     } else {
      // チャンネル作成も外部副作用。中断後は作成済み記録を確認し、不明なら自動再作成しない。
      if(row.preparation_attempted_at) throw new ApprovalDeliveryError('discord_setup_unconfirmed',false,'unknown')
      await checkpoint({preparation_attempted_at:new Date().toISOString()})
      try {
       const response=await send(`${url}/functions/v1/provision-private-booking-discord`,{
        method:'POST',headers:{Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({organizationId:row.organization_id,reservationId:row.reservation_id,scheduleEventId:row.schedule_event_id}),signal:AbortSignal.timeout(30_000),
       })
       const provision=await response.json()
       if(!response.ok||!provision.success||!provision.playerInviteUrl||!provision.spectatorInviteUrl) throw Error('provision unconfirmed')
       data.discordPlayerUrl=provision.playerInviteUrl;data.discordSpectatorUrl=provision.spectatorInviteUrl
      } catch {throw new ApprovalDeliveryError('discord_setup_unconfirmed',false,'unknown')}
     }
     if(!data.discordPlayerUrl||!data.discordSpectatorUrl) throw new ApprovalDeliveryError('discord_invite_missing')
    }
    const storeEmailSettings=await loadEffectiveEmailSettings(db,{organizationId:row.organization_id,reservationId:row.reservation_id})
    payload=buildPrivateConfirmationPayload(data as PrivateBookingConfirmationRequest,{
     senderEmail,senderName,replyToEmail:config.reply_to_email||env('REPLY_TO_EMAIL'),supabaseUrl:url,storeEmailSettings,
    })
   } else payload=buildPrivateGmEmailPayload(data as GMNotificationRequest,`${senderName} <${senderEmail}>`)
   return {payload:{...payload,tags:[{name:'mmq_delivery',value:row.id}]},target:recipient}
  },
  async send(row,payload,target,key) {
   if(row.kind==='gm_discord') {
    const targets=JSON.parse(target) as string[]
    for(const channel of targets) {
     const response=await send(`https://discord.com/api/v10/channels/${channel}/messages`,{
      method:'POST',headers:{Authorization:`Bot ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10_000),
     })
     if([403,404].includes(response.status)) continue // 明示拒否の場合だけ別の配送先へ進む。
     const body=await response.json().catch(()=>null)
     if(!response.ok) throw new ApprovalDeliveryError(`discord_http_${response.status}`,response.status===429,response.status>=500?'unknown':'not_sent')
     if(!body?.id) throw new ApprovalDeliveryError('discord_receipt_missing',false,'unknown')
     return `${channel}/${body.id}`
    }
    throw new ApprovalDeliveryError('discord_all_targets_rejected')
   }
   // https://resend.com/changelog/idempotency-keys (24時間)
   const response=await send('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`private-approval/${row.id}`},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(15_000),
   })
   const body=await response.json().catch(()=>null)
   if(!response.ok) throw new ApprovalDeliveryError(`email_http_${response.status}`,
    response.status===429||response.status>=500||(response.status===409&&body?.name==='concurrent_idempotent_requests'),
    response.status>=500||response.status===409?'unknown':'not_sent')
   if(!body?.id) throw new ApprovalDeliveryError('email_receipt_missing',true,'unknown')
   return body.id
  },
 }
}

// 旧クライアントの通知要求も、宛先・日時・料金は同じ組織の保存済み事実から取得する。
// 新しい配送記録がある承認は、この入口から二重送信しない。
export class LegacyApprovalError extends Error {
 constructor(message:string,readonly status=409){super(message)}
}
export async function loadLegacyApprovalNotification(db:any,organizationId:string,reservationId:string,gmId?:string, options: {allowQueued?:boolean} = {}) {
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
 if(!uuid.test(reservationId||'')||(gmId!==undefined&&!uuid.test(gmId))) throw new LegacyApprovalError('予約またはGMの指定が不正です',400)
 const result=await db.from('reservations').select('id,organization_id,status,schedule_event_id,store_id,scenario_master_id,scenario_title,customer_id,customer_email,customer_name,participant_count,final_price,total_price,reservation_number,customer_notes')
  .eq('id',reservationId).eq('organization_id',organizationId).maybeSingle()
 if(result.error) throw result.error
 const r=result.data
 if(!r) throw new LegacyApprovalError('予約が見つかりません',404)
 if(!['confirmed','gm_confirmed'].includes(r.status)||!r.schedule_event_id) throw new LegacyApprovalError('確定済みの貸切予約ではありません')
 const eventResult=await db.from('schedule_events').select('id,date,start_time,end_time,store_id,scenario,scenario_master_id,gms,is_cancelled,is_private_booking,category')
  .eq('id',r.schedule_event_id).eq('organization_id',organizationId).maybeSingle()
 if(eventResult.error) throw eventResult.error
 const e=eventResult.data
 if(!e||e.is_cancelled||(!e.is_private_booking&&e.category!=='private')) throw new LegacyApprovalError('現在の貸切公演を確認できません')
 const queue=await db.from('private_booking_approval_deliveries').select('kind,status,recipient_key')
  .eq('reservation_id',r.id).eq('organization_id',organizationId).eq('schedule_event_id',e.id)
 if(queue.error) throw queue.error
 if(queue.data?.some((d:any)=>gmId?(d.kind.startsWith('gm_')&&d.recipient_key===gmId):d.kind==='confirmation_email')&&!options.allowQueued) return {queued:true as const}
 const store=await db.from('stores').select('name,address').eq('id',e.store_id).eq('organization_id',organizationId).maybeSingle()
 if(store.error) throw store.error
 if(!store.data) throw new LegacyApprovalError('店舗を確認できません')
 let email=r.customer_email,name=r.customer_name
 if(!email&&r.customer_id){
  const customer=await db.from('customers').select('organization_id,email,name').eq('id',r.customer_id).maybeSingle()
  if(customer.error) throw customer.error
  if(customer.data&&(customer.data.organization_id===null||customer.data.organization_id===organizationId)) {email=customer.data.email;name ||= customer.data.name}
 }
 const snapshot:Record<string,any>={organizationId,reservationId:r.id,scheduleEventId:e.id,storeId:e.store_id,
  scenarioMasterId:e.scenario_master_id||r.scenario_master_id,scenarioTitle:e.scenario||r.scenario_title,
  eventDate:e.date,startTime:e.start_time,endTime:e.end_time,storeName:store.data.name,storeAddress:store.data.address,
  customerEmail:email,customerName:name||'お客様',participantCount:r.participant_count,totalPrice:r.final_price??r.total_price??0,
  reservationNumber:r.reservation_number,notes:r.customer_notes,eventGms:e.gms}
 if(gmId){
  const gm=await db.from('staff').select('id,name,email,discord_channel_id,discord_user_id').eq('id',gmId).eq('organization_id',organizationId).eq('status','active').maybeSingle()
  if(gm.error) throw gm.error
  if(!gm.data||!e.gms?.includes(gm.data.name)) throw new LegacyApprovalError('担当GMを確認できません',403)
  Object.assign(snapshot,{gmId:gm.data.id,gmName:gm.data.name,gmEmail:gm.data.email,gmDiscordChannelId:gm.data.discord_channel_id,gmDiscordUserId:gm.data.discord_user_id})
 }
 const rooms=await db.from('private_booking_discord_rooms').select('player_invite_url,spectator_invite_url').eq('reservation_id',r.id).eq('organization_id',organizationId).eq('schedule_event_id',e.id).maybeSingle()
 if(rooms.error) throw rooms.error
 if(rooms.data) Object.assign(snapshot,{discordPlayerUrl:rooms.data.player_invite_url,discordSpectatorUrl:rooms.data.spectator_invite_url})
 return {queued:false as const,snapshot}
}

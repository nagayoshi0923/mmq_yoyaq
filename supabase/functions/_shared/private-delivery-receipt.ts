// 外部への送信は行わない。保存済み配送内容とプロバイダーの受付記録を照合する。
export interface DeliveryReceiptRow {
 id:string;kind?:string;first_attempt_at:string|null;provider_payload:Record<string,any>|null
 provider_target?:string|null;provider_account_hash:string|null;provider_message_id:string|null
}
export class ReceiptVerificationError extends Error {}
export async function verifyPrivateDeliveryReceipt(row:DeliveryReceiptRow,providerId:string,key:string,read:typeof fetch=fetch,now=Date.now) {
 const fail=(message:string):never=>{throw new ReceiptVerificationError(message)}
 if(!row.provider_payload||!row.first_attempt_at||!row.provider_account_hash) fail('送信時の記録が不足しているため自動照合できません')
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),v=>v.toString(16).padStart(2,'0')).join('')
 if(hash!==row.provider_account_hash) fail('送信時とプロバイダー設定が異なります')
 const payload=row.provider_payload!
 let sentAt:string
 if(row.kind==='gm_discord') {
  if(!/^\d+\/\d+$/.test(providerId)) fail('DiscordのチャンネルID/メッセージIDを指定してください')
  const [channel,id]=providerId.split('/')
  let targets:string[]=[];try{targets=JSON.parse(row.provider_target||'[]')}catch{fail('送信先の記録が不正です')}
  if(!targets.includes(channel)) fail('送信先チャンネルが一致しません')
  const headers={Authorization:`Bot ${key}`}
  const [self,response]=await Promise.all([
   read('https://discord.com/api/v10/users/@me',{headers,signal:AbortSignal.timeout(10_000)}),
   read(`https://discord.com/api/v10/channels/${channel}/messages/${id}`,{headers,signal:AbortSignal.timeout(10_000)}),
  ])
  if(!self.ok||!response.ok) fail('Discordの送信記録を取得できません。未送信とは判定しません')
  const author=await self.json(),message=await response.json()
  if(message.id!==id||message.channel_id!==channel||message.author?.id!==author.id||String(message.nonce)!==String(payload.nonce)
   ||(message.content||'')!==(payload.content||'')) fail('Discordの配送記録と一致しません')
  sentAt=message.timestamp
 } else {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId)) fail('メールのプロバイダー受付IDを指定してください')
  const response=await read(`https://api.resend.com/emails/${providerId}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10_000)})
  if(!response.ok) fail('メールの送信記録を取得できません。未送信とは判定しません')
  const receipt=await response.json()
  const tagged=Array.isArray(receipt.tags)&&receipt.tags.some((tag:any)=>tag.name==='mmq_delivery'&&tag.value===row.id)
  if(!tagged&&row.provider_message_id!==providerId) fail('この配送を特定する記録がありません。別の通知と区別できないため自動確定しません')
  if(receipt.id!==providerId||JSON.stringify(receipt.to)!==JSON.stringify(payload.to)||receipt.from!==payload.from
   ||receipt.subject!==payload.subject||receipt.html!==payload.html||receipt.text!==payload.text
   ||receipt.cc?.length||receipt.bcc?.length||receipt.scheduled_at) fail('メールの宛先または本文が一致しません')
  sentAt=String(receipt.created_at||'').replace(' ','T').replace(/([+-]\d\d)$/,'$1:00')
 }
 const date=Date.parse(sentAt!),first=Date.parse(row.first_attempt_at!)
 if(!Number.isFinite(date)||date<first-120_000||date>now()+60_000) fail('受付日時が送信記録と一致しません')
 return {providerId,sentAt:new Date(date).toISOString()}
}

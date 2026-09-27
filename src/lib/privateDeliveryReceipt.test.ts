import { describe, expect, it, vi } from 'vitest'
import { verifyPrivateDeliveryReceipt, type DeliveryReceiptRow } from '../../supabase/functions/_shared/private-delivery-receipt'
const id='00000000-0000-4000-8000-000000000001',receiptId='00000000-0000-4000-8000-000000000002'
const now=Date.parse('2026-09-27T12:00:00Z'),key='fixture-key'
async function fixture(){
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),v=>v.toString(16).padStart(2,'0')).join('')
 const payload={from:'MMQ <from@example.invalid>',to:['to@example.invalid'],subject:'確定',html:'<p>固定内容</p>',text:'固定内容'}
 const row:DeliveryReceiptRow={id,kind:'confirmation_email',first_attempt_at:new Date(now-60_000).toISOString(),provider_payload:payload,provider_account_hash:hash,provider_message_id:null}
 const response={id:receiptId,...payload,created_at:'2026-09-27 11:59:30.123456+00',tags:[{name:'mmq_delivery',value:id}],cc:[],bcc:[],scheduled_at:null}
 return {row,response,read:vi.fn(async(_url:RequestInfo|URL)=>new Response(JSON.stringify(response),{status:200}))}
}
describe('配送結果の照合',()=>{
 it('番号・宛先・本文・日時が一致した外部受付だけを認め、GET以外はしない',async()=>{
  const f=await fixture();const result=await verifyPrivateDeliveryReceipt(f.row,receiptId,key,f.read,()=>now)
  expect(result.providerId).toBe(receiptId);expect(result.sentAt).toBe('2026-09-27T11:59:30.123Z')
  expect(f.read).toHaveBeenCalledTimes(1);expect(f.read.mock.calls[0]?.[0]).toBe(`https://api.resend.com/emails/${receiptId}`)
 })
 it.each(['to','from','subject','html','text','id','tags','created_at'])('%sの不一致は送信済みにしない',async(field)=>{
  const f=await fixture();Object.assign(f.response,{[field]:field==='tags'?[]:field==='to'?['other@example.invalid']:'wrong'})
  await expect(verifyPrivateDeliveryReceipt(f.row,receiptId,key,f.read,()=>now)).rejects.toThrow()
 })
 it('404や権限不足を未送信とみなさない',async()=>{
  const f=await fixture();f.read.mockResolvedValue(new Response('{}',{status:404}))
  await expect(verifyPrivateDeliveryReceipt(f.row,receiptId,key,f.read,()=>now)).rejects.toThrow('未送信とは判定しません')
 })
 it('受付IDのURL注入・別アカウント・送信記録なしは外部読取前に拒否する',async()=>{
  const f=await fixture()
  await expect(verifyPrivateDeliveryReceipt(f.row,'../../other',key,f.read,()=>now)).rejects.toThrow()
  await expect(verifyPrivateDeliveryReceipt(f.row,receiptId,'other-key',f.read,()=>now)).rejects.toThrow()
  await expect(verifyPrivateDeliveryReceipt({...f.row,first_attempt_at:null},receiptId,key,f.read,()=>now)).rejects.toThrow()
  expect(f.read).not.toHaveBeenCalled()
 })
 it('旧通知で配送タグがない場合、既に保存された同じ受付ID以外は推測しない',async()=>{
  const f=await fixture();f.response.tags=[]
  await expect(verifyPrivateDeliveryReceipt(f.row,receiptId,key,f.read,()=>now)).rejects.toThrow('この配送を特定する記録がありません')
  f.row.provider_message_id=receiptId
  await expect(verifyPrivateDeliveryReceipt(f.row,receiptId,key,f.read,()=>now)).resolves.toMatchObject({providerId:receiptId})
 })
 it('Discordは自分のbot・チャンネル・nonce・日時を照合する',async()=>{
  const f=await fixture();Object.assign(f.row,{kind:'gm_discord',provider_target:'["123"]',provider_payload:{nonce:'fixture-nonce',content:'<@789>'}})
  const message={id:'456',channel_id:'123',author:{id:'bot'},nonce:'fixture-nonce',content:'<@789>',timestamp:new Date(now-30_000).toISOString()}
  const read=vi.fn(async(url:any)=>new Response(JSON.stringify(String(url).endsWith('@me')?{id:'bot'}:message),{status:200}))
  await expect(verifyPrivateDeliveryReceipt(f.row,'123/456',key,read,()=>now)).resolves.toMatchObject({providerId:'123/456'})
  message.author.id='other';await expect(verifyPrivateDeliveryReceipt(f.row,'123/456',key,read,()=>now)).rejects.toThrow()
  message.author.id='bot';message.nonce='other';await expect(verifyPrivateDeliveryReceipt(f.row,'123/456',key,read,()=>now)).rejects.toThrow()
 })
})

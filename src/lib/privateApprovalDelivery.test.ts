import { describe, expect, it, vi } from 'vitest'
import { deliverPrivateApprovals, ApprovalDeliveryError, type ApprovalDelivery, type ApprovalDeliveryStore, type ApprovalDeliveryTransport } from '../../supabase/functions/_shared/private-approval-delivery'
import { buildPrivateConfirmationPayload } from '../../supabase/functions/_shared/private-confirmation-payload'
import { buildPrivateGmEmailPayload, buildPrivateGmDiscordPayload } from '../../supabase/functions/_shared/private-gm-payload'
const NOW=Date.parse('2026-09-27T00:00:00Z')
function fixture(kind: ApprovalDelivery['kind']='confirmation_email') {
 const row: ApprovalDelivery={id:crypto.randomUUID(),request_id:'request',organization_id:'org',reservation_id:'reservation',schedule_event_id:'event',
  kind,recipient_key:'customer',snapshot:{},status:'pending',attempt_count:0,next_attempt_at:new Date(NOW).toISOString(),first_attempt_at:null,
  provider_payload:null,provider_target:null,provider_account_hash:null,provider_message_id:null}
 let token=''
 const store: ApprovalDeliveryStore={
  recoverExpired:vi.fn(async()=>{}),due:vi.fn(async()=>row.status==='pending'?[structuredClone(row)]:[]),
  claim:vi.fn(async(candidate,t)=>{if(row.status!=='pending'||row.attempt_count!==candidate.attempt_count)return null;token=t;row.status='sending';return structuredClone(row)}),
  save:vi.fn(async(_,t,patch)=>{if(t!==token||row.status!=='sending')throw Error('lease lost');Object.assign(row,patch)}),
  isCurrent:vi.fn(async()=>true),ensureLog:vi.fn(async()=>{}),
  complete:vi.fn(async(_,t,id)=>{if(t!==token)throw Error('lease lost');row.status='sent';row.provider_message_id=id}),
 }
 const transport: ApprovalDeliveryTransport={
  credentials:vi.fn(async()=>({key:'test-key',config:{}})),prepare:vi.fn(async()=>({payload:{subject:'snapshot',text:'text'},target:'target'})),
  send:vi.fn(async()=> 'provider-id'),
 }
 return {row,store,transport,run:()=>deliverPrivateApprovals(store,transport,()=>NOW)}
}
describe('貸切承認の配送',()=>{
 it('同時ワーカーでもclaim済みの通知を重複送信しない',async()=>{
  const f=fixture();await Promise.all([f.run(),f.run()]);expect(f.transport.send).toHaveBeenCalledTimes(1);expect(f.row.status).toBe('sent')
 })
 it('メールは応答不明でも同一payloadと宛先を再利用する',async()=>{
  const f=fixture();vi.mocked(f.transport.send).mockRejectedValueOnce(new Error('timeout'))
  await f.run();expect(f.row.status).toBe('pending');await f.run()
  expect(f.transport.prepare).toHaveBeenCalledTimes(1);expect(f.transport.send).toHaveBeenCalledTimes(2)
  expect(vi.mocked(f.transport.send).mock.calls[0].slice(1)).toEqual(vi.mocked(f.transport.send).mock.calls[1].slice(1));expect(f.row.status).toBe('sent')
 })
 it('Discordの応答不明は再送せずuncertainにする',async()=>{
  const f=fixture('gm_discord');vi.mocked(f.transport.send).mockRejectedValueOnce(new Error('timeout'))
  await f.run();await f.run();expect(f.row.status).toBe('uncertain');expect(f.transport.send).toHaveBeenCalledTimes(1)
 })
 it('期限切れや中断済みDiscordは外部呼出し前に停止する',async()=>{
  for(const kind of ['confirmation_email','gm_discord'] as const){
   const f=fixture(kind);f.row.first_attempt_at=new Date(NOW-24*3600_000).toISOString()
   await f.run();expect(f.row.status).toBe('uncertain');expect(f.transport.send).not.toHaveBeenCalled()
  }
 })
 it('既知の未送信429だけはDiscordを再試行できる',async()=>{
  const f=fixture('gm_discord');vi.mocked(f.transport.send).mockRejectedValueOnce(new ApprovalDeliveryError('provider_http_429',true,'not_sent'))
  await f.run();expect(f.row.first_attempt_at).toBeNull();expect(f.row.status).toBe('pending')
  await f.run();expect(f.row.status).toBe('sent');expect(f.transport.send).toHaveBeenCalledTimes(2)
 })
 it('受付後の保存失敗では受付IDを使って記録だけ確定する',async()=>{
  const f=fixture('gm_discord');vi.mocked(f.store.complete).mockRejectedValueOnce(Error('database timeout'))
  await f.run();expect(f.row.provider_message_id).toBe('provider-id');expect(f.row.status).toBe('pending')
  await f.run();expect(f.transport.send).toHaveBeenCalledTimes(1);expect(f.row.status).toBe('sent')
 })
 it('履歴保存に失敗したら送信しない',async()=>{
  const f=fixture();vi.mocked(f.store.ensureLog).mockRejectedValueOnce(Error('database unavailable'))
  await f.run();expect(f.transport.send).not.toHaveBeenCalled();expect(f.row.first_attempt_at).toBeNull();expect(f.row.status).toBe('pending')
 })
 it.each(['confirmation_email','gm_email','gm_discord'] as const)('%s: 本文と宛先の保存失敗では送信せず再試行できる',async(kind)=>{
  const f=fixture(kind)
  vi.mocked(f.store.save).mockRejectedValueOnce(Error('payload persistence failed'))
  await f.run()
  expect(f.transport.send).not.toHaveBeenCalled()
  expect(f.store.ensureLog).not.toHaveBeenCalled()
  expect(f.row.provider_payload).toBeNull();expect(f.row.provider_target).toBeNull()
  expect(f.row.first_attempt_at).toBeNull();expect(f.row.status).toBe('pending')
  await f.run()
  expect(f.transport.send).toHaveBeenCalledTimes(1);expect(f.row.status).toBe('sent')
 })
 it.each(['confirmation_email','gm_email','gm_discord'] as const)('%s: 送信直前の試行日時保存失敗では送信せず配送方式に応じて再開する',async(kind)=>{
  const f=fixture(kind),save=vi.mocked(f.store.save).getMockImplementation()!
  vi.mocked(f.store.save).mockImplementationOnce(save).mockRejectedValueOnce(Error('attempt persistence failed'))
  await f.run()
  expect(f.transport.send).not.toHaveBeenCalled()
  expect(f.row.provider_payload).toEqual({subject:'snapshot',text:'text'})
  expect(f.row.provider_target).toBe('target');expect(f.row.status).toBe('pending')
  await f.run()
  expect(f.transport.prepare).toHaveBeenCalledTimes(1)
  if(kind==='gm_discord'){
   // 現行仕様は保存失敗時も試行日時を残し、重複防止のため自動再送を停止する。
   expect(f.transport.send).not.toHaveBeenCalled();expect(f.row.status).toBe('uncertain')
  }else{
   expect(f.transport.send).toHaveBeenCalledTimes(1);expect(f.row.status).toBe('sent')
  }
 })
 it('取消や再承認を本文準備の前後で検査する',async()=>{
  for(const before of [true,false]){
   const f=fixture();vi.mocked(f.store.isCurrent).mockResolvedValueOnce(before).mockResolvedValueOnce(false)
   await f.run();expect(f.row.status).toBe('superseded');expect(f.transport.send).not.toHaveBeenCalled()
  }
 })
 it('送信先未設定は明示したskip理由を残す',async()=>{
  const f=fixture('gm_email');vi.mocked(f.transport.credentials).mockResolvedValue({key:'',config:{}})
  vi.mocked(f.transport.prepare).mockResolvedValue({skip:'gm_email_not_configured'})
  await f.run();expect(f.row.status).toBe('skipped');expect(f.transport.send).not.toHaveBeenCalled()
 })
 it('アカウント変更時は旧payloadを別アカウントで送らない',async()=>{
  const f=fixture();vi.mocked(f.transport.send).mockRejectedValueOnce(Error('timeout'));await f.run()
  vi.mocked(f.transport.credentials).mockResolvedValue({key:'different-key',config:{}});await f.run()
  expect(f.row.status).toBe('uncertain');expect(f.transport.send).toHaveBeenCalledTimes(1)
 })
})
const booking={reservationId:'reservation',organizationId:'org',customerEmail:'fixture@example.invalid',customerName:'<顧客>',scenarioTitle:'<作品>',eventDate:'2027-01-16',startTime:'19:30:00',endTime:'23:00:00',storeName:'店舗',participantCount:6,totalPrice:0,reservationNumber:'fixture'}
const options={senderEmail:'noreply@example.invalid',senderName:'MMQ',supabaseUrl:'https://example.invalid',storeEmailSettings:null}
describe('承認通知の本文',()=>{
 it('既定メールのHTMLをescapeし、ゼロ円とJST日付を保持する',()=>{
  const payload=buildPrivateConfirmationPayload(booking,options)
  expect(payload.html).toContain('&lt;顧客&gt;');expect(payload.html).not.toContain('<顧客>')
  expect(payload.text).toContain('2027年1月16日(土)');expect(payload.text).toContain('¥0')
 })
 it('継承テンプレートの変数とプレーンテキストを維持する',()=>{
  const payload=buildPrivateConfirmationPayload(booking,{...options,storeEmailSettings:{private_confirm_template:'{customer_name}\n{scenario_title}\n{total_price}'}})
  expect(payload.text).toBe('<顧客>\n<作品>\n0');expect(payload.html).toContain('&lt;作品&gt;')
 })
 it('GMメールとDiscordは同じ日時を示し、広範なmentionを許可しない',()=>{
  const data={...booking,gmId:'gm',gmName:'<GM>',gmEmail:'gm@example.invalid',gmDiscordUserId:'123456789'}
  const email=buildPrivateGmEmailPayload(data,'MMQ <noreply@example.invalid>'),discord=buildPrivateGmDiscordPayload(data)
  expect(email.html).toContain('&lt;GM&gt;');expect(email.text).toContain('1/16(土) 19:30〜23:00')
  expect(discord.allowed_mentions).toEqual({parse:[],users:['123456789']})
 })
})

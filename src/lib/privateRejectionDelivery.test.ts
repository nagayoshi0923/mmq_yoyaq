import { describe,expect,it,vi } from 'vitest'
import { deliverPrivateRejections, type RejectionDelivery, type RejectionDeliveryStore } from '../../supabase/functions/_shared/private-rejection-delivery'
const start = Date.parse('2026-09-27T00:00:00Z')
function fixture(overrides: Partial<RejectionDelivery> = {}) {
  const row: RejectionDelivery = {id:'delivery1',organization_id:'org1',reservation_id:'reservation1',cancelled_at:new Date(start).toISOString(),customer_email:'saved@example.test',customer_name:'保存名',scenario_title:'作品',message_body:'<a>本文</a>\n次の行',status:'pending',attempt_count:0,first_attempt_at:null,provider_payload:null,provider_account_hash:null,next_attempt_at:new Date(start).toISOString(),...overrides}
  let current=true, clock=start
  const ensureLog=vi.fn(async()=>{})
  const complete=vi.fn(async(r: RejectionDelivery,t: string,p: string,_now: string)=>store.save(r,t,{status:'sent',provider_message_id:p,lease_token:null,lease_until:null}))
  const store: RejectionDeliveryStore = {
    recoverExpired:async()=>{}, due:async(now)=>row.status==='pending' && row.next_attempt_at<=now ? [structuredClone(row)] : [],
    claim:async(candidate,token)=>{
      if(row.status!=='pending' || row.attempt_count!==candidate.attempt_count) return null
      row.status='sending';row.lease_token=token;return structuredClone(row)
    },
    save:async(_,token,values)=>{if(row.status!=='sending'||row.lease_token!==token) throw new Error('lease_lost');Object.assign(row,values)},
    isCurrent:async()=>current,ensureLog,complete,
  }
  const settings=vi.fn(async()=>({apiKey:'test-key',from:'MMQ <sender@example.test>'}))
  const send=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>new Response(JSON.stringify({id:'mail1'}),{status:200}))
  const run=()=>deliverPrivateRejections(store,settings,{send,now:()=>clock})
  return {row,store,settings,send,run,ensureLog,complete,obsolete:()=>{current=false},advance:()=>{clock+=60*60_000}}
}
describe('貸切却下メールの永続配送',()=>{
 it('保存本文・宛先を送信し、受付IDを記録する',async()=>{
  const f=fixture();expect(await f.run()).toEqual({sent:1,retrying:0,stopped:0})
  const init=f.send.mock.calls[0][1] as RequestInit
  expect(JSON.parse(init.body as string)).toMatchObject({to:['saved@example.test'],text:'<a>本文</a>\n次の行'})
  expect(JSON.parse(init.body as string).html).toContain('&lt;a&gt;')
  expect((init.headers as Record<string,string>)['Idempotency-Key']).toBe('private-rejection/delivery1')
  expect(f.row.status).toBe('sent');expect(f.row.provider_message_id).toBe('mail1');expect(f.complete).toHaveBeenCalledOnce()
 })
 it('二重起動は1件だけ配送する',async()=>{
  const f=fixture();await Promise.all([f.run(),f.run()]);expect(f.send).toHaveBeenCalledTimes(1)
 })
 it('履歴保存不能は送信しない',async()=>{
  const f=fixture();f.ensureLog.mockRejectedValueOnce(new Error('log unavailable'));expect((await f.run()).retrying).toBe(1)
  expect(f.send).not.toHaveBeenCalled();expect(f.row.first_attempt_at).toBeNull();expect(f.row.status).toBe('pending')
 })
 it('通信切断後は同じキーと本文で再送し、設定変更で本文を変えない',async()=>{
  const f=fixture();f.send.mockRejectedValueOnce(new Error('network'));expect((await f.run()).retrying).toBe(1)
  const first=f.send.mock.calls[0][1] as RequestInit
  f.advance();f.settings.mockResolvedValue({apiKey:'test-key',from:'Changed <new@example.test>'});await f.run()
  const second=f.send.mock.calls[1][1] as RequestInit
  expect(second.body).toBe(first.body);expect(second.headers).toEqual(first.headers);expect(f.row.status).toBe('sent')
 })
 it('受付結果の保存失敗でも同じキーで再確認する',async()=>{
  const f=fixture();const save=f.store.save;let fail=true
  f.store.save=async(r,t,v)=>{if(v.status==='sent'&&fail){fail=false;throw new Error('db down')}return save(r,t,v)}
  await f.run();expect(f.row.status).toBe('pending');f.advance();await f.run();expect(f.row.status).toBe('sent')
  expect((f.send.mock.calls[0][1] as RequestInit).body).toBe((f.send.mock.calls[1][1] as RequestInit).body)
 })
 it('受付結果と履歴の確定失敗は同じキーで再確認できる',async()=>{
  const f=fixture();f.complete.mockRejectedValueOnce(new Error('log unavailable'));await f.run()
  expect(f.row.status).toBe('pending');f.advance();await f.run();expect(f.row.status).toBe('sent')
  expect((f.send.mock.calls[0][1] as RequestInit).headers).toEqual((f.send.mock.calls[1][1] as RequestInit).headers)
 })
 it('履歴保存中に再承認された場合も外部送信前に止める',async()=>{
  const f=fixture();f.ensureLog.mockImplementation(async()=>f.obsolete());await f.run();expect(f.row.status).toBe('superseded');expect(f.send).not.toHaveBeenCalled()
 })
 it('期限超過・再承認・宛先不備を送信しない',async()=>{
  const expired=fixture({first_attempt_at:new Date(start-24*60*60_000).toISOString()});await expired.run();expect(expired.row.status).toBe('uncertain');expect(expired.send).not.toHaveBeenCalled()
  const obsolete=fixture();obsolete.obsolete();await obsolete.run();expect(obsolete.row.status).toBe('superseded');expect(obsolete.send).not.toHaveBeenCalled()
  const missing=fixture({customer_email:null});await missing.run();expect(missing.row.status).toBe('failed');expect(missing.send).not.toHaveBeenCalled()
 })
 it('送信アカウント変更と曖昧な再送上限は要確認へ止める',async()=>{
  const changed=fixture({provider_account_hash:'other',first_attempt_at:new Date(start).toISOString()});await changed.run();expect(changed.row.status).toBe('uncertain');expect(changed.send).not.toHaveBeenCalled()
  const exhausted=fixture({attempt_count:4});exhausted.send.mockRejectedValue(new Error('network'));await exhausted.run();expect(exhausted.row.status).toBe('uncertain')
 })
 it('503/429/並行409は再送待ち、受付IDのない200は未確認',async()=>{
  for(const [status,body] of [[503,{}],[429,{}],[409,{name:'concurrent_idempotent_requests'}],[200,{}]] as const){
   const f=fixture();f.send.mockResolvedValue(new Response(JSON.stringify(body),{status}));await f.run();expect(f.row.status).toBe('pending');expect(f.row.provider_message_id).toBeUndefined()
  }
 })
})

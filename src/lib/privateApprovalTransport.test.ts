import { loadPrivateDiscordProvisionContext } from '../../supabase/functions/_shared/private-discord-provision-context'
import { describe,expect,it,vi } from 'vitest'
import { approvalDeliveryTransport } from '../../supabase/functions/_shared/private-approval-transport'
import { loadLegacyApprovalNotification } from '../../supabase/functions/_shared/private-approval-legacy'
import { buildPrivateConfirmationPayload } from '../../supabase/functions/_shared/private-confirmation-payload'
vi.mock('../../supabase/functions/_shared/effective-email-settings.ts',()=>({loadEffectiveEmailSettings:vi.fn(async()=>({private_confirm_template:'{customer_name} {total_price} {discord_player_url}'}))}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const dbFor=(tables:Record<string,any[]>,errorTable?:string)=>({from:vi.fn((table:string)=>{
 let rows=tables[table]||[];const query:any={select:()=>query,eq:(key:string,value:any)=>{rows=rows.filter(r=>r[key]===value);return query},maybeSingle:async()=>({data:rows[0]||null,error:table===errorTable?Error('database unavailable'):null}),then:(resolve:any)=>Promise.resolve({data:rows,error:table===errorTable?Error('database unavailable'):null}).then(resolve)};return query
})})
const row=(kind='gm_email'):any=>({id:id(1),organization_id:id(2),reservation_id:id(3),schedule_event_id:id(4),kind,snapshot:{organizationId:id(2),reservationId:id(3),customerEmail:'customer@example.invalid',customerName:'幹事',scenarioTitle:'作品',scenarioMasterId:id(9),eventDate:'2027-01-16',startTime:'19:30:00',endTime:'23:00:00',storeName:'店舗',participantCount:6,totalPrice:0,reservationNumber:'fixture',gmId:id(5),gmName:'GM',gmEmail:'gm@example.invalid',gmDiscordChannelId:'123',gmDiscordUserId:'456'}})
const env=(key:string)=>({RESEND_API_KEY:'email-key',DISCORD_BOT_TOKEN:'discord-key',SUPABASE_URL:'https://example.invalid'}[key])
describe('承認通知の外部送信',()=>{
 it('組織設定の取得失敗は環境キーで隠さない',async()=>{
  const api=approvalDeliveryTransport(dbFor({},'organization_settings'),env,'service',vi.fn())
  await expect(api.credentials(row())).rejects.toThrow('database unavailable')
 })
 it('GMのDiscord連絡は貸切設定だけで判定し、組織全体のDiscord設定(既定false)では見送らない(#644)',async()=>{
  const settings={organization_settings:[{organization_id:id(2),notification_settings:{private_booking_discord:true,private_booking_email:true}}],global_settings:[{organization_id:id(2),enable_email_notifications:true,enable_discord_notifications:false}]}
  const api=approvalDeliveryTransport(dbFor(settings),env,'service',vi.fn(async()=>new Response('{}',{status:503})))
  const discord=await api.credentials(row('gm_discord'));expect(discord.config.disabledReason).toBeNull();expect(discord.key).toBe('discord-key')
  expect(await api.prepare(row('gm_discord'),{enable_discord_notifications:false},vi.fn())).toMatchObject({target:'["123"]'})
  expect(await api.prepare(row('gm_discord'),{notification_settings:{private_booking_discord:false}},vi.fn())).toEqual({skip:'discord_notifications_disabled'})
  const offApi=approvalDeliveryTransport(dbFor({...settings,organization_settings:[{organization_id:id(2),notification_settings:{private_booking_discord:false}}]}),env,'service',vi.fn())
  expect((await offApi.credentials(row('gm_discord'))).config.disabledReason).toBe('discord_notifications_disabled')
  const emailOff=approvalDeliveryTransport(dbFor({...settings,global_settings:[{organization_id:id(2),enable_email_notifications:false,enable_discord_notifications:false}]}),env,'service',vi.fn())
  expect((await emailOff.credentials(row('gm_email'))).config.disabledReason).toBe('email_notifications_disabled')
 })
 it('DM取得失敗が個人チャンネルの配送を妨げない',async()=>{
  const send=vi.fn(async()=>new Response('{}',{status:503}));const api=approvalDeliveryTransport(dbFor({}),env,'service',send)
  const result=await api.prepare(row('gm_discord'),{},vi.fn())
  expect(result).toMatchObject({target:'["123"]'});expect(send).toHaveBeenCalledTimes(1)
 })
 it('Discordは明示的な403だけ別チャンネルへ進める',async()=>{
  const send=vi.fn().mockResolvedValueOnce(new Response('{}',{status:403})).mockResolvedValueOnce(new Response('{"id":"message"}',{status:200}))
  const api=approvalDeliveryTransport(dbFor({}),env,'service',send)
  expect(await api.send(row('gm_discord'),{},'["123","456"]','discord-key')).toBe('456/message');expect(send).toHaveBeenCalledTimes(2)
 })
 it.each([429,500])('Discord HTTP%sは別チャンネルへ重複投稿しない',async(status)=>{
  const send=vi.fn(async()=>new Response('{}',{status}));const api=approvalDeliveryTransport(dbFor({}),env,'service',send)
  await expect(api.send(row('gm_discord'),{},'["123","456"]','discord-key')).rejects.toMatchObject({outcome:status===500?'unknown':'not_sent'})
  expect(send).toHaveBeenCalledTimes(1)
 })
 it('不正な予備先を除外して有効な個人チャンネルを保持する',async()=>{
  const r=row('gm_discord');r.snapshot.gmDiscordChannelId=' 123 ';r.snapshot.gmDiscordUserId=null
  const api=approvalDeliveryTransport(dbFor({}),env,'service',vi.fn())
  expect(await api.prepare(r,{discord_private_booking_channel_id:'invalid'},vi.fn())).toMatchObject({target:'["123"]'})
  expect(await api.prepare(r,{discord_private_booking_channel_id:' 789 '},vi.fn())).toMatchObject({target:'["123","789"]'})
 })
 it('不正な個人先だけなら設定エラーとして保存できる',async()=>{
  const r=row('gm_discord');r.snapshot.gmDiscordChannelId='invalid';r.snapshot.gmDiscordUserId=null
  await expect(approvalDeliveryTransport(dbFor({}),env,'service',vi.fn()).prepare(r,{},vi.fn())).rejects.toMatchObject({code:'discord_target_invalid'})
 })
 it('メールには同じ配送IDの冪等キーを付ける',async()=>{
  const send=vi.fn(async()=>new Response('{"id":"email"}',{status:200}));const api=approvalDeliveryTransport(dbFor({}),env,'service',send)
  await api.send(row(),{text:'固定'},'gm@example.invalid','email-key')
  expect(send).toHaveBeenCalledWith('https://api.resend.com/emails',expect.objectContaining({headers:expect.objectContaining({'Idempotency-Key':`private-approval/${id(1)}`}),body:'{"text":"固定"}'}))
 })
 it('チャンネル準備の中断後に自動で再作成しない',async()=>{
  const send=vi.fn(),api=approvalDeliveryTransport(dbFor({}),env,'service',send),r=row('confirmation_email')
  r.snapshot.scenarioTitle='戦塵のレガストリア';r.preparation_attempted_at='2026-09-27T00:00:00Z'
  await expect(api.prepare(r,{},vi.fn())).rejects.toMatchObject({code:'discord_setup_unconfirmed',outcome:'unknown'});expect(send).not.toHaveBeenCalled()
 })
 it('作成済みの有効な招待は再利用してメールの本文を準備する',async()=>{
  const r=row('confirmation_email');r.snapshot.scenarioTitle='戦塵のレガストリア'
  const db=dbFor({private_booking_discord_rooms:[{reservation_id:r.reservation_id,organization_id:r.organization_id,schedule_event_id:r.schedule_event_id,player_invite_url:'https://discord.gg/old-player',spectator_invite_url:'https://discord.gg/old-spectator'}]})
  const send=vi.fn(),result=await approvalDeliveryTransport(db,env,'service',send).prepare(r,{},vi.fn())
  expect(result).toMatchObject({target:'customer@example.invalid',payload:{tags:[{name:'mmq_delivery',value:r.id}]}})
  expect(send).not.toHaveBeenCalled()
 })
 it('確定メールに貸切グループへの入室案内を必ず添える(#355)',async()=>{
  const r=row('confirmation_email')
  const db=dbFor({reservations:[{id:r.reservation_id,organization_id:r.organization_id,private_group_id:id(7)}],private_groups:[{id:id(7),organization_id:r.organization_id,invite_code:'abc123'}]})
  const result:any=await approvalDeliveryTransport(db,env,'service',vi.fn()).prepare(r,{},vi.fn())
  expect(result.payload.text).toContain('グループのご案内')
  expect(result.payload.text).toContain('https://mmq.game/group/invite/abc123')
  expect(result.payload.text).toContain('クーポンを利用できません')
  expect(result.payload.text).toContain('事前配役アンケートのご案内')
  const other=dbFor({reservations:[{id:r.reservation_id,organization_id:r.organization_id,private_group_id:id(7)}],private_groups:[{id:id(7),organization_id:id(8),invite_code:'other-org'}]})
  const otherResult:any=await approvalDeliveryTransport(other,env,'service',vi.fn()).prepare(r,{},vi.fn())
  expect(otherResult.payload.text).not.toContain('グループのご案内')
  const none:any=await approvalDeliveryTransport(dbFor({}),env,'service',vi.fn()).prepare(r,{},vi.fn())
  expect(none.payload.text).not.toContain('グループのご案内')
 })
 it('既定の確定文面にもグループの案内を入れる(#355)',()=>{
  const payload:any=buildPrivateConfirmationPayload({...row('confirmation_email').snapshot,groupUrl:'https://mmq.game/group/invite/abc123'},{senderEmail:'s@example.invalid',senderName:'店',supabaseUrl:'https://example.invalid',storeEmailSettings:null})
  expect(payload.text).toContain('https://mmq.game/group/invite/abc123')
  expect(payload.html).toContain('href="https://mmq.game/group/invite/abc123"')
  const placed:any=buildPrivateConfirmationPayload({...row('confirmation_email').snapshot,groupUrl:'https://mmq.game/group/invite/abc123'},{senderEmail:'s@example.invalid',senderName:'店',supabaseUrl:'https://example.invalid',storeEmailSettings:{private_confirm_template:'入室はこちら {group_url}'}})
  expect(placed.text).toBe('入室はこちら https://mmq.game/group/invite/abc123')
 })
 it('既存招待が別の公演世代なら推測して案内しない',async()=>{
  const r=row('confirmation_email');r.snapshot.scenarioTitle='戦塵のレガストリア'
  const db=dbFor({private_booking_discord_rooms:[{reservation_id:r.reservation_id,organization_id:r.organization_id,schedule_event_id:id(99)}]})
  const send=vi.fn();await expect(approvalDeliveryTransport(db,env,'service',send).prepare(r,{},vi.fn())).rejects.toMatchObject({code:'discord_room_event_changed'});expect(send).not.toHaveBeenCalled()
 })
})
describe('旧通知入口の保存値照合',()=>{
 const tables=()=>({reservations:[{id:id(3),organization_id:id(2),status:'confirmed',schedule_event_id:id(4),customer_name:'保存名',customer_email:'saved@example.invalid',final_price:0,total_price:12000}],schedule_events:[{id:id(4),organization_id:id(2),store_id:id(6),is_cancelled:false,is_private_booking:true,scenario:'保存作品',date:'2027-01-16',gms:['保存GM']}],stores:[{id:id(6),organization_id:id(2),name:'保存店舗'}],staff:[{id:id(5),organization_id:id(2),status:'active',name:'保存GM',email:'gm@example.invalid'}]})
 it('保存した宛先・金額0・公演から通知を作る',async()=>{
  const result=await loadLegacyApprovalNotification(dbFor(tables()),id(2),id(3),id(5))
  expect(result).toMatchObject({queued:false,snapshot:{customerEmail:'saved@example.invalid',totalPrice:0,scenarioTitle:'保存作品',gmName:'保存GM'}})
 })
 it('別組織や未配置スタッフには送らない',async()=>{
  await expect(loadLegacyApprovalNotification(dbFor(tables()),id(99),id(3))).rejects.toThrow('予約が見つかりません')
  const data=tables();data.staff[0].name='他のGM'
  await expect(loadLegacyApprovalNotification(dbFor(data),id(2),id(3),id(5))).rejects.toThrow('担当GMを確認できません')
 })
 it('新しい配送がある承認は旧入口で送らない',async()=>{
  const result=await loadLegacyApprovalNotification(dbFor({...tables(),private_booking_approval_deliveries:[{reservation_id:id(3),organization_id:id(2),schedule_event_id:id(4),status:'pending',kind:'confirmation_email',recipient_key:'customer'}]}),id(2),id(3))
  expect(result).toEqual({queued:true})
 })
 it('入力欠落やDB取得失敗は外部送信の準備を拒否する',async()=>{
  await expect(loadLegacyApprovalNotification(dbFor(tables()),id(2),'not-a-uuid')).rejects.toThrow()
  await expect(loadLegacyApprovalNotification(dbFor(tables(),'private_booking_approval_deliveries'),id(2),id(3))).rejects.toThrow('database unavailable')
 })
})

describe('Discord準備の公演・組織境界',()=>{
 const reservation={status:'confirmed',schedule_event_id:id(4),organization_id:id(2)}
 const tables=()=>({schedule_events:[{id:id(4),organization_id:id(2),date:'2027-01-16',start_time:'19:30:00',store_id:id(6),is_cancelled:false}],stores:[{id:id(6),organization_id:id(2),name:'店舗'}]})
 it('保存された同組織の公演と店舗を取得する',async()=>{
  expect(await loadPrivateDiscordProvisionContext(dbFor(tables()),reservation,null)).toMatchObject({event:{id:id(4)},store:{name:'店舗'}})
 })
 it.each(['pending','cancelled'])('未確定・取消状態%sでは外部作成の前に拒否する',async status=>{
  const db=dbFor(tables());await expect(loadPrivateDiscordProvisionContext(db,{...reservation,status},null)).rejects.toThrow('確定済み')
  expect(db.from).not.toHaveBeenCalled()
 })
 it('公演未設定時は呼出側の値で補わない',async()=>{
  await expect(loadPrivateDiscordProvisionContext(dbFor(tables()),{...reservation,schedule_event_id:null},null)).rejects.toThrow('確定済み')
 })
 it('別組織の公演を拒否する',async()=>{
  const t=tables();t.schedule_events[0].organization_id=id(99)
  await expect(loadPrivateDiscordProvisionContext(dbFor(t),reservation,null)).rejects.toThrow('有効な公演')
 })
 it('別組織の店舗を拒否する',async()=>{
  const t=tables();t.stores[0].organization_id=id(99)
  await expect(loadPrivateDiscordProvisionContext(dbFor(t),reservation,null)).rejects.toThrow('店舗が一致')
 })
 it('取消公演と異なる世代の部屋を拒否する',async()=>{
  const t=tables();t.schedule_events[0].is_cancelled=true
  await expect(loadPrivateDiscordProvisionContext(dbFor(t),reservation,null)).rejects.toThrow('有効な公演')
  await expect(loadPrivateDiscordProvisionContext(dbFor(tables()),reservation,{schedule_event_id:id(99)})).rejects.toThrow('公演が変更')
 })
 it('公演取得エラーを不在として処理しない',async()=>{
  await expect(loadPrivateDiscordProvisionContext(dbFor(tables(),'schedule_events'),reservation,null)).rejects.toThrow('database unavailable')
 })
})

import assert from 'node:assert/strict';
import { deliverPrivateCancellations } from '../supabase/functions/_shared/private-cancellation-delivery.ts';
const channel='1557642745970163772';const sent=[];const saved=[];
const rows=[{id:'aaaa-1111',organization_id:'own',message_payload:{event_id:'e',epoch:'1',channel_id:channel,content:'架空貸切キャンセル'},retry_count:0,max_retries:3,next_retry_at:'2020-01-01'}, {id:'bbbb-1111',organization_id:'own',message_payload:{event_id:'e',epoch:'1',staff_id:'gm',content:'架空貸切キャンセル'},retry_count:0,max_retries:3,next_retry_at:'2020-01-01'}, {id:'cccc-1111',organization_id:'other',message_payload:{event_id:'e',epoch:'1',channel_id:channel,content:'架空貸切キャンセル'},retry_count:0,max_retries:3,next_retry_at:'2020-01-01'}];
const db={from(table){let update,eq=[];const result=()=>{
 if(table==='discord_notification_queue'){
  if(update?.status==='sending')return {data:{id:'claimed'},error:null};
  if(update){saved.push(update);return {error:null};}
  return {data:rows,error:null};
 }
 if(table==='schedule_events')return {data:{gm_cancel_epoch:'1'},error:null};
 if(table==='staff')return {data:{discord_channel_id:'123',discord_user_id:'456'},error:null};
 if(table==='organization_settings')return {data:{notification_settings:eq.some(([k,v])=>k==='organization_id'&&v==='own')?{private_cancellation_channel_id:channel}:{}},error:null};
};const q=new Proxy({}, {get(_,k){if(k==='then')return (yes,no)=>Promise.resolve(result()).then(yes,no);if(k==='maybeSingle'||k==='limit')return ()=>Promise.resolve(result());return (...args)=>{if(k==='update')update=args[0];if(k==='eq')eq.push(args);return q;};}});return q;}};
const outcome=await deliverPrivateCancellations(db,async()=> 'fake-token',async(url,options)=>{sent.push({url,payload:JSON.parse(options.body)});return new Response('{}',{status:200});});
assert.deepEqual(outcome,{succeeded:2,failed:1});assert.equal(sent.length,2);
assert.ok(sent[0].url.includes(channel));assert.deepEqual(sent[0].payload.allowed_mentions,{parse:[],users:[]});
assert.ok(sent[1].url.includes('/123/'));assert.deepEqual(sent[1].payload.allowed_mentions.users,['456']);
assert.ok(saved.some(x=>x.last_error==='organization_cancellation_channel_changed'));
console.log('PASS: shared + GM delivery, mentions preserved, foreign tenant destination rejected');

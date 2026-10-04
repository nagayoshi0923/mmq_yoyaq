// 整備 6: 貸切の最後の予約が取り消されたら、貸切公演も中止になることを確かめる（空のインメモリ PostgreSQL）。
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs'; import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
CREATE TABLE schedule_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,date date DEFAULT '2026-12-20',start_time time DEFAULT '10:00',end_time time DEFAULT '13:00',scenario text DEFAULT '試験作品',venue text DEFAULT '試験会場',gms text[] DEFAULT ARRAY['GM1','GM2'],is_cancelled boolean DEFAULT false,is_private_booking boolean DEFAULT true,category text DEFAULT 'private',gm_cancel_epoch uuid,cancelled_at timestamptz,cancellation_reason text,updated_at timestamptz);
CREATE TABLE staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,name text,discord_channel_id text);
CREATE TABLE reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),schedule_event_id uuid REFERENCES schedule_events ON DELETE SET NULL,event_id uuid,organization_id uuid,reservation_source text,payment_method text,status text DEFAULT 'confirmed',cancellation_reason text);
CREATE TABLE discord_notification_queue(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,notification_type text,reference_id uuid,dedupe_key text,webhook_url text,message_payload jsonb,max_retries int,last_error text,updated_at timestamptz,status text DEFAULT 'pending',UNIQUE(organization_id,notification_type,dedupe_key));
INSERT INTO staff(organization_id,name,discord_channel_id) VALUES ('00000000-0000-0000-0000-000000000001','GM1','123'),('00000000-0000-0000-0000-000000000001','GM2','456');`);
await db.exec(fs.readFileSync('supabase/migrations/20260911090000_private_cancellation_notifications.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20260914090000_fix_private_cancellation_trigger_column_ambiguity.sql','utf8'));
// 今回の migration の関数部分だけを流す（データ補正の部分は本番の表を前提にするため除く）
const mig=fs.readFileSync('supabase/migrations/20261004130000_private_event_cancel_with_reservation.sql','utf8');
await db.exec(mig.slice(mig.indexOf('CREATE OR REPLACE FUNCTION'), mig.indexOf('END $$;')+'END $$;'.length));
const org='00000000-0000-0000-0000-000000000001';
const event=async(extra='')=>(await db.query(`INSERT INTO schedule_events(organization_id${extra?',category,is_private_booking':''}) VALUES ('${org}'${extra}) RETURNING id`)).rows[0].id;
const reserve=async(id,src=null)=>(await db.query(`INSERT INTO reservations(schedule_event_id,organization_id,reservation_source) VALUES ($1,$2,$3) RETURNING id`,[id,org,src])).rows[0].id;
const ev=async(id)=>(await db.query('select is_cancelled,cancellation_reason,cancelled_at from schedule_events where id=$1',[id])).rows[0];
const queued=async(id)=>(await db.query("select count(*)::int n from discord_notification_queue where dedupe_key like $1",[id+':%'])).rows[0].n;
const cancel=(id,reason='お客様によるキャンセル')=>db.query("update reservations set status='cancelled',cancellation_reason=$2 where id=$1",[id,reason]);

// 1. 最後の予約の取り消しで公演も中止。GM への知らせは2人分だけ（公演側の見張りで二重にならない）
let e=await event(); let a=await reserve(e);
await cancel(a);
let s=await ev(e); assert.equal(s.is_cancelled,true); assert.equal(s.cancellation_reason,'お客様によるキャンセル'); assert.ok(s.cancelled_at);
assert.equal(await queued(e),2);
// 2. 他に有効な予約が残っていれば中止しない
e=await event(); a=await reserve(e); await reserve(e);
await cancel(a); assert.equal((await ev(e)).is_cancelled,false); assert.equal(await queued(e),0);
// 3. スタッフ参加だけが残る場合は中止する
e=await event(); a=await reserve(e); await reserve(e,'staff_entry');
await cancel(a,''); s=await ev(e); assert.equal(s.is_cancelled,true); assert.equal(s.cancellation_reason,'予約の取り消し');
// 4. オープン公演は対象外
e=await event(",'open',false"); a=await reserve(e);
await cancel(a); assert.equal((await ev(e)).is_cancelled,false);
// 5. 予約の削除では公演を中止しない（取り消しのときだけ）
e=await event(); a=await reserve(e);
await db.query('delete from reservations where id=$1',[a]); assert.equal((await ev(e)).is_cancelled,false);
// 6. 既に中止済みの公演は書き換えない
e=await event(); a=await reserve(e);
await db.query("update schedule_events set is_cancelled=true,cancellation_reason='店舗都合' where id=$1",[e]);
await cancel(a); assert.equal((await ev(e)).cancellation_reason,'店舗都合');
console.log('PASS: last cancellation cancels private event without duplicate GM notice, remaining booking keeps event, staff-only remains cancels, open untouched, delete untouched, already-cancelled untouched');
await db.close();

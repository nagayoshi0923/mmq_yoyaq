process.on('uncaughtException', e => { console.error(e.message,e.code ?? '',e.where ?? ''); process.exit(1) })
// 是正対象の実SQLを独立Postgresで実行。外部送信・実環境接続なし。
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(), id=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`
const org=id(1),user=id(11),customer=id(21),event=id(31),store=id(41),group=id(51),member=id(61),coupon=id(71),campaign=id(81),reservation=id(91),wait=id(101),master=id(111)
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION private_group_actor_role(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'participant'::text $$;
CREATE FUNCTION resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"value":true}'::jsonb $$;
CREATE FUNCTION is_murder_mystery_coupon_event(text,boolean) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE waitlist_notification_queue(id uuid PRIMARY KEY,organization_id uuid,schedule_event_id uuid,status text,created_at timestamptz DEFAULT now());
CREATE TABLE organizations(id uuid PRIMARY KEY,is_active boolean,booking_site_status text);
CREATE TABLE customers(id uuid PRIMARY KEY,user_id uuid,organization_id uuid);
CREATE TABLE staff(user_id uuid,organization_id uuid,status text,name text);
CREATE TABLE stores(id uuid PRIMARY KEY,organization_id uuid,name text,address text);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,store_id uuid,scenario text,date date,start_time time,end_time time,venue text,is_cancelled boolean,max_participants integer,capacity integer,category text,time_slot text,scenario_master_id uuid,organization_scenario_id uuid,scenario_id uuid);
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,schedule_event_id uuid,status text,participant_count integer,customer_id uuid,total_price integer,coupon_usage_enabled_snapshot boolean,discount_amount integer DEFAULT 0,final_price integer,payment_method text,participant_names text[]);
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid,scenario_id uuid,per_person_price integer,reservation_id uuid,status text);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,status text,coupon_id uuid,coupon_discount integer,payment_amount integer,final_amount integer);
CREATE TABLE customer_coupons(id uuid PRIMARY KEY,campaign_id uuid,customer_id uuid,organization_id uuid,status text,uses_remaining integer,expires_at timestamptz,rules_snapshot jsonb,updated_at timestamptz);
CREATE TABLE coupon_campaigns(id uuid PRIMARY KEY,organization_id uuid,is_active boolean);
CREATE TABLE coupon_usages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_coupon_id uuid,reservation_id uuid,discount_amount integer);
CREATE TABLE waitlist(id uuid PRIMARY KEY,organization_id uuid,schedule_event_id uuid,status text,participant_count integer,expires_at timestamptz,notified_at timestamptz,customer_name text,customer_email text,created_at timestamptz DEFAULT now());
CREATE TABLE organization_scenarios(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid);
CREATE TABLE organization_scenarios_with_master(organization_id uuid,org_scenario_id uuid,scenario_master_id uuid,org_status text,master_status text,title text,duration integer,weekend_duration integer,extra_preparation_time integer,private_booking_time_slots jsonb,private_booking_time_slots_weekend jsonb,private_booking_slot_start_times jsonb,available_from date,available_until date);
`)
const rules=fs.readFileSync('supabase/schemas/coupon_rules.sql','utf8')
for(const name of ['coupon_discount_for_event_internal','coupon_discount_for_event','can_use_coupon_reservation']){const a=rules.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'('),b=rules.indexOf('\nREVOKE ',a);await db.exec(rules.slice(a,b))}
await db.exec(fs.readFileSync('supabase/migrations/20260319110000_add_coupon_usage_trigger.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20261007110001_customer_review_notice_delivery.sql','utf8').replace(/REVOKE ALL ON FUNCTION public.notify_all_waitlist_entries[^;]*;/g,''))
await db.exec(fs.readFileSync('supabase/migrations/20261007110002_customer_review_coupon_conditions.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rpcs/get_public_private_booking_scenario_timing.sql','utf8'))
await db.exec(`INSERT INTO organizations VALUES('${org}',true,'approved'); INSERT INTO customers VALUES('${customer}','${user}',NULL); INSERT INTO stores VALUES('${store}','${org}','正規店舗','正規住所');
INSERT INTO schedule_events VALUES('${event}','${org}','${store}','正規作品',CURRENT_DATE+30,'13:00','16:00','正規店舗',false,3,3,'private','昼','${master}',NULL,NULL);
INSERT INTO reservations VALUES('${reservation}','${org}','${event}','confirmed',3,'${customer}',9000,true,0,9000,'onsite','{}');
INSERT INTO private_groups VALUES('${group}','${org}','${master}','${master}',4500,NULL,'gathering');
INSERT INTO private_group_members VALUES('${member}','${group}','${user}','joined',NULL,0,4500,4500);
INSERT INTO coupon_campaigns VALUES('${campaign}','${org}',true);
INSERT INTO customer_coupons VALUES('${coupon}','${campaign}','${customer}','${org}','active',1,NULL,'{"discount_type":"fixed","discount_amount":1000,"same_scenario_once":false}',now());
INSERT INTO waitlist VALUES('${wait}','${org}','${event}','waiting',1,now()+interval '60 days',NULL,'架空待機','fiction@example.invalid',now());
INSERT INTO organization_scenarios_with_master VALUES('${org}','${id(112)}','${master}','available','draft','正規作品',180,NULL,0,NULL,NULL,NULL,NULL,NULL);
SELECT set_config('request.jwt.claim.sub','${user}',false);`)
const q=async(s,p=[])=>(await db.query(s,p)).rows
let checks=0
async function rejects(s,params,code){try{await db.query(s,params);assert.fail('should reject')}catch(e){assert.equal(e.code,code);checks++}}
const claim=(actor=user,lease=id(201))=>q('SELECT claim_waitlist_notice($1,$2,false,$3) AS result',[event,actor,lease])
await rejects('SELECT claim_waitlist_notice($1,$2,false,$3)',[event,user,id(201)],'42501')
await db.query('UPDATE reservations SET participant_count=2 WHERE id=$1',[reservation])
await rejects('SELECT claim_waitlist_notice($1,$2,false,$3)',[event,id(12),id(202)],'42501')
await q('INSERT INTO staff(user_id,organization_id,status,name) VALUES($1,$2,\'active\',\'同組織架空担当\'),($3,$4,\'active\',\'他組織架空担当\')',[id(13),org,id(14),id(2)])
await rejects('SELECT claim_waitlist_notice($1,$2,false,$3)',[event,id(14),id(203)],'42501')
// 同組織担当と既存system経路は認可される。leaseを失敗終了して顧客本人の再試行へ渡す。
for(const [actor,system,lease] of [[id(13),false,id(204)],[null,true,id(205)]]){
 const permitted=(await q('SELECT claim_waitlist_notice($1,$2,$3,$4) AS result',[event,actor,system,lease]))[0].result
 assert.equal(permitted.entries.length,1);checks++
 await q('SELECT finish_waitlist_notice($1,$2,$3,false,\'isolated authorization probe\')',[permitted.noticeId,wait,lease])
}
let notice=(await claim())[0].result;assert.equal(notice.entries.length,1);assert.equal(notice.metadata.scenarioTitle,'正規作品');checks++
assert.equal((await claim(user,id(202)))[0].result.entries.length,0);checks++
const originalPayload={to:['fiction@example.invalid'],subject:'正規作品'}
assert.deepEqual((await q('SELECT prepare_waitlist_notice_payload($1,$2,$3,$4) AS p',[notice.noticeId,wait,id(201),JSON.stringify(originalPayload)]))[0].p,originalPayload);checks++
assert.deepEqual((await q('SELECT prepare_waitlist_notice_payload($1,$2,$3,$4) AS p',[notice.noticeId,wait,id(201),JSON.stringify({subject:'changed'})]))[0].p,originalPayload);checks++
await q('SELECT finish_waitlist_notice($1,$2,$3,false,\'sink rejected\')',[notice.noticeId,wait,id(201)])
assert.equal((await q('SELECT status FROM waitlist'))[0].status,'waiting');checks++
const retry=(await claim())[0].result;assert.equal(retry.entries[0].deliveryKey,notice.entries[0].deliveryKey);checks++
await q('SELECT finish_waitlist_notice($1,$2,$3,true,NULL)',[notice.noticeId,wait,id(201)])
assert.equal((await q('SELECT status FROM waitlist'))[0].status,'notified');checks++
assert.equal((await claim())[0].result,null);checks++
assert.equal((await q('SELECT get_public_private_booking_scenario_timing($1,$2) AS result',[org,master]))[0].result.title,'正規作品');checks++
for(const invalid of [{min_order_amount:10000},{usage_valid_from:'2099-01-01'},{usage_valid_until:'2000-01-01'},{target_type:'specific_organization',target_ids:[id(2)]},{target_type:'specific_scenarios',target_ids:[id(113)]}]){
 await q('UPDATE customer_coupons SET rules_snapshot=$1 WHERE id=$2',[JSON.stringify({discount_type:'fixed',discount_amount:1000,...invalid}),coupon]);await rejects('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon],'P0028')
}
await q('UPDATE customer_coupons SET rules_snapshot=$1 WHERE id=$2',[JSON.stringify({discount_type:'fixed',discount_amount:1000,same_scenario_once:false}),coupon])
let result=(await q('SELECT apply_coupon_to_group_member($1,$2) AS r',[member,coupon]))[0].r;assert.equal(result.pending,true);assert.equal(result.discount,0);assert.equal((await q('SELECT uses_remaining FROM customer_coupons'))[0].uses_remaining,1);checks++
// 予約時snapshot=trueを維持。確定までに現運用設定がOFFでもメンバー単価で適用。
await db.exec(`CREATE OR REPLACE FUNCTION resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"value":false}'::jsonb $$`)
await q('UPDATE private_groups SET reservation_id=$1,status=\'confirmed\' WHERE id=$2',[reservation,group]);assert.equal((await q('SELECT uses_remaining FROM customer_coupons'))[0].uses_remaining,0);assert.equal((await q('SELECT final_amount FROM private_group_members'))[0].final_amount,3500);checks++
assert.equal((await q('SELECT discount_amount FROM reservations WHERE id=$1',[reservation]))[0].discount_amount,1000)
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,8000);checks++
await db.exec(`CREATE OR REPLACE FUNCTION resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"value":true}'::jsonb $$`)
// 確定公演に依存する店舗/曜日/時間帯も共通validatorが拒否。
await q('SELECT remove_coupon_from_group_member($1)',[member])
for(const invalid of [{target_store_ids:[id(42)]},{allowed_weekdays:[(new Date(Date.now()+30*86400000).getUTCDay()+1)%7]},{allowed_time_slots:['夜']}]){
 await q('UPDATE customer_coupons SET rules_snapshot=$1 WHERE id=$2',[JSON.stringify({discount_type:'fixed',discount_amount:1000,same_scenario_once:false,...invalid}),coupon]);await rejects('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon],'P0028')
}
await q('UPDATE customer_coupons SET rules_snapshot=$1 WHERE id=$2',[JSON.stringify({discount_type:'fixed',discount_amount:1000,same_scenario_once:false}),coupon])
await q('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon])
for(let i=0;i<3;i++)await q('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon]);assert.equal((await q('SELECT count(*)::integer AS n FROM coupon_usages'))[0].n,1);checks++
// 再予約後は旧請求/回数を戻し、新予約へusageを付け替える。再試行でも1回消費。
await q('INSERT INTO reservations SELECT $1,organization_id,schedule_event_id,status,participant_count,customer_id,total_price,coupon_usage_enabled_snapshot,0,total_price,payment_method,participant_names FROM reservations WHERE id=$2',[id(92),reservation])
await q('UPDATE private_groups SET reservation_id=$1 WHERE id=$2',[id(92),group])
assert.equal((await q('SELECT reservation_id FROM coupon_usages'))[0].reservation_id,id(92));checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,9000);checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[id(92)]))[0].final_price,8000);checks++
assert.equal((await q('SELECT uses_remaining FROM customer_coupons'))[0].uses_remaining,0);checks++
await q('UPDATE private_groups SET per_person_price=5000 WHERE id=$1',[group])
assert.equal((await q('SELECT validated_amount FROM private_group_coupon_uses'))[0].validated_amount,5000);checks++
for(let i=0;i<2;i++)await q('SELECT remove_coupon_from_group_member($1)',[member]);assert.equal((await q('SELECT uses_remaining FROM customer_coupons'))[0].uses_remaining,1);checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[id(92)]))[0].final_price,9000);checks++
await q('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon]);await q('DELETE FROM private_group_members WHERE id=$1',[member]);assert.equal((await q('SELECT count(*)::integer AS n FROM private_group_coupon_uses'))[0].n,0);assert.equal((await q('SELECT count(*)::integer AS n FROM coupon_usages'))[0].n,1);checks++
for(const terminal of ['completed','no_show']){
 await q('UPDATE reservations SET status=\'confirmed\' WHERE id=$1',[reservation])
 const beforeCount=(await q('SELECT count(*)::integer AS n FROM waitlist_notice_events'))[0].n
 await q('UPDATE reservations SET status=$1 WHERE id=$2',[terminal,reservation])
 assert.equal((await q('SELECT count(*)::integer AS n FROM waitlist_notice_events'))[0].n,beforeCount);checks++
}
await q('INSERT INTO schedule_events SELECT $1,organization_id,store_id,scenario,date,start_time,end_time,venue,is_cancelled,max_participants,capacity,category,time_slot,scenario_master_id,organization_scenario_id,scenario_id FROM schedule_events WHERE id=$2',[id(33),event])
for(let i=0;i<12;i++)await q('INSERT INTO waitlist_notice_events(organization_id,schedule_event_id,freed_seats,metadata,last_attempt_at) VALUES($1,$2,1,\'{}\',now())',[org,event])
await q('UPDATE waitlist_notice_events SET last_attempt_at=now() WHERE schedule_event_id=$1',[event])
await q('INSERT INTO waitlist_notice_events(organization_id,schedule_event_id,freed_seats,metadata) VALUES($1,$2,1,\'{}\')',[org,id(33)])
assert.equal((await q('SELECT * FROM list_pending_waitlist_notice_events(1)'))[0].schedule_event_id,id(33));checks++
await q('DELETE FROM waitlist_notice_events WHERE schedule_event_id=$1 OR metadata=\'{}\'',[id(33)])
// 明示的provider拒否は期限をリセット。不明応答は保留期限を保持。
await q('UPDATE waitlist SET status=\'waiting\' WHERE id=$1',[wait])
await q('UPDATE waitlist_notice_events SET completed_at=NULL,requires_review=false')
await q('UPDATE waitlist_notice_deliveries SET sent_at=NULL,lease_id=$1,has_uncertain_attempt=false,attempt_in_progress=true,first_attempt_at=now()-interval \'24 hours\'',[id(201)])
await q('SELECT finish_waitlist_notice($1,$2,$3,false,\'provider rejected\')',[notice.noticeId,wait,id(201)])
assert.equal((await q('SELECT first_attempt_at FROM waitlist_notice_deliveries'))[0].first_attempt_at,null);checks++
let resumed=(await claim())[0].result;assert.equal(resumed.entries.length,1);assert.equal(resumed.metadata.freedSeats,1);checks++
await q('SELECT finish_waitlist_notice($1,$2,$3,false,\'delivery failed\')',[notice.noticeId,wait,id(201)])
await q('UPDATE waitlist_notice_deliveries SET first_attempt_at=now()-interval \'24 hours\'')
await q('UPDATE waitlist_notice_deliveries SET has_uncertain_attempt=true,lease_id=$1',[id(201)])
await q('SELECT finish_waitlist_notice($1,$2,$3,false,\'provider rejected\')',[notice.noticeId,wait,id(201)])
assert.notEqual((await q('SELECT first_attempt_at FROM waitlist_notice_deliveries'))[0].first_attempt_at,null);checks++
assert.equal((await claim())[0].result.manualReview,true);checks++
// 同一noticeの不明結果1件だけを保留し、確定未送信の別宛先は再送を続ける。
await q("INSERT INTO waitlist VALUES($1,$2,$3,'waiting',1,now()+interval '60 days',NULL,'架空追加','second@example.invalid',now())",[id(102),org,event])
await q('INSERT INTO waitlist_notice_deliveries(notice_id,waitlist_id) VALUES($1,$2)',[notice.noticeId,id(102)])
assert.equal((await q('SELECT * FROM list_pending_waitlist_notice_events(10)')).some(r=>r.schedule_event_id===event),true);checks++
let mixed=(await claim())[0].result;assert.equal(mixed.manualReview,true);assert.equal(mixed.entries.length,1);assert.equal(mixed.entries[0].id,id(102));checks++
await q('SELECT finish_waitlist_notice($1,$2,$3,true,NULL)',[notice.noticeId,id(102),id(201)])
assert.equal((await q('SELECT status FROM waitlist WHERE id=$1',[wait]))[0].status,'waiting');assert.equal((await q('SELECT status FROM waitlist WHERE id=$1',[id(102)]))[0].status,'notified');checks++
assert.equal((await q('SELECT * FROM list_pending_waitlist_notice_events(10)')).some(r=>r.schedule_event_id===event),false);checks++
// 別顧客のnoticeが同じ待機者を通知した場合、後発deliveryを送信済みと偽装せずnoticeを完了する。
const competingEvent=id(34)
await q('INSERT INTO schedule_events SELECT $1,organization_id,store_id,scenario,date,start_time,end_time,venue,is_cancelled,max_participants,capacity,category,time_slot,scenario_master_id,organization_scenario_id,scenario_id FROM schedule_events WHERE id=$2',[competingEvent,event])
await q("UPDATE waitlist SET status='waiting',schedule_event_id=$1 WHERE id=$2",[competingEvent,id(102)])
for(const [noticeId,actor] of [[id(301),user],[id(302),id(15)]])await q("INSERT INTO waitlist_notice_events(id,organization_id,schedule_event_id,actor_user_id,freed_seats,metadata) VALUES($1,$2,$3,$4,1,'{}')",[noticeId,org,competingEvent,actor])
const specificClaim=async(actor,lease)=>(await q('SELECT claim_waitlist_notice($1,$2,false,$3) AS result',[competingEvent,actor,lease]))[0].result
const first=await specificClaim(user,id(211));assert.equal(first.noticeId,id(301));assert.equal(first.entries.length,1)
const second=await specificClaim(id(15),id(212));assert.equal(second.noticeId,id(302));assert.equal(second.entries.length,0);checks++
await q('SELECT finish_waitlist_notice($1,$2,$3,true,NULL)',[first.noticeId,id(102),id(211)])
const superseded=await specificClaim(id(15),id(213));assert.equal(superseded.entries.length,0);assert.equal(superseded.pending,false)
assert.notEqual((await q('SELECT completed_at FROM waitlist_notice_events WHERE id=$1',[id(302)]))[0].completed_at,null)
assert.equal((await q('SELECT sent_at FROM waitlist_notice_deliveries WHERE notice_id=$1 AND waitlist_id=$2',[id(302),id(102)]))[0].sent_at,null);checks++
await q('DELETE FROM schedule_events WHERE id=$1',[competingEvent]);await q('DELETE FROM waitlist WHERE id=$1',[id(102)])
// 既存deliveryでも待機期限切れならleaseせず、通知済みを偽装しないでnoticeを完了する。
await q("UPDATE waitlist SET expires_at=now()-interval '1 minute' WHERE id=$1",[wait])
await q("INSERT INTO waitlist_notice_events(id,organization_id,schedule_event_id,actor_user_id,freed_seats,metadata) VALUES($1,$2,$3,$4,1,'{}')",[id(303),org,event,id(15)])
await q('INSERT INTO waitlist_notice_deliveries(notice_id,waitlist_id) VALUES($1,$2)',[id(303),wait])
const expiredDelivery=(await claim(id(15),id(215)))[0].result;assert.equal(expiredDelivery.entries.length,0);assert.equal(expiredDelivery.pending,false);assert.notEqual((await q('SELECT completed_at FROM waitlist_notice_events WHERE id=$1',[id(303)]))[0].completed_at,null);checks++
await q('DELETE FROM waitlist_notice_events WHERE id=$1',[id(303)]);await q("UPDATE waitlist SET expires_at=now()+interval '60 days' WHERE id=$1",[wait])
// 来歴のない旧pendingは切替を阻止。消化済み後の旧browser fallbackはDBintentだけを利用。
await q('INSERT INTO waitlist_notification_queue VALUES($1,$2,$3,\'pending\',now())',[id(151),org,event])
const guard=fs.readFileSync('supabase/migrations/20261007110001_customer_review_notice_delivery.sql','utf8').split('CREATE TABLE')[0]
await rejects(guard,[],'P0057')
await q('DELETE FROM waitlist_notification_queue')
await db.exec('CREATE FUNCTION notify_all_waitlist_entries(uuid) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$')
await db.exec(fs.readFileSync('supabase/migrations/20261007110004_customer_review_notice_activation.sql','utf8'))
await q('INSERT INTO waitlist_notification_queue VALUES($1,$2,$3,\'pending\',now())',[id(151),org,event])
assert.equal((await q('SELECT count(*)::integer AS n FROM waitlist_notification_queue'))[0].n,0);checks++
await rejects('INSERT INTO waitlist_notification_queue VALUES($1,$2,$3,\'pending\',now())',[id(152),org,id(32)],'P0057')
// JST終了直後の公演: 既存intentを配送しない、以降の減員で新規intentも作らない。
await q('UPDATE schedule_events SET date=(now() AT TIME ZONE \'Asia/Tokyo\')::date,start_time=((now() AT TIME ZONE \'Asia/Tokyo\')-interval \'2 hours\')::time,end_time=((now() AT TIME ZONE \'Asia/Tokyo\')-interval \'1 hour\')::time WHERE id=$1',[event])
await q('UPDATE waitlist SET status=\'waiting\' WHERE id=$1',[wait]);await q('UPDATE waitlist_notice_events SET completed_at=NULL')
assert.equal((await q('SELECT claim_waitlist_notice($1,NULL,true,$2) AS result',[event,id(207)]))[0].result,null);checks++
const beforeEnded=(await q('SELECT count(*)::integer AS n FROM waitlist_notice_events'))[0].n
await q('UPDATE reservations SET status=\'confirmed\',participant_count=2 WHERE id=$1',[reservation]);await q('UPDATE reservations SET participant_count=1 WHERE id=$1',[reservation])
assert.equal((await q('SELECT count(*)::integer AS n FROM waitlist_notice_events'))[0].n,beforeEnded);checks++
await q('DELETE FROM waitlist WHERE id=$1',[wait]);assert.equal((await q('SELECT count(*)::integer AS n FROM waitlist_notice_deliveries'))[0].n,0);checks++
console.log('CUSTOMER_REVIEW_CLOSURE_DB_PASS',checks,'実SQLチェック');await db.close()

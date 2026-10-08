process.on('uncaughtException', e => { console.error(e.stack,e.code ?? '',e.where ?? ''); process.exit(1) })
// 是正対象の実SQLを独立Postgresで実行。外部送信・実環境接続なし。
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(), id=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`
const org=id(1),user=id(11),customer=id(21),event=id(31),store=id(41),group=id(51),member=id(61),coupon=id(71),campaign=id(81),reservation=id(91),wait=id(101),master=id(111)
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
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
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,schedule_event_id uuid,status text,participant_count integer,customer_id uuid,total_price integer,coupon_usage_enabled_snapshot boolean,discount_amount integer DEFAULT 0,final_price integer,payment_method text,participant_names text[],updated_at timestamptz DEFAULT now());
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid,scenario_id uuid,per_person_price integer,reservation_id uuid,status text,organizer_id uuid);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,status text,coupon_id uuid,coupon_discount integer,payment_amount integer,final_amount integer,is_organizer boolean DEFAULT false);
CREATE TABLE customer_coupons(id uuid PRIMARY KEY,campaign_id uuid,customer_id uuid,organization_id uuid,status text,uses_remaining integer,expires_at timestamptz,rules_snapshot jsonb,updated_at timestamptz);
CREATE TABLE coupon_campaigns(id uuid PRIMARY KEY,organization_id uuid,is_active boolean);
CREATE TABLE coupon_usages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_coupon_id uuid,reservation_id uuid,discount_amount integer);
CREATE TABLE waitlist(id uuid PRIMARY KEY,organization_id uuid,schedule_event_id uuid,status text,participant_count integer,expires_at timestamptz,notified_at timestamptz,customer_name text,customer_email text,created_at timestamptz DEFAULT now(),customer_id uuid);
CREATE TABLE organization_scenarios(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid);
CREATE TABLE organization_scenarios_with_master(organization_id uuid,org_scenario_id uuid,scenario_master_id uuid,org_status text,master_status text,title text,duration integer,weekend_duration integer,extra_preparation_time integer,private_booking_time_slots jsonb,private_booking_time_slots_weekend jsonb,private_booking_slot_start_times jsonb,available_from date,available_until date);
`)
await db.exec('GRANT SELECT ON public.waitlist,public.customers TO service_role');
await db.exec("CREATE FUNCTION delete_guest_member(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$; CREATE FUNCTION delete_guest_member(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;");
const rules=fs.readFileSync('supabase/schemas/coupon_rules.sql','utf8')
for(const name of ['coupon_discount_for_event_internal','coupon_discount_for_event','can_use_coupon_reservation']){const a=rules.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'('),b=rules.indexOf('\nREVOKE ',a);await db.exec(rules.slice(a,b))}
await db.exec(fs.readFileSync('supabase/migrations/20260319110000_add_coupon_usage_trigger.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20261007110001_customer_review_notice_delivery.sql','utf8').replace(/REVOKE ALL ON FUNCTION public.notify_all_waitlist_entries[^;]*;/g,''))
await db.exec(fs.readFileSync('supabase/migrations/20261007110002_customer_review_coupon_conditions.sql','utf8'))
await db.exec('CREATE TRIGGER enforce_coupon_performance_scope BEFORE INSERT OR UPDATE ON coupon_usages FOR EACH ROW EXECUTE FUNCTION enforce_coupon_performance_scope()')
await db.exec(fs.readFileSync('supabase/rpcs/get_public_private_booking_scenario_timing.sql','utf8'))
await db.exec(`INSERT INTO organizations VALUES('${org}',true,'approved'); INSERT INTO customers VALUES('${customer}','${user}',NULL); INSERT INTO stores VALUES('${store}','${org}','正規店舗','正規住所');
INSERT INTO schedule_events VALUES('${event}','${org}','${store}','正規作品',CURRENT_DATE+30,'13:00','16:00','正規店舗',false,3,3,'private','昼','${master}',NULL,NULL);
INSERT INTO reservations(id,organization_id,schedule_event_id,status,participant_count,customer_id,total_price,coupon_usage_enabled_snapshot,discount_amount,final_price,payment_method,participant_names) VALUES('${reservation}','${org}','${event}','confirmed',3,'${customer}',9000,true,0,9000,'onsite','{}');
INSERT INTO private_groups(id,organization_id,scenario_master_id,scenario_id,per_person_price,reservation_id,status) VALUES('${group}','${org}','${master}','${master}',4500,NULL,'gathering');
INSERT INTO private_group_members(id,group_id,user_id,status,coupon_id,coupon_discount,payment_amount,final_amount) VALUES('${member}','${group}','${user}','joined',NULL,0,4500,4500);
INSERT INTO coupon_campaigns VALUES('${campaign}','${org}',true);
INSERT INTO customer_coupons VALUES('${coupon}','${campaign}','${customer}','${org}','active',1,NULL,'{"discount_type":"fixed","discount_amount":1000,"same_scenario_once":false}',now());
INSERT INTO waitlist VALUES('${wait}','${org}','${event}','waiting',1,now()+interval '60 days',NULL,'架空待機','fiction@example.invalid',now(),'${customer}');
INSERT INTO organization_scenarios_with_master VALUES('${org}','${id(112)}','${master}','available','draft','正規作品',180,NULL,0,NULL,NULL,NULL,NULL,NULL);
SELECT set_config('request.jwt.claim.sub','${user}',false);`)
const q=async(s,p=[])=>(await db.query(s,p)).rows
let checks=0
// service-role invokerは既定table ACLに依存せず読める。私有配送への直接更新は許可しない。
for(const table of ['waitlist_notice_events','waitlist_notice_deliveries']){
 assert.equal((await q('SELECT has_table_privilege($1,$2,$3) AS ok',['service_role',table,'SELECT']))[0].ok,true);checks++
 for(const op of ['INSERT','UPDATE','DELETE']){assert.equal((await q('SELECT has_table_privilege($1,$2,$3) AS ok',['service_role',table,op]))[0].ok,false);checks++}
}
await db.exec('SET ROLE service_role');await q('SELECT * FROM list_pending_waitlist_notice_events(10)');await db.exec('RESET ROLE');checks++;

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
assert.equal((await claim(user,id(202)))[0].result?.entries.length??0,0);checks++
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
await q('UPDATE coupon_campaigns SET is_active=false WHERE id=$1',[campaign]);assert.equal((await q('SELECT is_active FROM coupon_campaigns WHERE id=$1',[campaign]))[0].is_active,false);checks++
// 配布停止は保有分の利用を止めない。予約時snapshot=trueを維持。確定までに現運用設定がOFFでもメンバー単価で適用。
await db.exec(`CREATE OR REPLACE FUNCTION resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"value":false}'::jsonb $$`)
await q('UPDATE private_groups SET reservation_id=$1,status=\'confirmed\' WHERE id=$2',[reservation,group]);assert.equal((await q('SELECT uses_remaining FROM customer_coupons'))[0].uses_remaining,0);assert.equal((await q('SELECT final_amount FROM private_group_members'))[0].final_amount,3500);checks++
assert.equal((await q('SELECT discount_amount FROM reservations WHERE id=$1',[reservation]))[0].discount_amount,1000)
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,8000);checks++
await db.exec(`CREATE OR REPLACE FUNCTION resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"value":true}'::jsonb $$`)
// staff使用取消も貸切の請求・メンバー・回数を戻し、再試行で二重復元しない。
const staffUsage=(await q('SELECT id FROM coupon_usages WHERE customer_coupon_id=$1',[coupon]))[0].id
assert.equal((await q('SELECT restore_coupon_usage($1,$2,$3) AS r',[org,coupon,staffUsage]))[0].r.restored,true);checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,9000);checks++
assert.equal((await q('SELECT discount_amount FROM reservations WHERE id=$1',[reservation]))[0].discount_amount,0);checks++
const restoredMember=(await q('SELECT coupon_id,coupon_discount,final_amount FROM private_group_members WHERE id=$1',[member]))[0]
assert.deepEqual(restoredMember,{coupon_id:null,coupon_discount:0,final_amount:4500});checks++
assert.equal((await q('SELECT count(*)::integer AS n FROM private_group_coupon_uses'))[0].n,0);checks++
assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[coupon]))[0].uses_remaining,1);checks++
assert.equal((await q('SELECT restore_coupon_usage($1,$2,$3) AS r',[org,coupon,staffUsage]))[0].r.restored,false);checks++
await q('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon])
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,8000);checks++
// 確定公演に依存する店舗/曜日/時間帯も共通validatorが拒否。
await q('SELECT remove_coupon_from_group_member($1)',[member])
const actualEventWeekday=Number((await q('SELECT extract(dow from date) AS dow FROM schedule_events WHERE id=$1',[event]))[0].dow)
for(const invalid of [{target_store_ids:[id(42)]},{allowed_weekdays:[(actualEventWeekday+1)%7]},{allowed_time_slots:['夜']}]){
 await q('UPDATE customer_coupons SET rules_snapshot=$1 WHERE id=$2',[JSON.stringify({discount_type:'fixed',discount_amount:1000,same_scenario_once:false,...invalid}),coupon]);await rejects('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon],'P0028')
}
await q('UPDATE customer_coupons SET rules_snapshot=$1 WHERE id=$2',[JSON.stringify({discount_type:'fixed',discount_amount:1000,same_scenario_once:false}),coupon])
await q('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon])
for(let i=0;i<3;i++)await q('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon]);assert.equal((await q('SELECT count(*)::integer AS n FROM coupon_usages'))[0].n,1);checks++
// 再予約後は旧請求/回数を戻し、新予約へusageを付け替える。再試行でも1回消費。
await q('INSERT INTO reservations(id,organization_id,schedule_event_id,status,participant_count,customer_id,total_price,coupon_usage_enabled_snapshot,discount_amount,final_price,payment_method,participant_names) SELECT $1,organization_id,schedule_event_id,status,participant_count,customer_id,total_price,coupon_usage_enabled_snapshot,0,total_price,payment_method,participant_names FROM reservations WHERE id=$2',[id(92),reservation])
await q('UPDATE private_groups SET reservation_id=$1 WHERE id=$2',[id(92),group])
assert.equal((await q('SELECT reservation_id FROM coupon_usages'))[0].reservation_id,id(92));checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,9000);checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[id(92)]))[0].final_price,8000);checks++
assert.equal((await q('SELECT uses_remaining FROM customer_coupons'))[0].uses_remaining,0);checks++
await q('UPDATE private_groups SET per_person_price=5000 WHERE id=$1',[group])
assert.equal((await q('SELECT validated_amount FROM private_group_coupon_uses'))[0].validated_amount,5000);checks++
for(let i=0;i<2;i++)await q('SELECT remove_coupon_from_group_member($1)',[member]);assert.equal((await q('SELECT uses_remaining FROM customer_coupons'))[0].uses_remaining,1);checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[id(92)]))[0].final_price,9000);checks++
// 同じ予約の他メンバーも併用不可条件を共有する。単価は各メンバーのまま。
await q('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon])
await q('INSERT INTO customers VALUES($1,$2,NULL)',[id(22),id(12)])
await q("INSERT INTO private_group_members(id,group_id,user_id,status,coupon_id,coupon_discount,payment_amount,final_amount) VALUES($1,$2,$3,'joined',NULL,0,5000,5000)",[id(62),group,id(12)])
await q("INSERT INTO customer_coupons SELECT $1,campaign_id,$2,organization_id,'active',1,NULL,rules_snapshot,now() FROM customer_coupons WHERE id=$3",[id(72),id(22),coupon])
await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[id(12)])
await q("UPDATE customer_coupons SET rules_snapshot=rules_snapshot||jsonb_build_object('combinable',false) WHERE id=$1",[id(72)])
await rejects('SELECT apply_coupon_to_group_member($1,$2)',[id(62),id(72)],'P0028')
await q("UPDATE customer_coupons SET rules_snapshot=rules_snapshot||jsonb_build_object('combinable',id<>$1::uuid)",[coupon])
await rejects('SELECT apply_coupon_to_group_member($1,$2)',[id(62),id(72)],'P0028')
await q("UPDATE customer_coupons SET rules_snapshot=rules_snapshot||jsonb_build_object('combinable',true)")
await q('SELECT apply_coupon_to_group_member($1,$2)',[id(62),id(72)])
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[id(92)]))[0].final_price,7000);checks++
await q('SELECT remove_coupon_from_group_member($1)',[id(62)])
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[id(92)]))[0].final_price,8000);checks++
await q('DELETE FROM private_group_members WHERE id=$1',[id(62)]);await q('DELETE FROM customer_coupons WHERE id=$1',[id(72)]);await q('DELETE FROM customers WHERE id=$1',[id(22)])
await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[user])
await q('DELETE FROM private_group_members WHERE id=$1',[member]);assert.equal((await q('SELECT count(*)::integer AS n FROM private_group_coupon_uses'))[0].n,0);assert.equal((await q('SELECT count(*)::integer AS n FROM coupon_usages'))[0].n,0);assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[coupon]))[0].uses_remaining,1);assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[id(92)]))[0].final_price,9000);assert.equal((await q('SELECT discount_amount FROM reservations WHERE id=$1',[id(92)]))[0].discount_amount,0);checks+=4
// 本人に複数CIDがあっても作品一回制限は共有。別userには越境しない。
await q('INSERT INTO customers VALUES($1,$2,NULL),($3,$4,NULL)',[id(23),user,id(24),id(15)])
await q("UPDATE customer_coupons SET rules_snapshot=rules_snapshot||jsonb_build_object('same_scenario_once',true) WHERE id=$1",[coupon])
for(const [cid,cp,rid] of [[id(23),id(73),id(93)],[id(24),id(74),id(94)]]){
 await q("INSERT INTO customer_coupons SELECT $1,campaign_id,$2,organization_id,'active',1,NULL,rules_snapshot,now() FROM customer_coupons WHERE id=$3",[cp,cid,coupon])
 await q("INSERT INTO reservations(id,organization_id,schedule_event_id,status,participant_count,customer_id,total_price,coupon_usage_enabled_snapshot,discount_amount,final_price,payment_method,participant_names) SELECT $1,organization_id,schedule_event_id,'confirmed',1,$2,9000,true,0,9000,payment_method,participant_names FROM reservations WHERE id=$3",[rid,cid,reservation])
}
await q('SELECT use_customer_coupon($1,$2,$3)',[user,coupon,reservation])
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,8000);checks++
assert.equal((await q('SELECT discount_amount FROM reservations WHERE id=$1',[reservation]))[0].discount_amount,1000);checks++
assert.equal((await q('SELECT use_customer_coupon($1,$2,$3) AS r',[user,coupon,reservation]))[0].r.already_used,true);checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,8000);checks++
await rejects('SELECT coupon_discount_for_event($1,$2,9000,$3,$4)',[id(73),event,id(23),id(93)],'P0028')
assert.equal((await q('SELECT coupon_discount_for_event($1,$2,9000,$3,$4) AS amount',[id(74),event,id(24),id(94)]))[0].amount,1000);checks++
await q("UPDATE customer_coupons SET rules_snapshot=rules_snapshot||jsonb_build_object('same_scenario_once',false) WHERE id=$1",[id(73)])
assert.equal((await q('SELECT coupon_discount_for_event($1,$2,9000,$3,$4) AS amount',[id(73),event,id(23),id(93)]))[0].amount,1000);checks++
for(const role of ['anon','authenticated','service_role']){assert.equal((await q("SELECT has_function_privilege($1,'lock_coupon_customer_identity(uuid)','EXECUTE') AS ok",[role]))[0].ok,false);checks++}
for(const signature of ['delete_guest_member(uuid)','delete_guest_member(uuid,text)'])for(const role of ['anon','authenticated','service_role']){assert.equal((await q("SELECT has_function_privilege($1,$2,'EXECUTE') AS ok",[role,signature]))[0].ok,false);checks++}
// 別CID/別メールでも本人user一致なら同じ受信者。別user/公演は一致しない。
for(const [wid,cid,email] of [[id(102),id(23),'alias@example.invalid'],[id(103),id(24),'other@example.invalid']])await q("INSERT INTO waitlist SELECT $1,organization_id,schedule_event_id,'waiting',1,expires_at,NULL,'架空', $2,now(),$3 FROM waitlist WHERE id=$4",[wid,email,cid,wait])
assert.equal((await q('SELECT waitlist_notice_same_recipient($1,$2) AS ok',[wait,id(102)]))[0].ok,true);checks++
assert.equal((await q('SELECT waitlist_notice_same_recipient($1,$2) AS ok',[wait,id(103)]))[0].ok,false);checks++
await q('UPDATE waitlist SET schedule_event_id=$1 WHERE id=$2',[id(32),id(102)])
assert.equal((await q('SELECT waitlist_notice_same_recipient($1,$2) AS ok',[wait,id(102)]))[0].ok,false);checks++
await q('DELETE FROM waitlist WHERE id=ANY($1::uuid[])',[[id(102),id(103)]])
const aliasUsage=(await q('SELECT id FROM coupon_usages WHERE customer_coupon_id=$1 AND reservation_id=$2',[coupon,reservation]))[0].id
await q('SELECT restore_coupon_usage($1,$2,$3)',[org,coupon,aliasUsage])
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,9000);checks++
assert.equal((await q('SELECT discount_amount FROM reservations WHERE id=$1',[reservation]))[0].discount_amount,0);checks++
await q('DELETE FROM reservations WHERE id=ANY($1::uuid[])',[[id(93),id(94)]])
await q('DELETE FROM customer_coupons WHERE id=ANY($1::uuid[])',[[id(73),id(74)]])
await q('DELETE FROM customers WHERE id=ANY($1::uuid[])',[[id(23),id(24)]])
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
await q('SELECT prepare_waitlist_notice_payload($1,$2,$3,$4)',[notice.noticeId,wait,id(201),JSON.stringify(originalPayload)])
await q('SELECT finish_waitlist_notice($1,$2,$3,false,\'delivery failed\')',[notice.noticeId,wait,id(201)])
// 不明応答は23h以内でも別notice/別keyの送信を直ちに止める。元noticeの同じkeyだけ再試行できる。
await q("INSERT INTO waitlist_notice_events(id,organization_id,schedule_event_id,actor_user_id,freed_seats,metadata) VALUES($1,$2,$3,$4,1,'{}')",[id(305),org,event,id(15)])
const recentHold=(await claim(id(15),id(217)))[0].result;assert.equal(recentHold.entries.length,0);assert.equal(recentHold.manualReview,true);checks++
await q("UPDATE waitlist_notice_deliveries SET has_uncertain_attempt=false,attempt_in_progress=true,leased_until=now()-interval '1 second' WHERE notice_id=$1",[notice.noticeId])
await q("INSERT INTO waitlist_notice_events(id,organization_id,schedule_event_id,actor_user_id,freed_seats,metadata) VALUES($1,$2,$3,$4,1,'{}')",[id(306),org,event,id(16)])
const expiredAttemptHold=(await claim(id(16),id(218)))[0].result;assert.equal(expiredAttemptHold.entries.length,0);assert.equal(expiredAttemptHold.manualReview,true);checks++
const sameKeyRetry=(await claim(user,id(219)))[0].result;assert.equal(sameKeyRetry.entries.length,1);assert.equal(sameKeyRetry.entries[0].deliveryKey,notice.entries[0].deliveryKey);checks++
await q('SELECT finish_waitlist_notice($1,$2,$3,false,\'configuration missing\')',[notice.noticeId,wait,id(219)])
await q('DELETE FROM waitlist_notice_events WHERE id IN($1,$2)',[id(305),id(306)])

await q('UPDATE waitlist_notice_deliveries SET first_attempt_at=now()-interval \'24 hours\'')
await q('UPDATE waitlist_notice_deliveries SET has_uncertain_attempt=true,lease_id=$1',[id(201)])
await q('SELECT finish_waitlist_notice($1,$2,$3,false,\'provider rejected\')',[notice.noticeId,wait,id(201)])
assert.notEqual((await q('SELECT first_attempt_at FROM waitlist_notice_deliveries'))[0].first_attempt_at,null);checks++
assert.equal((await claim())[0].result.manualReview,true);checks++
// 同一noticeの不明結果1件だけを保留し、確定未送信の別宛先は再送を続ける。
await q("INSERT INTO waitlist VALUES($1,$2,$3,'waiting',1,now()+interval '60 days',NULL,'架空追加','second@example.invalid',now(),$4)",[id(102),org,event,id(22)])
await q('INSERT INTO waitlist_notice_deliveries(notice_id,waitlist_id) VALUES($1,$2)',[notice.noticeId,id(102)])
assert.equal((await q('SELECT * FROM list_pending_waitlist_notice_events(10)')).some(r=>r.schedule_event_id===event),true);checks++
let mixed=(await claim())[0].result;assert.equal(mixed.manualReview,true);assert.equal(mixed.entries.length,1);assert.equal(mixed.entries[0].id,id(102));checks++
await q('SELECT finish_waitlist_notice($1,$2,$3,true,NULL)',[notice.noticeId,id(102),id(201)])
assert.equal((await q('SELECT status FROM waitlist WHERE id=$1',[wait]))[0].status,'waiting');assert.equal((await q('SELECT status FROM waitlist WHERE id=$1',[id(102)]))[0].status,'notified');checks++
assert.equal((await q('SELECT * FROM list_pending_waitlist_notice_events(10)')).some(r=>r.schedule_event_id===event),false);checks++
// 別待機行でも同じ顧客/正規化メールなら直近不明配送を共有する。
await q("INSERT INTO waitlist VALUES($1,$2,$3,'waiting',1,now()+interval '60 days',NULL,'架空重複','  FICTION@EXAMPLE.INVALID ',now(),$4)",[id(103),org,event,id(23)])
assert.equal((await q('SELECT waitlist_notice_same_recipient($1,$2) AS same',[wait,id(103)]))[0].same,true);checks++
await q("INSERT INTO waitlist_notice_events(id,organization_id,schedule_event_id,actor_user_id,freed_seats,metadata) VALUES($1,$2,$3,$4,1,'{}')",[id(307),org,event,id(17)])
const duplicateRecipient=(await claim(id(17),id(221)))[0].result;assert.equal(duplicateRecipient.entries.length,0);assert.equal(duplicateRecipient.manualReview,true);checks++
await q('UPDATE waitlist SET customer_email=$1,customer_id=$2 WHERE id=$3',['changed@example.invalid',customer,id(103)])
assert.equal((await q('SELECT waitlist_notice_same_recipient($1,$2) AS same',[wait,id(103)]))[0].same,true);checks++
await q('DELETE FROM waitlist_notice_events WHERE id=$1',[id(307)]);await q('DELETE FROM waitlist WHERE id=$1',[id(103)])
// 他noticeの結果不明も同じ宛先だけを保留し、後発noticeが永久巡回しない。
await q("INSERT INTO waitlist_notice_events(id,organization_id,schedule_event_id,actor_user_id,freed_seats,metadata) VALUES($1,$2,$3,$4,1,'{}')",[id(304),org,event,id(15)])
const inheritedHold=(await claim(id(15),id(216)))[0].result;assert.equal(inheritedHold.entries.length,0);assert.equal(inheritedHold.manualReview,true)
assert.equal((await q('SELECT * FROM list_pending_waitlist_notice_events(10)')).some(r=>r.schedule_event_id===event),false);checks++
await q('DELETE FROM waitlist_notice_events WHERE id=$1',[id(304)])
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
// 同noticeの重複待機行は1宛先だけlease・通知し、受理後は宛先単位でnotifiedにする。
await q('INSERT INTO schedule_events SELECT $1,organization_id,store_id,scenario,date,start_time,end_time,venue,is_cancelled,max_participants,capacity,category,time_slot,scenario_master_id,organization_scenario_id,scenario_id FROM schedule_events WHERE id=$2',[id(35),event])
for(const wid of [id(104),id(105)])await q("INSERT INTO waitlist VALUES($1,$2,$3,'waiting',1,now()+interval '60 days',NULL,'架空同宛先',$5,now(),$4)",[wid,org,id(35),customer,wid===id(104)?'old@example.invalid':'latest@example.invalid'])
await q("INSERT INTO waitlist_notice_events(id,organization_id,schedule_event_id,actor_user_id,freed_seats,metadata) VALUES($1,$2,$3,$4,1,'{}')",[id(308),org,id(35),id(18)])
// 再登録で1→4名となった場合、古い1名で空席判定しない。全待機行を保持。
await q('UPDATE waitlist SET participant_count=4 WHERE id=$1',[id(105)])
const notEnough=(await q('SELECT claim_waitlist_notice($1,$2,false,$3) AS result',[id(35),id(18),id(223)]))[0].result
assert.equal(notEnough.entries.length,0);assert.equal((await q("SELECT count(*)::integer AS n FROM waitlist WHERE schedule_event_id=$1 AND status='waiting'",[id(35)]))[0].n,2);checks++
await q('UPDATE schedule_events SET max_participants=5,capacity=5 WHERE id=$1',[id(35)])
await q("INSERT INTO waitlist_notice_events(id,organization_id,schedule_event_id,actor_user_id,freed_seats,metadata) VALUES($1,$2,$3,$4,2,'{}')",[id(309),org,id(35),id(18)])
const dupeLease=(await q('SELECT claim_waitlist_notice($1,$2,false,$3) AS result',[id(35),id(18),id(222)]))[0].result;assert.equal(dupeLease.entries.length,1);checks++
assert.equal(dupeLease.entries[0].id,id(104));assert.equal(dupeLease.entries[0].customer_email,'latest@example.invalid');assert.equal(dupeLease.entries[0].participant_count,4);checks++
await q('SELECT finish_waitlist_notice($1,$2,$3,true,NULL)',[dupeLease.noticeId,dupeLease.entries[0].id,id(222)])
assert.equal((await q("SELECT count(*)::integer AS n FROM waitlist WHERE schedule_event_id=$1 AND status='notified'",[id(35)]))[0].n,2);assert.notEqual((await q('SELECT completed_at FROM waitlist_notice_events WHERE id=$1',[id(309)]))[0].completed_at,null);checks++
await q('DELETE FROM waitlist WHERE schedule_event_id=$1',[id(35)]);await q('DELETE FROM schedule_events WHERE id=$1',[id(35)])
// 送信開始後の再登録を旧1名の配送ackで通知済みに巻き込まない。
await q('INSERT INTO schedule_events SELECT $1,organization_id,store_id,scenario,date,start_time,end_time,venue,is_cancelled,max_participants,capacity,category,time_slot,scenario_master_id,organization_scenario_id,scenario_id FROM schedule_events WHERE id=$2',[id(36),event])
await q("INSERT INTO waitlist VALUES($1,$2,$3,'waiting',1,now()+interval '60 days',NULL,'架空旧希望','version-old@example.invalid',now(),$4)",[id(106),org,id(36),customer])
await q("INSERT INTO waitlist_notice_events(id,organization_id,schedule_event_id,actor_user_id,freed_seats,metadata) VALUES($1,$2,$3,$4,1,'{}')",[id(310),org,id(36),id(19)])
const versionClaim=(await q('SELECT claim_waitlist_notice($1,$2,false,$3) AS result',[id(36),id(19),id(224)]))[0].result
assert.equal(versionClaim.entries.length,1);assert.equal(versionClaim.entries[0].participant_count,1);checks++
const fixedOne={to:['version-old@example.invalid'],text:'希望人数1名'}
await q('SELECT prepare_waitlist_notice_payload($1,$2,$3,$4)',[versionClaim.noticeId,id(106),id(224),JSON.stringify(fixedOne)])
await q("INSERT INTO waitlist VALUES($1,$2,$3,'waiting',4,now()+interval '60 days',NULL,'架空新希望','version-new@example.invalid',now(),$4)",[id(107),org,id(36),customer])
await q('SELECT finish_waitlist_notice($1,$2,$3,true,NULL)',[versionClaim.noticeId,id(106),id(224)])
assert.equal((await q('SELECT status FROM waitlist WHERE id=$1',[id(106)]))[0].status,'notified');assert.equal((await q('SELECT status FROM waitlist WHERE id=$1',[id(107)]))[0].status,'waiting');assert.deepEqual((await q('SELECT payload FROM waitlist_notice_deliveries WHERE notice_id=$1',[versionClaim.noticeId]))[0].payload,fixedOne);checks++
await q('DELETE FROM waitlist WHERE schedule_event_id=$1',[id(36)]);await q('DELETE FROM schedule_events WHERE id=$1',[id(36)])
// claim内のlease集合保存→entry読取りの間にも再登録が入る窓を強制する。
await q('INSERT INTO schedule_events SELECT $1,organization_id,store_id,scenario,date,start_time,end_time,venue,is_cancelled,1,1,category,time_slot,scenario_master_id,organization_scenario_id,scenario_id FROM schedule_events WHERE id=$2',[id(37),event])
await q("INSERT INTO waitlist VALUES($1,$2,$3,'waiting',1,now()+interval '60 days',NULL,'架空claim旧','inside-old@example.invalid',now(),$4)",[id(108),org,id(37),customer])
await q("INSERT INTO waitlist_notice_events(id,organization_id,schedule_event_id,actor_user_id,freed_seats,metadata) VALUES($1,$2,$3,$4,1,'{}')",[id(311),org,id(37),id(20)])
await db.exec(`CREATE FUNCTION qa_insert_registration_in_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.notice_id='${id(311)}' AND OLD.lease_id IS NULL AND NEW.lease_id IS NOT NULL THEN
 INSERT INTO waitlist VALUES('${id(109)}','${org}','${id(37)}','waiting',4,now()+interval '60 days',NULL,'架空claim新','inside-new@example.invalid',now(),'${customer}'); END IF; RETURN NEW; END $$;
CREATE TRIGGER qa_insert_registration_in_claim AFTER UPDATE ON waitlist_notice_deliveries FOR EACH ROW EXECUTE FUNCTION qa_insert_registration_in_claim();`)
const insideClaim=(await q('SELECT claim_waitlist_notice($1,$2,false,$3) AS result',[id(37),id(20),id(225)]))[0].result
assert.equal(insideClaim.entries.length,1);assert.equal(insideClaim.entries[0].participant_count,1);assert.equal(insideClaim.entries[0].customer_email,'inside-old@example.invalid');checks++
await q('SELECT finish_waitlist_notice($1,$2,$3,true,NULL)',[insideClaim.noticeId,id(108),id(225)])
assert.equal((await q('SELECT status FROM waitlist WHERE id=$1',[id(109)]))[0].status,'waiting');checks++
await db.exec('DROP TRIGGER qa_insert_registration_in_claim ON waitlist_notice_deliveries;DROP FUNCTION qa_insert_registration_in_claim();')
await q('DELETE FROM waitlist WHERE schedule_event_id=$1',[id(37)]);await q('DELETE FROM schedule_events WHERE id=$1',[id(37)])
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
await q("UPDATE schedule_events SET date=((now() AT TIME ZONE 'Asia/Tokyo')-interval '1 day')::date,start_time='10:00',end_time='11:00' WHERE id=$1",[event])
await q('UPDATE waitlist SET status=\'waiting\' WHERE id=$1',[wait]);await q('UPDATE waitlist_notice_events SET completed_at=NULL')
assert.equal((await q('SELECT claim_waitlist_notice($1,NULL,true,$2) AS result',[event,id(207)]))[0].result,null);checks++
const beforeEnded=(await q('SELECT count(*)::integer AS n FROM waitlist_notice_events'))[0].n
await q('UPDATE reservations SET status=\'confirmed\',participant_count=2 WHERE id=$1',[reservation]);await q('UPDATE reservations SET participant_count=1 WHERE id=$1',[reservation])
assert.equal((await q('SELECT count(*)::integer AS n FROM waitlist_notice_events'))[0].n,beforeEnded);checks++
await q('DELETE FROM waitlist WHERE id=$1',[wait]);assert.equal((await q('SELECT count(*)::integer AS n FROM waitlist_notice_deliveries'))[0].n,0);checks++
// 旧利用は請求未反映なら過加算しない。不明な他割引がある場合は原子拒否。
await q('DELETE FROM coupon_usages WHERE reservation_id=$1',[reservation])
await q("UPDATE reservations SET total_price=9000,discount_amount=0,final_price=9000,status='confirmed' WHERE id=$1",[reservation])
await q("UPDATE schedule_events SET date=current_date+14 WHERE id=$1",[event])
await q("INSERT INTO customer_coupons SELECT $1,campaign_id,customer_id,organization_id,'active',2,now()+interval '1 year','{\"discount_type\":\"fixed\",\"discount_amount\":1000,\"combinable\":true}'::jsonb,now() FROM customer_coupons WHERE id=$2",[id(510),coupon])
const legacyUsage=(await q("SELECT use_customer_coupon($1,$2,$3) AS data",[user,id(510),reservation]))[0].data.usage_id
await q('DELETE FROM coupon_usage_billing_applied WHERE usage_id=$1',[legacyUsage])
await q('UPDATE reservations SET discount_amount=0,final_price=9000 WHERE id=$1',[reservation])
await q('SELECT restore_coupon_usage($1,$2,$3)',[org,id(510),legacyUsage])
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,9000);checks++
assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[id(510)]))[0].uses_remaining,2);checks++
const ambiguousUsage=(await q("SELECT use_customer_coupon($1,$2,$3) AS data",[user,id(510),reservation]))[0].data.usage_id
await q('DELETE FROM coupon_usage_billing_applied WHERE usage_id=$1',[ambiguousUsage])
await rejects('SELECT restore_coupon_usage($1,$2,$3)',[org,id(510),ambiguousUsage],'P0061')
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,8000);checks++
assert.equal((await q('SELECT count(*)::integer AS n FROM coupon_usages WHERE id=$1',[ambiguousUsage]))[0].n,1);checks++
assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[id(510)]))[0].uses_remaining,1);checks++
for(const field of ['discount_amount','final_price','total_price']){
 await q('UPDATE reservations SET discount_amount=0,final_price=9000,total_price=9000 WHERE id=$1',[reservation])
 await q(`UPDATE reservations SET ${field}=NULL WHERE id=$1`,[reservation])
 await rejects('SELECT restore_coupon_usage($1,$2,$3)',[org,id(510),ambiguousUsage],'P0061')
 assert.equal((await q('SELECT count(*)::integer AS n FROM coupon_usages WHERE id=$1',[ambiguousUsage]))[0].n,1);checks++
 assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[id(510)]))[0].uses_remaining,1);checks++
}

// 手動割引後の残額500に1000couponを使っても、実控除/履歴/台帳は500だけ。
await q('DELETE FROM coupon_usages WHERE reservation_id=$1',[reservation])
await q('UPDATE reservations SET total_price=9000,discount_amount=8500,final_price=500 WHERE id=$1',[reservation])
await q("INSERT INTO customer_coupons SELECT $1,campaign_id,customer_id,organization_id,'active',1,expires_at,rules_snapshot,now() FROM customer_coupons WHERE id=$2",[id(511),id(510)])
const capped=(await q('SELECT use_customer_coupon($1,$2,$3) AS data',[user,id(511),reservation]))[0].data
assert.equal(capped.discount_amount,500);checks++
assert.equal((await q('SELECT applied_amount FROM coupon_usage_billing_applied WHERE usage_id=$1',[capped.usage_id]))[0].applied_amount,500);checks++
assert.equal((await q('SELECT discount_amount FROM coupon_usages WHERE id=$1',[capped.usage_id]))[0].discount_amount,500);checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[reservation]))[0].final_price,0);checks++
await q('SELECT restore_coupon_usage($1,$2,$3)',[org,id(511),capped.usage_id])
assert.deepEqual((await q('SELECT discount_amount,final_price FROM reservations WHERE id=$1',[reservation]))[0],{discount_amount:8500,final_price:500});checks++
await q('UPDATE reservations SET final_price=0 WHERE id=$1',[reservation])
await rejects('SELECT use_customer_coupon($1,$2,$3)',[user,id(511),reservation],'P0028')
await q('UPDATE reservations SET final_price=NULL WHERE id=$1',[reservation])
await rejects('SELECT use_customer_coupon($1,$2,$3)',[user,id(511),reservation],'P0028')
assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[id(511)]))[0].uses_remaining,1);checks++
// 正本RPCを再適用してもmigrationの同一UIDロックを失わない。
const couponMigration=fs.readFileSync('supabase/migrations/20261007110002_customer_review_coupon_conditions.sql','utf8')
const canonicalRemove=fs.readFileSync('supabase/rpcs/remove_coupon_from_group_member.sql','utf8')
const extractRemove=text=>text.match(/CREATE OR REPLACE FUNCTION public\.remove_coupon_from_group_member\([\s\S]*?END \$\$;/)[0]
assert.equal(extractRemove(canonicalRemove),extractRemove(couponMigration));checks++
for(const role of ['anon','authenticated','service_role']) {assert.equal((await q("SELECT has_table_privilege($1,'coupon_usage_billing_applied','SELECT') AS allowed",[role]))[0].allowed,false);checks++}
// 評価はメール一致でなく認証UIDで本人照合し、全本人CIDの同作品のみ解除。
await q('INSERT INTO customers VALUES($1,$2,NULL),($3,$4,NULL)',[id(23),user,id(24),id(15)])
await db.exec('CREATE TABLE scenario_ratings(customer_id uuid,scenario_master_id uuid,rating integer,updated_at timestamptz DEFAULT now(),UNIQUE(customer_id,scenario_master_id))')
await db.exec(fs.readFileSync('supabase/rpcs/customer_rating_action.sql','utf8'))
await q("SELECT set_config('request.jwt.claim.sub',$1,false)",[user])
await q("SELECT customer_rating_action($1,'upsert',$2,5)",[customer,master])
assert.equal((await q("SELECT customer_rating_action($1,'snapshot') AS data",[customer]))[0].data[0].rating,5);checks++
await q("SELECT customer_rating_action($1,'upsert',$2,3)",[id(23),master])
await q("SELECT customer_rating_action($1,'upsert',$2,4)",[customer,id(112)])
await rejects("SELECT customer_rating_action($1,'upsert',$2,6)",[customer,master],'22023')
await rejects("SELECT customer_rating_action($1,'snapshot')",[id(24)],'42501')
await q("SELECT customer_rating_action($1,'clear_scenario',$2)",[customer,master])
assert.equal((await q('SELECT count(*)::integer AS n FROM scenario_ratings WHERE scenario_master_id=$1',[master]))[0].n,0);checks++
assert.equal((await q('SELECT count(*)::integer AS n FROM scenario_ratings WHERE scenario_master_id=$1',[id(112)]))[0].n,1);checks++
for(const role of ['anon','service_role']) {assert.equal((await q("SELECT has_function_privilege($1,'customer_rating_action(uuid,text,uuid,integer)','EXECUTE') AS allowed",[role]))[0].allowed,false);checks++}
assert.equal((await q("SELECT has_function_privilege('authenticated','customer_rating_action(uuid,text,uuid,integer)','EXECUTE') AS allowed"))[0].allowed,true);checks++


// 全正本の共通validatorはmigrationと同じ残額capを維持する。
const extractValidator=s=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.coupon_discount_for_event_internal('),s.indexOf('\nREVOKE ',s.indexOf('CREATE OR REPLACE FUNCTION public.coupon_discount_for_event_internal(')))
assert.equal(extractValidator(fs.readFileSync('supabase/schemas/coupon_rules.sql','utf8')),extractValidator(couponMigration));checks++
assert.equal(extractValidator(fs.readFileSync('supabase/schemas/customer_review_coupon_conditions.sql','utf8')),extractValidator(couponMigration));checks++
console.log(`Canonical coupon validator parity PASS; total checks ${checks}`)

// 新規予約の正本RPCと実usage triggerを通し、残額cap・履歴・請求台帳の一致を回帰検証。
await db.exec(`
ALTER TABLE reservations ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE reservations ADD COLUMN scenario_id uuid, ADD COLUMN store_id uuid,
 ADD COLUMN customer_name text, ADD COLUMN customer_email text, ADD COLUMN customer_phone text,
 ADD COLUMN requested_datetime timestamp, ADD COLUMN duration integer,
 ADD COLUMN base_price integer, ADD COLUMN options_price integer, ADD COLUMN unit_price integer,
 ADD COLUMN payment_status text, ADD COLUMN customer_notes text, ADD COLUMN reservation_number text,
 ADD COLUMN created_by uuid, ADD COLUMN booking_request_payload jsonb, ADD COLUMN title text, ADD COLUMN coupon_usage_id uuid;
ALTER TABLE organization_scenarios ADD COLUMN participation_fee integer, ADD COLUMN participation_costs jsonb, ADD COLUMN duration integer, ADD COLUMN override_title text;
CREATE TABLE scenario_masters(id uuid PRIMARY KEY,official_duration integer,title text);
CREATE TABLE organization_settings(organization_id uuid,custom_holidays jsonb);
CREATE TABLE scenarios(id uuid PRIMARY KEY,participation_fee integer,participation_costs jsonb,duration integer,title text);
CREATE VIEW scenarios_v2 AS SELECT * FROM scenarios;
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
CREATE FUNCTION reservation_actor_is_org_operator(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION is_store_recruitment_paused(uuid,text,date) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION calculate_booking_participation_fee(integer,jsonb,date,time,boolean) RETURNS integer LANGUAGE sql AS $$SELECT $1$$;
`)
await db.exec(fs.readFileSync('supabase/rpcs/create_reservation_with_lock_v2.sql','utf8'))
await q('INSERT INTO scenario_masters VALUES($1,180,\'架空新規予約\')',[id(701)])
await q('INSERT INTO organization_scenarios(id,organization_id,scenario_master_id,participation_fee) VALUES($1,$2,$3,1000)',[id(702),org,id(701)])
await q("INSERT INTO schedule_events(id,organization_id,store_id,date,start_time,end_time,is_cancelled,max_participants,capacity,category,scenario_master_id,organization_scenario_id) VALUES($1,$2,$3,CURRENT_DATE+30,'13:00','16:00',false,20,20,'normal',$4,$5)",[id(703),org,store,id(701),id(702)])
for(const [index,amount] of [[0,800],[1,1000]]){
 const newCoupon=id(704+index)
 await q("INSERT INTO customer_coupons(id,campaign_id,customer_id,organization_id,status,uses_remaining,rules_snapshot) VALUES($1,$2,$3,$4,'active',1,$5)",[newCoupon,campaign,customer,org,JSON.stringify({discount_type:'fixed',discount_amount:amount,same_scenario_once:false,combinable:true})])
 const args=[id(703),1,customer,'架空予約','booking@example.invalid','09012345678',null,null,'QA-BOOKING-REGRESSION-'+index,newCoupon]
 const sql='SELECT create_reservation_with_lock_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id'
 const booked=(await q(sql,args))[0].id
 assert.equal((await q(sql,args))[0].id,booked);checks++
 const invoice=(await q('SELECT discount_amount,final_price FROM reservations WHERE id=$1',[booked]))[0]
 assert.deepEqual(invoice,{discount_amount:amount,final_price:1000-amount});checks++
 const usage=(await q('SELECT u.id,u.discount_amount,b.applied_amount FROM coupon_usages u JOIN coupon_usage_billing_applied b ON b.usage_id=u.id WHERE u.reservation_id=$1',[booked]))[0]
 assert.equal(usage.discount_amount,amount);checks++
 assert.equal(usage.applied_amount,amount);checks++
 assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[newCoupon]))[0].uses_remaining,0);checks++
 await q('SELECT restore_coupon_usage($1,$2,$3)',[org,newCoupon,usage.id])
 assert.deepEqual((await q('SELECT discount_amount,final_price FROM reservations WHERE id=$1',[booked]))[0],{discount_amount:0,final_price:1000});checks++
 assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[newCoupon]))[0].uses_remaining,1);checks++
 assert.equal((await q(sql,args))[0].id,booked);checks++
 assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[newCoupon]))[0].uses_remaining,1);checks++
}

// 既存予約：定額/割合×手動割引なし/一部/全額。使用・再試行・取消・取消再試行で同額を維持。
for(const [index,type,face,manual] of [[0,'fixed',800,0],[1,'fixed',800,500],[2,'fixed',800,1000],[3,'percentage',50,0],[4,'percentage',50,750]]){
 const testCoupon=id(720+index), expected=Math.min(type==='fixed'?face:500,1000-manual)
 await q('UPDATE reservations SET total_price=1000,discount_amount=$1,final_price=$2 WHERE id=$3',[manual,1000-manual,reservation])
 await q("INSERT INTO customer_coupons(id,campaign_id,customer_id,organization_id,status,uses_remaining,rules_snapshot) VALUES($1,$2,$3,$4,'active',1,$5)",[testCoupon,campaign,customer,org,JSON.stringify({discount_type:type,discount_amount:face,same_scenario_once:false,combinable:true})])
 if(!expected){
  await rejects('SELECT use_customer_coupon($1,$2,$3)',[user,testCoupon,reservation],'P0028')
  assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[testCoupon]))[0].uses_remaining,1);checks++
  continue
 }
 const applied=(await q('SELECT use_customer_coupon($1,$2,$3) AS data',[user,testCoupon,reservation]))[0].data
 assert.equal(applied.discount_amount,expected);checks++
 assert.equal((await q('SELECT use_customer_coupon($1,$2,$3) AS data',[user,testCoupon,reservation]))[0].data.usage_id,applied.usage_id);checks++
 assert.deepEqual((await q('SELECT discount_amount,final_price FROM reservations WHERE id=$1',[reservation]))[0],{discount_amount:manual+expected,final_price:1000-manual-expected});checks++
 const usage=(await q('SELECT u.discount_amount,b.applied_amount FROM coupon_usages u JOIN coupon_usage_billing_applied b ON b.usage_id=u.id WHERE u.id=$1',[applied.usage_id]))[0]
 assert.deepEqual(usage,{discount_amount:expected,applied_amount:expected});checks++
 assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[testCoupon]))[0].uses_remaining,0);checks++
 await q('SELECT restore_coupon_usage($1,$2,$3)',[org,testCoupon,applied.usage_id])
 assert.equal((await q('SELECT restore_coupon_usage($1,$2,$3) AS data',[org,testCoupon,applied.usage_id]))[0].data.restored,false);checks++
 assert.deepEqual((await q('SELECT discount_amount,final_price FROM reservations WHERE id=$1',[reservation]))[0],{discount_amount:manual,final_price:1000-manual});checks++
 assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[testCoupon]))[0].uses_remaining,1);checks++
 assert.equal((await q('SELECT count(*)::integer AS n FROM coupon_usage_billing_applied WHERE usage_id=$1',[applied.usage_id]))[0].n,0);checks++
 // 適用後の請求変更を検知できない金額には取消保留。P0061で履歴/回数を変えない。
 const reapplied=(await q('SELECT use_customer_coupon($1,$2,$3) AS data',[user,testCoupon,reservation]))[0].data
 await q('UPDATE reservations SET discount_amount=0,final_price=1000 WHERE id=$1',[reservation])
 await rejects('SELECT restore_coupon_usage($1,$2,$3)',[org,testCoupon,reapplied.usage_id],'P0061')
 assert.equal((await q('SELECT uses_remaining FROM customer_coupons WHERE id=$1',[testCoupon]))[0].uses_remaining,0);checks++
 assert.equal((await q('SELECT count(*)::integer AS n FROM coupon_usages WHERE id=$1',[reapplied.usage_id]))[0].n,1);checks++
 await q('UPDATE reservations SET discount_amount=$1,final_price=$2 WHERE id=$3',[manual+expected,1000-manual-expected,reservation])
 await q('SELECT restore_coupon_usage($1,$2,$3)',[org,testCoupon,reapplied.usage_id])
}


// 券なし新規予約→後日券適用→元リクエスト再送→取消→元再送は同ID・金額を変えない。
const noCouponArgs=[id(703),1,customer,'架空後日券','later@example.invalid','09012345678',null,null,'QA-BOOKING-LATER-COUPON',null]
const bookingCall='SELECT create_reservation_with_lock_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id'
const noCouponBooked=(await q(bookingCall,noCouponArgs))[0].id
const later=(await q('SELECT use_customer_coupon($1,$2,$3) AS data',[user,id(704),noCouponBooked]))[0].data
assert.equal((await q(bookingCall,noCouponArgs))[0].id,noCouponBooked);checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[noCouponBooked]))[0].final_price,200);checks++
await q('SELECT restore_coupon_usage($1,$2,$3)',[org,id(704),later.usage_id])
assert.equal((await q(bookingCall,noCouponArgs))[0].id,noCouponBooked);checks++
assert.equal((await q('SELECT final_price FROM reservations WHERE id=$1',[noCouponBooked]))[0].final_price,1000);checks++

console.log('CUSTOMER_REVIEW_CLOSURE_DB_PASS',checks,'実SQLチェック');await db.close()

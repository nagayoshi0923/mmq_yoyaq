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
CREATE TABLE organizations(id uuid PRIMARY KEY,is_active boolean,booking_site_status text);
CREATE TABLE customers(id uuid PRIMARY KEY,user_id uuid,organization_id uuid);
CREATE TABLE staff(user_id uuid,organization_id uuid,status text,name text);
CREATE TABLE stores(id uuid PRIMARY KEY,organization_id uuid,name text,address text);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,store_id uuid,scenario text,date date,start_time time,end_time time,venue text,is_cancelled boolean,max_participants integer,capacity integer,category text,time_slot text,scenario_master_id uuid,organization_scenario_id uuid,scenario_id uuid);
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,schedule_event_id uuid,status text,participant_count integer,customer_id uuid,total_price integer,coupon_usage_enabled_snapshot boolean,payment_method text,participant_names text[]);
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
for(const name of ['coupon_discount_for_event','can_use_coupon_reservation']){const a=rules.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'('),b=rules.indexOf('\nREVOKE ',a);await db.exec(rules.slice(a,b))}
await db.exec(fs.readFileSync('supabase/migrations/20260319110000_add_coupon_usage_trigger.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20261007110001_customer_review_notice_delivery.sql','utf8').replace(/REVOKE ALL ON FUNCTION public.notify_all_waitlist_entries[^;]*;/g,''))
await db.exec(fs.readFileSync('supabase/migrations/20261007110002_customer_review_coupon_conditions.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rpcs/get_public_private_booking_scenario_timing.sql','utf8'))
await db.exec(`INSERT INTO organizations VALUES('${org}',true,'approved'); INSERT INTO customers VALUES('${customer}','${user}',NULL); INSERT INTO stores VALUES('${store}','${org}','正規店舗','正規住所');
INSERT INTO schedule_events VALUES('${event}','${org}','${store}','正規作品',CURRENT_DATE+30,'13:00','16:00','正規店舗',false,3,3,'private','昼','${master}',NULL,NULL);
INSERT INTO reservations VALUES('${reservation}','${org}','${event}','confirmed',3,'${customer}',9000,true,'onsite','{}');
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
await q('UPDATE private_groups SET reservation_id=$1,status=\'confirmed\' WHERE id=$2',[reservation,group]);assert.equal((await q('SELECT uses_remaining FROM customer_coupons'))[0].uses_remaining,0);assert.equal((await q('SELECT final_amount FROM private_group_members'))[0].final_amount,3500);checks++
// 確定公演に依存する店舗/曜日/時間帯も共通validatorが拒否。
await q('SELECT remove_coupon_from_group_member($1)',[member])
for(const invalid of [{target_store_ids:[id(42)]},{allowed_weekdays:[(new Date(Date.now()+30*86400000).getUTCDay()+1)%7]},{allowed_time_slots:['夜']}]){
 await q('UPDATE customer_coupons SET rules_snapshot=$1 WHERE id=$2',[JSON.stringify({discount_type:'fixed',discount_amount:1000,same_scenario_once:false,...invalid}),coupon]);await rejects('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon],'P0028')
}
await q('UPDATE customer_coupons SET rules_snapshot=$1 WHERE id=$2',[JSON.stringify({discount_type:'fixed',discount_amount:1000,same_scenario_once:false}),coupon])
await q('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon])
for(let i=0;i<3;i++)await q('SELECT apply_coupon_to_group_member($1,$2)',[member,coupon]);assert.equal((await q('SELECT count(*)::integer AS n FROM coupon_usages'))[0].n,1);checks++
for(let i=0;i<2;i++)await q('SELECT remove_coupon_from_group_member($1)',[member]);assert.equal((await q('SELECT uses_remaining FROM customer_coupons'))[0].uses_remaining,1);checks++
console.log('CUSTOMER_REVIEW_CLOSURE_DB_PASS',checks,'実SQLチェック');await db.close()

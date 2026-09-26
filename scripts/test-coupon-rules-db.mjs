import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${id(2)}'::uuid $$;
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${id(1)}'::uuid $$;
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE organizations(id uuid primary key);
CREATE TABLE customers(id uuid primary key,user_id uuid,organization_id uuid);
CREATE TABLE stores(id uuid primary key,organization_id uuid);
CREATE TABLE staff(id uuid,user_id uuid,organization_id uuid,status text,name text);
CREATE TABLE scenario_masters(id uuid primary key,title text,official_duration integer);
CREATE TABLE organization_scenarios(id uuid primary key,organization_id uuid,scenario_master_id uuid,participation_fee integer,participation_costs jsonb,duration integer,override_title text,extra_preparation_time integer);
CREATE TABLE scenarios(id uuid,participation_fee integer,participation_costs jsonb,duration integer,title text);
CREATE VIEW scenarios_v2 AS SELECT * FROM scenarios;
CREATE TABLE organization_settings(organization_id uuid,custom_holidays jsonb);
CREATE TABLE global_settings(organization_id uuid);
CREATE TABLE reservation_settings(organization_id uuid,store_id uuid);
CREATE TABLE email_settings(id uuid,organization_id uuid,store_id uuid);
CREATE TABLE schedule_events(id uuid primary key,organization_id uuid,store_id uuid,scenario_id uuid,organization_scenario_id uuid,scenario_master_id uuid,scenario text,category text,date date,start_time time,time_slot text,is_cancelled boolean default false,max_participants integer default 100,capacity integer);
CREATE TABLE reservations(id uuid primary key default gen_random_uuid(),schedule_event_id uuid,organization_id uuid,customer_id uuid,status text default 'confirmed',total_price integer,store_id uuid,scenario_id uuid,scenario_master_id uuid,participant_count integer default 1,participant_names text[],title text,customer_name text,customer_email text,customer_phone text,requested_datetime timestamptz,duration integer,base_price integer,options_price integer,discount_amount integer,final_price integer,unit_price integer,payment_method text,payment_status text,customer_notes text,reservation_number text,created_by uuid,coupon_usage_id uuid);
CREATE TABLE private_groups(id uuid,organization_id uuid,reservation_id uuid);
CREATE TABLE private_group_members(group_id uuid,user_id uuid,status text);
CREATE FUNCTION calculate_booking_participation_fee(integer,jsonb,date,time,boolean) RETURNS integer LANGUAGE sql AS $$ SELECT $1 $$;
`)
// Production table shapes without policies/seed data, plus actual historic use counter trigger.
const legacy=fs.readFileSync('supabase/migrations/20260214000001_coupon_system.sql','utf8')
for(const name of ['coupon_campaigns','customer_coupons','coupon_usages']) {
 const match=legacy.match(new RegExp(`CREATE TABLE IF NOT EXISTS public.${name} \\([\\s\\S]*?\\n\\);`));assert.ok(match);await db.exec(match[0])
}
await db.exec(fs.readFileSync('supabase/migrations/20260523040000_add_coupon_usage_period.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260523050000_expand_coupon_campaigns.sql','utf8'))
await db.exec(fs.readFileSync('supabase/schemas/coupon_calendar_months.sql','utf8'))
await db.exec(fs.readFileSync('supabase/schemas/coupon_murder_mystery_scope.sql','utf8'))
await db.exec(`CREATE FUNCTION update_customer_coupon_on_usage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE customer_coupons SET uses_remaining=uses_remaining-1,status=CASE WHEN uses_remaining-1<=0 THEN 'fully_used' ELSE status END WHERE id=NEW.customer_coupon_id; RETURN NEW; END $$; CREATE TRIGGER trigger_update_coupon_on_usage AFTER INSERT ON coupon_usages FOR EACH ROW EXECUTE FUNCTION update_customer_coupon_on_usage();`)
await db.exec(fs.readFileSync('supabase/schemas/operating_setting_overrides.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rpcs/get_operating_setting_default.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rpcs/resolve_operating_setting.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260926100000_unify_coupon_rules.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260926103000_complete_coupon_rule_boundaries.sql','utf8'))
await db.exec(`INSERT INTO organizations VALUES('${id(1)}'),('${id(9)}'); INSERT INTO customers VALUES('${id(3)}','${id(2)}',NULL),('${id(4)}','${id(5)}',NULL); INSERT INTO stores VALUES('${id(6)}','${id(1)}'); INSERT INTO scenario_masters VALUES('${id(7)}','架空作品',120); INSERT INTO organization_scenarios(id,organization_id,scenario_master_id,participation_fee,duration) VALUES('${id(8)}','${id(1)}','${id(7)}',4000,120); INSERT INTO schedule_events(id,organization_id,store_id,scenario_master_id,organization_scenario_id,category,date,start_time,time_slot) VALUES('${id(10)}','${id(1)}','${id(6)}','${id(7)}','${id(8)}','open','2099-01-01','13:00','昼'); INSERT INTO reservations(id,schedule_event_id,organization_id,customer_id,total_price) VALUES('${id(11)}','${id(10)}','${id(1)}','${id(3)}',4000),('${id(12)}','${id(10)}','${id(1)}','${id(4)}',4000);`)
let seq=100
async function coupon(overrides={}) {
 const campaign=id(seq++),coupon=id(seq++)
 const data={id:campaign,organization_id:id(1),name:'架空クーポン',discount_type:'percentage',discount_amount:25,max_uses_per_customer:3,target_type:'all',trigger_type:'manual',...overrides}
 const keys=Object.keys(data); await db.query(`INSERT INTO coupon_campaigns(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(data))
 await db.query(`INSERT INTO customer_coupons(id,campaign_id,customer_id,organization_id,uses_remaining) VALUES($1,$2,$3,$4,3)`,[coupon,campaign,id(3),id(1)])
 return {campaign,coupon}
}
const use=async c=>(await db.query(`SELECT use_customer_coupon($1,$2,$3) AS result`,[id(2),c,id(11)])).rows[0].result
const reject=async(fn,message)=>{let error;try{await fn()}catch(e){error=e}assert.ok(error,message);assert.equal(error.code,'P0028',error.message)}
const a=await coupon()
assert.equal((await use(a.coupon)).discount_amount,1000)
assert.equal((await use(a.coupon)).already_used,true)
assert.equal((await db.query(`SELECT uses_remaining FROM customer_coupons WHERE id=$1`,[a.coupon])).rows[0].uses_remaining,2)
await reject(()=>db.query(`SELECT use_customer_coupon($1,$2,$3)`,[id(5),a.coupon,id(11)]),'wrong owner')
await reject(()=>db.query(`SELECT use_customer_coupon($1,$2,$3)`,[id(2),a.coupon,id(12)]),'someone else reservation')
const b=await coupon({combinable:false});await reject(()=>use(b.coupon),'non combinable')
const c=await coupon({target_type:'specific_scenarios',target_ids:[id(99)]});await reject(()=>use(c.coupon),'scenario restriction')
const d=await coupon({target_store_ids:[id(99)]});await reject(()=>use(d.coupon),'store restriction')
const e=await coupon({allowed_weekdays:[0]});await reject(()=>use(e.coupon),'weekday restriction')
const f=await coupon({allowed_time_slots:['朝公演']});await reject(()=>use(f.coupon),'time restriction')
const g=await coupon({min_order_amount:5000});await reject(()=>use(g.coupon),'minimum')
const h=await coupon({usage_valid_from:'2199-01-01'});await reject(()=>use(h.coupon),'usage period')
const accepted=await coupon({allowed_time_slots:['昼公演'],target_type:'specific_scenarios',target_ids:[id(8)]})
assert.equal((await use(accepted.coupon)).discount_amount,1000)
const frozen=await coupon({discount_type:'fixed',discount_amount:500})
await db.query(`UPDATE coupon_campaigns SET discount_amount=2000,is_active=false WHERE id=$1`,[frozen.campaign])
assert.equal((await use(frozen.coupon)).discount_amount,500)
await db.query(`UPDATE customer_coupons SET rules_snapshot='{}' WHERE id=$1`,[frozen.coupon])
assert.equal((await db.query(`SELECT rules_snapshot->>'discount_amount' AS amount FROM customer_coupons WHERE id=$1`,[frozen.coupon])).rows[0].amount,'500')
const once=await coupon()
await reject(()=>db.query(`SELECT coupon_discount_for_event($1,$2,4000,$3,NULL)`,[once.coupon,id(10),id(3)]),'same scenario separate booking')
const repeat=await coupon({same_scenario_once:false})
const booking=await db.query(`SELECT create_reservation_with_lock_v2($1,1,$2,'架空顧客','fixture@example.invalid','',NULL,NULL,NULL,$3) AS id`,[id(10),id(3),repeat.coupon])
assert.ok(booking.rows[0].id)
assert.equal((await db.query(`SELECT uses_remaining FROM customer_coupons WHERE id=$1`,[repeat.coupon])).rows[0].uses_remaining,2,'booking must consume exactly once')
assert.equal((await db.query(`SELECT discount_amount FROM reservations WHERE id=$1`,[booking.rows[0].id])).rows[0].discount_amount,1000)
// Accept-policy snapshot: existing bookings retain permission while new bookings follow hierarchy.
await db.query(`INSERT INTO operating_setting_overrides(organization_id,settings) VALUES($1,'{"coupon_usage_enabled":false}')`,[id(1)])
await reject(()=>db.query(`SELECT coupon_discount_for_event($1,$2,4000,$3,NULL)`,[repeat.coupon,id(10),id(3)]),'common disabled')
await db.query(`INSERT INTO operating_setting_overrides(organization_id,store_id,settings) VALUES($1,$2,'{"coupon_usage_enabled":true}')`,[id(1),id(6)])
assert.equal((await db.query(`SELECT coupon_discount_for_event($1,$2,4000,$3,NULL) AS amount`,[repeat.coupon,id(10),id(3)])).rows[0].amount,1000)
await db.query(`INSERT INTO operating_setting_overrides(organization_id,organization_scenario_id,settings) VALUES($1,$2,'{"coupon_usage_enabled":false}')`,[id(1),id(8)])
await reject(()=>db.query(`SELECT coupon_discount_for_event($1,$2,4000,$3,NULL)`,[repeat.coupon,id(10),id(3)]),'scenario disabled')
await db.query(`INSERT INTO operating_setting_overrides(organization_id,schedule_event_id,settings) VALUES($1,$2,'{"coupon_usage_enabled":true}')`,[id(1),id(10)])
assert.equal((await db.query(`SELECT coupon_discount_for_event($1,$2,4000,$3,NULL) AS amount`,[repeat.coupon,id(10),id(3)])).rows[0].amount,1000)

// Preview never consumes; use/restore are retry-safe and revocation is not undone.
const previewed=await coupon({same_scenario_once:false,discount_type:'fixed',discount_amount:200})
const before=(await db.query(`SELECT uses_remaining FROM customer_coupons WHERE id=$1`,[previewed.coupon])).rows[0].uses_remaining
const quote=(await db.query(`SELECT preview_customer_coupon($1,$2,$3) AS result`,[id(2),previewed.coupon,id(11)])).rows[0].result
assert.equal(quote.discount_amount,200)
assert.equal((await db.query(`SELECT uses_remaining FROM customer_coupons WHERE id=$1`,[previewed.coupon])).rows[0].uses_remaining,before)
const consumed=await use(previewed.coupon)
assert.equal(consumed.discount_amount,quote.discount_amount)
await db.query(`UPDATE customer_coupons SET status='revoked' WHERE id=$1`,[previewed.coupon])
for(let i=0;i<2;i++) await db.query(`SELECT restore_coupon_usage($1,$2,$3)`,[id(1),previewed.coupon,consumed.usage_id])
assert.deepEqual((await db.query(`SELECT uses_remaining,status FROM customer_coupons WHERE id=$1`,[previewed.coupon])).rows[0],{uses_remaining:before,status:'revoked'})
// Null-owned unrelated reservation must fail closed (SQL NULL must not skip the check).
await db.query(`UPDATE reservations SET customer_id=NULL WHERE id=$1`,[id(12)])
await reject(()=>db.query(`SELECT use_customer_coupon($1,$2,$3)`,[id(2),a.coupon,id(12)]),'null owner')
// Cross-organization event, expired coupon and exhausted count.
await db.query(`UPDATE schedule_events SET organization_id=$1 WHERE id=$2`,[id(9),id(10)])
await reject(()=>db.query(`SELECT coupon_discount_for_event($1,$2,4000,$3,NULL)`,[repeat.coupon,id(10),id(3)]),'cross organization')
await db.query(`UPDATE schedule_events SET organization_id=$1 WHERE id=$2`,[id(1),id(10)])
const exhausted=await coupon();await db.query(`UPDATE customer_coupons SET uses_remaining=0 WHERE id=$1`,[exhausted.coupon]);await reject(()=>use(exhausted.coupon),'exhausted')
const expired=await coupon();await db.query(`UPDATE customer_coupons SET expires_at='2000-01-01' WHERE id=$1`,[expired.coupon]);await reject(()=>use(expired.coupon),'expired')
// Total discount is capped, even when the fixed amount is greater than remaining price.
const capped=await coupon({discount_type:'fixed',discount_amount:99999,same_scenario_once:false})
assert.equal((await use(capped.coupon)).discount_amount,1500)
const overflow=await coupon({same_scenario_once:false});await reject(()=>use(overflow.coupon),'no remaining price')

// Pending private request resolves its scenario before the event exists; later assignment keeps it frozen.
await db.query(`INSERT INTO reservations(id,organization_id,customer_id,total_price,scenario_master_id) VALUES($1,$2,$3,4000,$4)`,[id(20),id(1),id(3),id(7)])
assert.equal((await db.query(`SELECT coupon_usage_enabled_snapshot FROM reservations WHERE id=$1`,[id(20)])).rows[0].coupon_usage_enabled_snapshot,false)
await db.query(`UPDATE reservations SET schedule_event_id=$1 WHERE id=$2`,[id(10),id(20)])
assert.equal((await db.query(`SELECT coupon_usage_enabled_snapshot FROM reservations WHERE id=$1`,[id(20)])).rows[0].coupon_usage_enabled_snapshot,false)
// A private booking shared by two people cannot combine a non-combinable coupon.
await db.query(`INSERT INTO reservations(id,schedule_event_id,organization_id,customer_id,total_price) VALUES($1,$2,$3,$4,4000)`,[id(21),id(10),id(1),id(3)])
await db.query(`INSERT INTO private_groups VALUES($1,$2,$3);`,[id(22),id(1),id(21)])
await db.query(`INSERT INTO private_group_members VALUES($1,$2,'joined')`,[id(22),id(5)])
const first=await coupon({combinable:false,same_scenario_once:false})
await db.query(`SELECT use_customer_coupon($1,$2,$3)`,[id(2),first.coupon,id(21)])
const second=await coupon({same_scenario_once:false})
await db.query(`UPDATE customer_coupons SET customer_id=$1 WHERE id=$2`,[id(4),second.coupon])
await reject(()=>db.query(`SELECT use_customer_coupon($1,$2,$3)`,[id(5),second.coupon,id(21)]),'cross-person combination')

// A stale caller amount is ignored after acquiring the reservation lock.
const fresh=await coupon({same_scenario_once:false,discount_type:'percentage',discount_amount:50})
await db.query(`INSERT INTO reservations(id,schedule_event_id,organization_id,customer_id,total_price) VALUES($1,$2,$3,$4,1000)`,[id(30),id(10),id(1),id(3)])
assert.equal((await db.query(`SELECT coupon_discount_for_event($1,$2,99999,$3,$4) AS amount`,[fresh.coupon,id(10),id(3),id(30)])).rows[0].amount,500)
await db.query(`UPDATE reservations SET status='cancelled' WHERE id=$1`,[id(30)])
await reject(()=>db.query(`SELECT coupon_discount_for_event($1,$2,99999,$3,$4)`,[fresh.coupon,id(10),id(3),id(30)]),'cancelled after read')
// Legacy title-only events still enforce same-scenario usage, including across issuers.
await db.query(`UPDATE schedule_events SET scenario_master_id=NULL,organization_scenario_id=NULL,scenario_id=NULL,scenario='タイトルだけの作品' WHERE id=$1`,[id(10)])
await reject(()=>db.query(`SELECT coupon_discount_for_event($1,$2,4000,$3,NULL)`,[once.coupon,id(10),id(3)]),'legacy title same scenario')
await db.query(`INSERT INTO schedule_events(id,organization_id,scenario,date,start_time,category) VALUES($1,$2,'タイトルだけの作品','2099-01-01','13:00','open')`,[id(40),id(9)])
await db.query(`INSERT INTO coupon_campaigns(id,organization_id,name,discount_type,discount_amount,max_uses_per_customer) VALUES($1,$2,'別組織','fixed',500,1)`,[id(41),id(9)])
await db.query(`INSERT INTO customer_coupons(id,campaign_id,customer_id,organization_id,uses_remaining) VALUES($1,$2,$3,$4,1)`,[id(42),id(41),id(3),id(9)])
await reject(()=>db.query(`SELECT coupon_discount_for_event($1,$2,4000,$3,NULL)`,[id(42),id(40),id(3)]),'cross organization same scenario title')
await db.query(`UPDATE schedule_events SET scenario_master_id=$1 WHERE id IN ($2,$3)`,[id(7),id(10),id(40)])
await reject(()=>db.query(`SELECT coupon_discount_for_event($1,$2,4000,$3,NULL)`,[id(42),id(40),id(3)]),'cross organization same scenario master')
console.log('PASS: coupon eligibility, tenant/owner, idempotency, frozen rules, amount, single consumption, inheritance')
await db.exec(fs.readFileSync('supabase/rollbacks/20260926103000_complete_coupon_rule_boundaries.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260926103000_complete_coupon_rule_boundaries.sql','utf8'))
await db.close()

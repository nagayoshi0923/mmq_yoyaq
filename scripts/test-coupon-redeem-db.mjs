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
await db.exec(fs.readFileSync('supabase/migrations/20260926120000_booking_coupon_preview.sql','utf8'))
await db.exec('CREATE TABLE IF NOT EXISTS performance_schedule_settings (organization_id uuid, store_id uuid, default_duration integer)')
await db.exec(fs.readFileSync('supabase/migrations/20260926121000_common_performance_duration.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260926122000_preserve_legacy_performance_duration.sql','utf8'))
await db.exec(`INSERT INTO organizations VALUES('${id(1)}'),('${id(9)}'); INSERT INTO customers VALUES('${id(3)}','${id(2)}',NULL),('${id(4)}','${id(5)}',NULL); INSERT INTO stores VALUES('${id(6)}','${id(1)}'); INSERT INTO scenario_masters VALUES('${id(7)}','架空作品',120); INSERT INTO organization_scenarios(id,organization_id,scenario_master_id,participation_fee,duration) VALUES('${id(8)}','${id(1)}','${id(7)}',4000,120); INSERT INTO schedule_events(id,organization_id,store_id,scenario_master_id,organization_scenario_id,category,date,start_time,time_slot) VALUES('${id(10)}','${id(1)}','${id(6)}','${id(7)}','${id(8)}','open','2099-01-01','13:00','昼'); INSERT INTO reservations(id,schedule_event_id,organization_id,customer_id,total_price) VALUES('${id(11)}','${id(10)}','${id(1)}','${id(3)}',4000),('${id(12)}','${id(10)}','${id(1)}','${id(4)}',4000);`)
// 予約に適用したクーポンの「もぎる（来店確認）」（20261020130000）。消費は予約時のまま、印だけ付ける。
await db.exec(fs.readFileSync('supabase/migrations/20261020130000_coupon_usage_redeem.sql','utf8'))
// もぎるは公演当日（日本時間）だけ（20261020180000）。ここでの予約は既定で今日の公演にしておく。
await db.exec(fs.readFileSync('supabase/migrations/20261020180000_coupon_usage_redeem_same_day.sql','utf8'))
await db.exec(`ALTER TABLE reservations ALTER COLUMN requested_datetime SET DEFAULT now(); UPDATE reservations SET requested_datetime=now();`)
// 当日の判定は公演の日付（schedule_events.date）が正（20261020220000）。ここでの公演も今日にしておく。
await db.exec(fs.readFileSync('supabase/migrations/20261020220000_coupon_redeem_use_event_date.sql','utf8'))
await db.exec(`UPDATE schedule_events SET date=(now() AT TIME ZONE 'Asia/Tokyo')::date WHERE id='${id(10)}';
INSERT INTO schedule_events(id,organization_id,store_id,scenario_master_id,organization_scenario_id,category,date,start_time,time_slot) VALUES
 ('${id(13)}','${id(1)}','${id(6)}','${id(7)}','${id(8)}','open','2099-01-01','13:00','昼'),
 ('${id(14)}','${id(1)}','${id(6)}','${id(7)}','${id(8)}','open',(now() AT TIME ZONE 'Asia/Tokyo')::date-2,'13:00','昼'),
 ('${id(15)}','${id(1)}','${id(6)}','${id(7)}','${id(8)}','open',(now() AT TIME ZONE 'Asia/Tokyo')::date+1,'13:00','昼');`)
await db.exec(`INSERT INTO coupon_campaigns(id,organization_id,name,discount_type,discount_amount,max_uses_per_customer,target_type,trigger_type,same_scenario_once) VALUES('${id(100)}','${id(1)}','架空クーポン','fixed',500,5,'all','manual',false);
INSERT INTO customer_coupons(id,campaign_id,customer_id,organization_id,uses_remaining) VALUES('${id(101)}','${id(100)}','${id(3)}','${id(1)}',3),('${id(102)}','${id(100)}','${id(4)}','${id(1)}',3);`)
const usage=(await db.query(`SELECT use_customer_coupon($1,$2,$3) AS r`,[id(2),id(101),id(11)])).rows[0].r.usage_id
const remaining=async()=>(await db.query(`SELECT uses_remaining FROM customer_coupons WHERE id=$1`,[id(101)])).rows[0].uses_remaining
const before=await remaining()
const redeem=async(user,u,source)=>(await db.query(source?`SELECT redeem_coupon_usage($1,$2,$3) AS r`:`SELECT redeem_coupon_usage($1,$2) AS r`,source?[user,u,source]:[user,u])).rows[0].r
const reject=async(fn,message)=>{let error;try{await fn()}catch(e){error=e}assert.ok(error,message);assert.equal(error.code,'P0028',error.message)}

// 他人（別の会員）は押せない。時刻も入らない。
await reject(()=>redeem(id(5),usage),'他人のクーポン')
assert.equal((await db.query(`SELECT redeemed_at FROM coupon_usages WHERE id=$1`,[usage])).rows[0].redeemed_at,null)
// 存在しない使用履歴・不正な経路
await reject(()=>redeem(id(2),id(999)),'存在しない使用履歴')
await reject(()=>redeem(id(2),usage,'staff'),'不正な経路')

// 本人は押せる。1回目で時刻・押した会員・経路が入る。
const first=await redeem(id(2),usage)
assert.equal(first.success,true); assert.equal(first.already_redeemed,false); assert.ok(first.redeemed_at)
const row=(await db.query(`SELECT redeemed_at,redeemed_by_member,redeemed_source,discount_amount FROM coupon_usages WHERE id=$1`,[usage])).rows[0]
assert.equal(row.redeemed_by_member,id(3)); assert.equal(row.redeemed_source,'customer_present')
// 2回目は成功で何もしない（冪等）。時刻は書き換えない。消費（残り回数・割引額）も変わらない。
const second=await redeem(id(2),usage)
assert.equal(second.success,true); assert.equal(second.already_redeemed,true)
assert.equal(new Date(second.redeemed_at).getTime(),new Date(row.redeemed_at).getTime())
assert.equal(await remaining(),before)
assert.equal((await db.query(`SELECT discount_amount FROM coupon_usages WHERE id=$1`,[usage])).rows[0].discount_amount,row.discount_amount)
assert.equal((await db.query(`SELECT count(*)::int AS n FROM coupon_usages WHERE customer_coupon_id=$1`,[id(101)])).rows[0].n,1)

// 他人の予約に付いた使用履歴は、クーポンの持ち主が自分でも拒否する（予約の持ち主を後から変えた場合）。
await db.query(`INSERT INTO reservations(id,schedule_event_id,organization_id,customer_id,total_price) VALUES($1,$2,$3,$4,4000)`,[id(30),id(10),id(1),id(3)])
const moved=(await db.query(`SELECT use_customer_coupon($1,$2,$3) AS r`,[id(2),id(101),id(30)])).rows[0].r.usage_id
await db.query(`UPDATE reservations SET customer_id=$1 WHERE id=$2`,[id(4),id(30)])
await reject(()=>redeem(id(2),moved),'他人の予約')
// 取り消し済みの予約は押せない。
await db.query(`UPDATE reservations SET customer_id=$1,status='cancelled' WHERE id=$2`,[id(3),id(30)])
await reject(()=>redeem(id(2),moved),'取り消し済みの予約')

// 貸切の参加メンバー: 予約の持ち主が別の人でも、本人が参加メンバーなら押せる。
await db.query(`INSERT INTO reservations(id,schedule_event_id,organization_id,customer_id,total_price) VALUES($1,$2,$3,$4,8000)`,[id(31),id(10),id(1),id(4)])
await db.query(`INSERT INTO private_groups VALUES($1,$2,$3)`,[id(40),id(1),id(31)])
await db.query(`INSERT INTO private_group_members VALUES($1,$2,'joined')`,[id(40),id(2)])
const member=(await db.query(`SELECT use_customer_coupon($1,$2,$3) AS r`,[id(2),id(101),id(31)])).rows[0].r.usage_id
assert.equal((await redeem(id(2),member,'venue_use')).already_redeemed,false)
assert.equal((await db.query(`SELECT redeemed_source FROM coupon_usages WHERE id=$1`,[member])).rows[0].redeemed_source,'venue_use')
// 予約の持ち主（id(5)）でも、他人のクーポンの使用履歴は押せない。
await reject(()=>redeem(id(5),member),'予約の持ち主でもクーポンの持ち主でない')

// 使用履歴の条件（割引額など）は従来どおり変更できない。
await reject(()=>db.query(`UPDATE coupon_usages SET discount_amount=1 WHERE id=$1`,[usage]),'割引額は変更不可')
// 権限: 画面（authenticated）から直接は呼べない。
assert.equal((await db.query(`SELECT has_function_privilege('authenticated','redeem_coupon_usage(uuid,uuid,text)','EXECUTE') AS ok`)).rows[0].ok,false)
assert.equal((await db.query(`SELECT has_function_privilege('anon','redeem_coupon_usage(uuid,uuid,text)','EXECUTE') AS ok`)).rows[0].ok,false)
assert.equal((await db.query(`SELECT has_function_privilege('service_role','redeem_coupon_usage(uuid,uuid,text)','EXECUTE') AS ok`)).rows[0].ok,true)

// 公演当日でない予約（先の日付・前の日付）は「公演当日に押してください」で断る。印は付かない。
await db.query(`UPDATE customer_coupons SET uses_remaining=5,status='active' WHERE id=$1`,[id(101)]); await db.query(`UPDATE coupon_campaigns SET max_uses_per_customer=10 WHERE id=$1`,[id(100)])
await db.query(`INSERT INTO reservations(id,schedule_event_id,organization_id,customer_id,total_price,requested_datetime) VALUES($1,$2,$3,$4,4000,'2099-01-01 13:00+09'),($5,$6,$3,$4,4000,now()-interval '2 days')`,[id(32),id(13),id(1),id(3),id(33),id(14)])
// requested_datetime に予約を作った時刻が入っている予約（staging で 31 件）。公演の日付で判定する（20261020220000）。
await db.query(`INSERT INTO reservations(id,schedule_event_id,organization_id,customer_id,total_price,requested_datetime) VALUES($1,$2,$3,$4,4000,now()-interval '30 days'),($5,$6,$3,$4,4000,now())`,[id(34),id(10),id(1),id(3),id(35),id(15)])
const useOn=async r=>(await db.query(`SELECT use_customer_coupon($1,$2,$3) AS r`,[id(2),id(101),r])).rows[0].r.usage_id
const future=await useOn(id(32)), past=await useOn(id(33)), createdEarlier=await useOn(id(34)), createdToday=await useOn(id(35))
for(const [u,source] of [[future,undefined],[future,'venue_use'],[past,undefined],[createdToday,undefined]]){
 let error;try{await redeem(id(2),u,source)}catch(e){error=e}
 assert.ok(error,'公演当日でないのに押せた');assert.equal(error.code,'P0028');assert.equal(error.message,'公演当日に押してください');assert.equal(error.hint,'not_performance_day')
}
assert.equal((await db.query(`SELECT count(*)::int AS n FROM coupon_usages WHERE id=ANY($1) AND redeemed_at IS NOT NULL`,[[future,past,createdToday]])).rows[0].n,0)
// 予約を 30 日前に作った（requested_datetime が作成時刻）予約でも、公演が今日なら押せる
assert.equal((await redeem(id(2),createdEarlier)).already_redeemed,false)

// 公演日基準を巻き戻すと requested_datetime 基準（20261020180000）に戻る。先の日付はまだ断る。
await db.exec(fs.readFileSync('supabase/rollbacks/20261020220000_coupon_redeem_use_event_date.sql','utf8'))
assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname='coupon_performance_day'`)).rows[0].n,0)
{let error;try{await redeem(id(2),future)}catch(e){error=e}assert.equal(error?.hint,'not_performance_day')}
// 当日だけの確認を巻き戻すと、先の日付でも押せる元の関数に戻る（確かめた印は消す）。
await db.exec(fs.readFileSync('supabase/rollbacks/20261020180000_coupon_usage_redeem_same_day.sql','utf8'))
assert.equal((await redeem(id(2),future)).already_redeemed,false)
// 巻き戻しで列と関数が消え、使用履歴そのものは残る。
await db.exec(fs.readFileSync('supabase/rollbacks/20261020130000_coupon_usage_redeem.sql','utf8'))
assert.equal((await db.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='coupon_usages' AND column_name LIKE 'redeemed%'`)).rows[0].n,0)
assert.equal((await db.query(`SELECT count(*)::int AS n FROM coupon_usages WHERE id=$1`,[usage])).rows[0].n,1)
console.log('coupon redeem DB checks passed')

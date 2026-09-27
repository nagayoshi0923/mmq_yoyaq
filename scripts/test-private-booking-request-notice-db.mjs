process.on('uncaughtException', error => { console.error(error.message, error.where ?? ''); process.exit(1) })
// In-memory PostgreSQL only. Exercises the real request/approval functions, no live writes.
import fs from 'node:fs'
import assert from 'node:assert/strict'
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db=new PGlite()
const org='10000000-0000-0000-0000-000000000001',scenario='20000000-0000-0000-0000-000000000001',store='30000000-0000-0000-0000-000000000001',user='40000000-0000-0000-0000-000000000001',customer='50000000-0000-0000-0000-000000000001',gm='60000000-0000-0000-0000-000000000001'
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT ''${user}''::UUID';
CREATE FUNCTION get_user_organization_id() RETURNS UUID LANGUAGE SQL AS 'SELECT ''${org}''::UUID';
CREATE FUNCTION is_org_admin() RETURNS BOOLEAN LANGUAGE SQL AS 'SELECT TRUE';
CREATE FUNCTION is_staff_or_admin() RETURNS BOOLEAN LANGUAGE SQL AS 'SELECT TRUE';
CREATE FUNCTION is_store_recruitment_paused(UUID,TEXT,DATE) RETURNS BOOLEAN LANGUAGE SQL AS 'SELECT FALSE';
CREATE TABLE organizations(id UUID PRIMARY KEY);
CREATE TABLE customers(id UUID PRIMARY KEY,user_id UUID,organization_id UUID);
CREATE TABLE staff(id UUID PRIMARY KEY,user_id UUID,organization_id UUID,name TEXT,status TEXT);
CREATE TABLE stores(id UUID PRIMARY KEY,organization_id UUID,name TEXT,short_name TEXT,status TEXT);
CREATE TABLE organization_settings(organization_id UUID,custom_holidays JSONB);
CREATE TABLE scenario_masters(id UUID PRIMARY KEY,title TEXT,official_duration INT);
CREATE TABLE organization_scenarios(id UUID PRIMARY KEY,scenario_master_id UUID,organization_id UUID,override_title TEXT,duration INT,participation_fee INT,participation_costs JSONB,created_at TIMESTAMPTZ DEFAULT NOW(),accepts_private_booking BOOLEAN DEFAULT TRUE,scenario_kind TEXT DEFAULT 'regular');
CREATE TABLE reservations(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),title TEXT,reservation_number TEXT,scenario_id UUID,customer_id UUID,requested_datetime TIMESTAMPTZ,duration INT,participant_count INT,total_price INT,base_price INT DEFAULT 0,final_price INT DEFAULT 0,unit_price INT,options_price INT DEFAULT 0,discount_amount INT DEFAULT 0,status TEXT,customer_notes TEXT,organization_id UUID,customer_name TEXT,customer_email TEXT,customer_phone TEXT,candidate_datetimes JSONB,priority INT,reservation_type TEXT,reservation_source TEXT,private_group_id UUID,gm_staff UUID,store_id UUID,schedule_event_id UUID,confirmed_by UUID,updated_at TIMESTAMPTZ);
CREATE TABLE schedule_events(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),organization_id UUID,date DATE,store_id UUID,is_cancelled BOOLEAN DEFAULT FALSE,start_time TIME,end_time TIME,gms TEXT[],updated_at TIMESTAMPTZ,venue TEXT,scenario TEXT,start_at TIMESTAMPTZ,end_at TIMESTAMPTZ,gm_roles JSONB,is_reservation_enabled BOOLEAN,status TEXT,category TEXT,reservation_id UUID,reservation_name TEXT,is_reservation_name_overwritten BOOLEAN,time_slot TEXT);
CREATE TABLE schedule_blocked_slots(organization_id UUID,store_id TEXT,date DATE,time_slot TEXT);
CREATE TABLE private_groups(id UUID PRIMARY KEY,organization_id UUID,organizer_id UUID,scenario_master_id UUID,preferred_store_ids UUID[],reservation_id UUID,status TEXT DEFAULT 'gathering',updated_at TIMESTAMPTZ);
CREATE TABLE private_group_candidate_dates(id UUID DEFAULT gen_random_uuid(),group_id UUID,date DATE,time_slot TEXT,start_time TIME,end_time TIME,order_num INT,status TEXT);
CREATE TABLE staff_scenario_assignments(staff_id UUID,scenario_id UUID,can_main_gm BOOLEAN,can_sub_gm BOOLEAN);
CREATE TABLE gm_availability_responses(organization_id UUID,reservation_id UUID,staff_id UUID,response_status TEXT,available_candidates JSONB,UNIQUE(reservation_id,staff_id));
`)
await db.query('INSERT INTO organizations VALUES ($1)',[org])
await db.query('INSERT INTO customers VALUES ($1,$2,NULL)',[customer,user])
await db.query("INSERT INTO staff VALUES ($1,$2,$3,'Fixture GM','active')",[gm,user,org])
await db.query("INSERT INTO stores VALUES ($1,$2,'Fixture Store','Fixture','active')",[store,org])
await db.query("INSERT INTO scenario_masters VALUES ($1,'Monochrome pricing fixture',180)",[scenario])
const costs=[{time_slot:'normal',amount:5000,type:'fixed'},{time_slot:'weekend',amount:5500,type:'fixed'}]
await db.query('INSERT INTO organization_scenarios(id,scenario_master_id,organization_id,participation_fee,participation_costs) VALUES ($1,$1,$2,5000,$3)',[scenario,org,JSON.stringify(costs)])
await db.query("INSERT INTO organization_settings VALUES ($1,'[\"2026-09-15\"]')",[org])
const cand = date => ({date,timeSlot:'afternoon',startTime:'14:00',endTime:'17:00',unitPrice:1,totalPrice:6})
async function request(inputScenario=scenario, dates=['2026-10-19'], participants=6) {
 const payload={candidates:dates.map(cand),requestedStores:[{storeId:store}]}
 const group=(await db.query('INSERT INTO private_groups(id,organization_id,organizer_id,scenario_master_id,preferred_store_ids) VALUES (gen_random_uuid(),$1,$2,$3,ARRAY[$4]::uuid[]) RETURNING id',[org,user,scenario,store])).rows[0].id
 for (const [i,date] of dates.entries()) await db.query("INSERT INTO private_group_candidate_dates(group_id,date,time_slot,start_time,end_time,order_num,status) VALUES ($1,$2,'afternoon','14:00','17:00',$3,'pending')",[group,date,i+1])
 await db.exec('SET ROLE authenticated')
 let result
 try { result=await db.query("SELECT create_private_booking_request_with_notice($1,$2,'Fixture','fixture@example.invalid','00000000000',$5,$3,NULL,NULL,$4) AS id",[inputScenario,customer,JSON.stringify(payload),group,participants])
 } finally { await db.exec('RESET ROLE') }
 return result.rows[0].id
}
async function read(id) {return (await db.query('SELECT * FROM reservations WHERE id=$1',[id])).rows[0]}
async function approve(id,date) {
 return db.query("SELECT approve_private_booking($1,$2,'14:00','17:00',$3,$4,'{}','Fixture','Fixture')",[id,date,store,gm])
}

await db.exec(`
ALTER TABLE reservations ADD COLUMN scenario_master_id uuid;
ALTER TABLE staff_scenario_assignments ADD COLUMN scenario_master_id uuid, ADD COLUMN organization_id uuid;
CREATE TABLE private_booking_pricing_snapshots(reservation_id uuid PRIMARY KEY,organization_id uuid,base_fee integer,participation_costs jsonb,custom_holidays jsonb,pricing_date date);
CREATE FUNCTION resolve_preparation_minutes(uuid,uuid,uuid,uuid) RETURNS integer LANGUAGE sql AS 'SELECT 0';
`)
await db.exec(fs.readFileSync('supabase/rpcs/calculate_booking_participation_fee.sql','utf8'))
const migration='20260927013000_private_booking_notification_recipients.sql'
await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'))

await db.exec(`ALTER TABLE scenario_masters ADD COLUMN player_count_min integer DEFAULT 4, ADD COLUMN player_count_max integer DEFAULT 6;
ALTER TABLE organization_scenarios ADD COLUMN override_player_count_min integer, ADD COLUMN override_player_count_max integer;`)
const capacityMigration='20260927015000_private_booking_scenario_capacity.sql'
await db.exec(fs.readFileSync('supabase/migrations/'+capacityMigration,'utf8'))
await db.exec(`CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,is_organizer boolean,created_at timestamptz DEFAULT now());
CREATE TABLE private_group_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,member_id uuid,message text);
CREATE TABLE global_settings(organization_id uuid PRIMARY KEY,system_msg_booking_requested_title text,system_msg_booking_requested_body text);`)
const noticeMigration='20260927034000_private_booking_request_notice.sql'
const lockOrderMigration='20260927035000_private_booking_request_approve_lock_order.sql'
await db.exec(fs.readFileSync('supabase/migrations/'+noticeMigration,'utf8'))
await db.exec(fs.readFileSync('supabase/migrations/'+lockOrderMigration,'utf8'))
// 旧本体RPCをスタブ化せず、実際の認証・価格・予約・グループ・GM処理まで実行する。
await db.query("INSERT INTO global_settings VALUES($1,'組織の申込通知','返信をお待ちください')",[org])
await db.query("INSERT INTO global_settings VALUES('10000000-0000-0000-0000-000000000099','他社設定','公開禁止')")
await db.query('INSERT INTO staff_scenario_assignments(staff_id,scenario_master_id,organization_id,can_main_gm) VALUES($1,$2,$3,true)',[gm,scenario,org])
const requested=await request()
const reservation=await read(requested)
assert.equal(reservation.status,'pending')
const group=(await db.query('SELECT * FROM private_groups WHERE id=$1',[reservation.private_group_id])).rows[0]
assert.equal(group.status,'booking_requested');assert.equal(group.reservation_id,requested)
let messages=(await db.query('SELECT * FROM private_group_messages')).rows
assert.equal(messages.length,1)
let payload=JSON.parse(messages[0].message)
assert.equal(payload.reservationId,requested);assert.equal(payload.candidateCount,1)
assert.equal(payload.title,'組織の申込通知');assert.equal(payload.body,'返信をお待ちください')
assert.equal(messages[0].member_id,null)
const count=async table=>(await db.query('SELECT count(*)::int n FROM '+table)).rows[0].n
const tables=['reservations','private_booking_pricing_snapshots','gm_availability_responses','private_group_messages']
const before=await Promise.all(tables.map(count))
await db.exec(`CREATE FUNCTION fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture notice failure';END$$;
CREATE TRIGGER fail_notice BEFORE INSERT ON private_group_messages FOR EACH ROW EXECUTE FUNCTION fail_notice();`)
await assert.rejects(request(),/fixture notice failure/)
assert.deepEqual(await Promise.all(tables.map(count)),before)
assert.equal((await db.query("SELECT count(*)::int n FROM private_groups WHERE status='booking_requested'")).rows[0].n,1)
await db.exec('DROP TRIGGER fail_notice ON private_group_messages')
await db.exec("UPDATE global_settings SET system_msg_booking_requested_title='',system_msg_booking_requested_body=NULL WHERE organization_id='"+org+"'")
const next=await request(scenario,['2026-10-20','2026-10-21'])
payload=JSON.parse((await db.query('SELECT message FROM private_group_messages WHERE group_id=(SELECT private_group_id FROM reservations WHERE id=$1)',[next])).rows[0].message)
assert.equal(payload.title,'貸切リクエストを送信しました');assert.equal(payload.candidateCount,2)
// グループなし申込は従来どおり予約だけ作り、架空のチャット通知を追加しない。
const messageCount=await count('private_group_messages')
const publicPayload=JSON.stringify({candidates:[cand('2026-10-22')],requestedStores:[{storeId:store}]})
await db.exec('SET ROLE authenticated')
await db.query("SELECT create_private_booking_request_with_notice($1,$2,'Fixture','fixture@example.invalid','000',6,$3)",[scenario,customer,publicPayload])
await db.exec('RESET ROLE')
assert.equal(await count('private_group_messages'),messageCount)
// 認証失敗・匿名実行は通知を含む全処理を拒否。
const total=await count('reservations')
const args=[scenario,customer,JSON.stringify({candidates:[cand('2026-10-19')],requestedStores:[{storeId:store}]}),group.id]
await assert.rejects(db.query("SELECT create_private_booking_request_with_notice($1,$2,'Fixture','fixture@example.invalid','000',6,$3,NULL,NULL,$4)",args),e=>e.code==='22023')
// group statusだけ古くても未取消の予約があれば二重作成しない。
await db.query("UPDATE private_groups SET status='gathering' WHERE id=$1",[group.id])
await assert.rejects(db.query("SELECT create_private_booking_request_with_notice($1,$2,'Fixture','fixture@example.invalid','000',6,$3,NULL,NULL,$4)",args),e=>e.code==='22023')

await assert.rejects(db.query("SELECT create_private_booking_request_with_notice($1,gen_random_uuid(),'Fixture','fixture@example.invalid','000',6,'{}')",[scenario]),e=>e.code==='P0401')
await db.exec('SET ROLE anon')
await assert.rejects(db.query("SELECT create_private_booking_request_with_notice($1,$2,'Fixture','fixture@example.invalid','000',6,'{}')",[scenario,customer]),e=>e.code==='42501')
await db.exec('RESET ROLE');assert.equal(await count('reservations'),total)
const requestDef=(await db.query("SELECT pg_get_functiondef('public.create_private_booking_request_with_notice(uuid,uuid,text,text,text,integer,jsonb,text,text,uuid)'::regprocedure) AS d")).rows[0].d
assert.match(requestDef,/FOR SHARE NOWAIT/)
assert.match(requestDef,/lock_not_available/)
assert.match(requestDef,/55P03/)
const approveDef=(await db.query("SELECT pg_get_functiondef('public.approve_private_booking(uuid,date,time without time zone,time without time zone,uuid,uuid,jsonb,text,text,uuid)'::regprocedure) AS d")).rows[0].d
assert.match(approveDef,/FROM private_groups[\s\S]*FOR UPDATE NOWAIT/)
assert.match(approveDef,/この貸切グループは別の処理で更新中です/)
await db.exec(fs.readFileSync('supabase/rollbacks/'+lockOrderMigration,'utf8'))
await db.exec(fs.readFileSync('supabase/migrations/'+lockOrderMigration,'utf8'))
await db.exec(fs.readFileSync('supabase/rollbacks/'+noticeMigration,'utf8'))
await db.exec(fs.readFileSync('supabase/migrations/'+noticeMigration,'utf8'))
await db.exec(fs.readFileSync('supabase/migrations/'+lockOrderMigration,'utf8'))
assert.equal(await count('reservations'),total)
await db.close()
console.log('PASS private request notice: real request RPC, org template/fallback, no organizer row, counts, transaction rollback incl pricing/GM/group, auth/anonymous, lock-order NOWAIT, rollback/reapply')

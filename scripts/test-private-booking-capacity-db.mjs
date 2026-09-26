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
CREATE TABLE private_groups(id UUID PRIMARY KEY,organization_id UUID,organizer_id UUID,scenario_master_id UUID,preferred_store_ids UUID[],reservation_id UUID,status TEXT,updated_at TIMESTAMPTZ);
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
 const {rows}=await db.query("SELECT create_private_booking_request($1,$2,'Fixture','fixture@example.invalid','00000000000',$5,$3,NULL,NULL,$4) AS id",[inputScenario,customer,JSON.stringify(payload),group,participants])
 return rows[0].id
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
for(const n of [4,6]){const id=await request(scenario,undefined,n);assert.equal((await read(id)).participant_count,n)}
const orgScenario='20000000-0000-0000-0000-000000000099'
await db.query('UPDATE organization_scenarios SET id=$1',[orgScenario])
assert.equal((await read(await request(orgScenario,undefined,6))).participant_count,6)
async function rejected(n,code='P0025'){
 const before=(await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n
 await assert.rejects(request(scenario,undefined,n),e=>e.code===code)
 assert.equal((await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n,before)
}
for(const n of [-1,0,null,3,7,51])await rejected(n)
await db.exec('UPDATE organization_scenarios SET override_player_count_min=7,override_player_count_max=8')
await rejected(6)
for(const n of [7,8])assert.equal((await read(await request(scenario,undefined,n))).participant_count,n)
await rejected(9)
await db.exec('UPDATE organization_scenarios SET override_player_count_min=0')
await rejected(7,'P0051')
await db.exec('UPDATE organization_scenarios SET override_player_count_min=9')
await rejected(7,'P0051')
await db.exec('UPDATE organization_scenarios SET override_player_count_min=NULL,override_player_count_max=NULL')
await db.exec('UPDATE scenario_masters SET player_count_max=NULL')
await rejected(6,'P0051')
await db.exec('UPDATE scenario_masters SET player_count_max=6')
const before=(await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n
await db.exec(fs.readFileSync('supabase/rollbacks/'+capacityMigration,'utf8'))
await db.exec(fs.readFileSync('supabase/migrations/'+capacityMigration,'utf8'))
assert.equal((await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n,before)
await rejected(7)
await db.close()
console.log('PASS private booking capacity: master/organization bounds, null/nonpositive count, invalid configuration, no partial reservation, rollback/reapply')

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
async function request(dates=['2026-09-14','2026-09-19']) {
 const payload={candidates:dates.map(cand),requestedStores:[{storeId:store}]}
 const group=(await db.query('INSERT INTO private_groups(id,organization_id,organizer_id,scenario_master_id,preferred_store_ids) VALUES (gen_random_uuid(),$1,$2,$3,ARRAY[$4]::uuid[]) RETURNING id',[org,user,scenario,store])).rows[0].id
 for (const [i,date] of dates.entries()) await db.query("INSERT INTO private_group_candidate_dates(group_id,date,time_slot,start_time,end_time,order_num,status) VALUES ($1,$2,'afternoon','14:00','17:00',$3,'pending')",[group,date,i+1])
 const {rows}=await db.query("SELECT create_private_booking_request($1,$2,'Fixture','fixture@example.invalid','00000000000',6,$3,NULL,NULL,$4) AS id",[scenario,customer,JSON.stringify(payload),group])
 return rows[0].id
}
async function read(id) {return (await db.query('SELECT * FROM reservations WHERE id=$1',[id])).rows[0]}
async function approve(id,date) {
 return db.query("SELECT approve_private_booking($1,$2,'14:00','17:00',$3,$4,'{}','Fixture','Fixture')",[id,date,store,gm])
}
// Reproduce the deployed implementation: both Saturday request and approval retain 30,000.
await db.exec(fs.readFileSync('supabase/migrations/20260909190000_restore_private_booking_acceptance_guard.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260821140000_approve_private_booking_allow_time_override.sql','utf8'))
const legacy=await request(['2026-09-19'])
assert.equal((await read(legacy)).total_price,30000)
await approve(legacy,'2026-09-19')
assert.equal((await read(legacy)).total_price,30000)
await db.exec('DELETE FROM schedule_events')
await db.exec(fs.readFileSync('supabase/rpcs/calculate_booking_participation_fee.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260914121000_fix_private_weekend_pricing.sql','utf8'))
if (process.env.LIVE_PRIVATE_SQL) await db.exec(fs.readFileSync(process.env.LIVE_PRIVATE_SQL,'utf8'))
const id=await request()
let row=await read(id)
assert.equal(row.total_price,30000)
assert.equal(row.final_price,30000)
assert.equal(row.unit_price,5000)
assert.deepEqual(row.candidate_datetimes.candidates.map(c=>c.totalPrice),[30000,33000])
// Price edits after request must not change the accepted quote.
await db.query("UPDATE organization_scenarios SET participation_costs='[{\"time_slot\":\"weekend\",\"amount\":9000}]'")
await approve(id,'2026-09-19')
row=await read(id)
assert.equal(row.unit_price,5500)
assert.equal(row.total_price,33000)
assert.equal(row.final_price,33000)
assert.equal(row.candidate_datetimes.candidates[1].totalPrice,33000)
assert.equal((await read(legacy)).total_price,30000)
// Legacy requests without captured terms retain their accepted totals on approval.
await approve(legacy,'2026-09-20').then(()=>assert.fail('unrequested date accepted'), e=>assert.match(e.message,/INVALID_SELECTED_CANDIDATE/))
await db.exec('DELETE FROM schedule_events')
await approve(legacy,'2026-09-19')
assert.equal((await read(legacy)).total_price,30000)
await db.exec('DELETE FROM schedule_events')
await db.query('UPDATE organization_scenarios SET participation_costs=$1',[JSON.stringify(costs)])
for (const date of ['2026-09-15','2026-09-20','2026-09-21']) {
 const id=await request([date]);assert.equal((await read(id)).total_price,33000)
 await approve(id,date);assert.equal((await read(id)).final_price,33000)
 await db.exec('DELETE FROM schedule_events')
}
// Security: customers cannot read or mutate accepted pricing terms.
for (const role of ['anon','authenticated']) {
 const {rows}=await db.query("SELECT has_table_privilege($1,'private_booking_pricing_snapshots','SELECT') AS read, has_table_privilege($1,'private_booking_pricing_snapshots','UPDATE') AS write",[role])
 assert.deepEqual(rows[0],{read:false,write:false})
}
console.log('PASS: deployed private undercharge reproduced; mixed candidate quotes, chosen-date approval, forged client prices ignored, post-request price changes frozen, holidays, legacy preservation, and snapshot ACLs verified')
await db.close()

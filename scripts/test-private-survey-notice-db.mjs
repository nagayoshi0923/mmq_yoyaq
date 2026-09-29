import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const read = p => fs.readFileSync(p,'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.org',true),'')::uuid$$;
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.admin',true),'false')='true'$$;
CREATE TABLE email_logs(id uuid,organization_id uuid,reservation_id uuid,to_email text,body_text text,email_type text,provider_message_id text,sent_at timestamptz,status text,error_message text);
CREATE TABLE staff(user_id uuid,organization_id uuid,status text);
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,reservation_id uuid,scenario_master_id uuid,status text);
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,private_group_id uuid,schedule_event_id uuid,store_id uuid,status text,customer_id uuid,customer_email text,customer_name text,created_at timestamptz DEFAULT now());
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,store_id uuid,date date,organization_scenario_id uuid,scenario_master_id uuid,scenario_id uuid,is_cancelled boolean);
CREATE TABLE stores(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE organization_scenarios(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid,characters jsonb,extra_preparation_time integer);
CREATE TABLE email_settings(id uuid,organization_id uuid,store_id uuid);
CREATE TABLE reservation_settings(organization_id uuid,store_id uuid);
CREATE TABLE performance_schedule_settings(organization_id uuid,store_id uuid,default_duration integer);
CREATE TABLE operating_setting_overrides(organization_id uuid,store_id uuid,organization_scenario_id uuid,schedule_event_id uuid,settings jsonb);
CREATE TABLE global_settings(organization_id uuid,pre_reading_notice_message text);
CREATE TABLE customers(id uuid PRIMARY KEY,organization_id uuid,email text,name text);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,status text);
CREATE TABLE private_group_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,member_id uuid,message text,created_at timestamptz DEFAULT now());
CREATE TABLE private_group_survey_deadlines(group_id uuid PRIMARY KEY,organization_id uuid,deadline_at timestamptz);
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`)
for(const name of ['get_operating_setting_default','resolve_operating_setting','parse_announced_survey_deadline','get_private_group_survey_settings','freeze_private_group_survey_deadline']) await db.exec(read(`supabase/rpcs/${name}.sql`))
const migration=read('supabase/migrations/20260927050000_private_survey_delivery.sql')
await db.exec(migration)
await db.query("INSERT INTO staff VALUES($1,$2,'active'),($3,$2,'inactive')",[id(1),id(10),id(2)])
await db.query('INSERT INTO stores VALUES($1,$2)',[id(30),id(10)])
await db.query("INSERT INTO organization_scenarios VALUES($1,$2,$3,'[]',NULL)",[id(21),id(10),id(20)])
await db.query("INSERT INTO schedule_events VALUES($1,$2,$3,'2030-01-20',$4,$5,NULL,false)",[id(40),id(10),id(30),id(21),id(20)])
await db.query("INSERT INTO reservations VALUES($1,$2,$3,$4,$5,'confirmed',NULL,'current@example.invalid','Current','2029-01-01')",[id(50),id(10),id(60),id(40),id(30)])
await db.query("INSERT INTO private_groups VALUES($1,$2,$3,$4,'confirmed')",[id(60),id(10),id(50),id(20)])
await db.query('INSERT INTO operating_setting_overrides VALUES($1,NULL,NULL,NULL,$2)',[id(10),JSON.stringify({survey_enabled:true,survey_deadline_days:7,survey_url:'https://example.invalid/current'})])
const actor = async(n=1,org=10,admin=false,role='authenticated') => {
 await db.exec('RESET ROLE')
 await db.query("SELECT set_config('test.uid',$1,false),set_config('test.org',$2,false),set_config('test.admin',$3,false)",[n?id(n):'',id(org),String(admin)])
 await db.exec(`SET ROLE ${role}`)
}
const call = async(request=100,reservation=50) => (await db.query('SELECT send_private_group_survey_notice($1,$2,$3) AS result',[id(60),id(request),id(reservation)])).rows[0].result
const state = async()=> {await db.exec('RESET ROLE');return (await db.query('SELECT (SELECT count(*) FROM private_group_messages)::int AS messages,(SELECT count(*) FROM private_group_survey_deliveries)::int AS deliveries,(SELECT count(*) FROM private_group_survey_deadlines)::int AS deadlines')).rows[0]}
await actor();assert.equal((await call()).status,'pending');assert.equal((await call()).replayed,true)
assert.deepEqual(await state(),{messages:1,deliveries:1,deadlines:1})
let delivery=(await db.query('SELECT * FROM private_group_survey_deliveries')).rows[0]
assert.equal(delivery.customer_email,'current@example.invalid');assert.match(delivery.message_body,/1\/13まで/)
assert.equal((await db.query('SELECT member_id FROM private_group_messages')).rows[0].member_id,null)
// Pending or uncertain deliveries cannot be duplicated by a new request UUID.
await actor();await assert.rejects(call(101),e=>e.code==='55000')
const history=(await db.query('SELECT get_private_group_survey_deliveries($1) AS result',[id(60)])).rows[0].result
assert.equal(history.has_unresolved,true);assert.equal(history.reservation_id,id(50))
assert.equal(JSON.stringify(history).includes('current@example.invalid'),false)
await state();await db.exec("UPDATE private_group_survey_deliveries SET status='uncertain'")
await actor();await assert.rejects(call(101),e=>e.code==='55000')
await state();await db.exec("UPDATE private_group_survey_deliveries SET status='sent'")
// An explicit new request after delivery is a legitimate resend. Transport retry is not.
await actor();assert.equal((await call(101)).replayed,false);assert.equal((await state()).deliveries,2)
await db.exec("UPDATE private_group_survey_deliveries SET status='sent'")
for(const args of [[null,10,false,'anon'],[2],[3],[3,11,true]]) {
 const before=await state();await actor(...args);await assert.rejects(call(102),e=>e.code==='42501');await assert.rejects(db.query('SELECT get_private_group_survey_deliveries($1)',[id(60)]),e=>e.code==='42501');assert.deepEqual(await state(),before)
}
await actor(3,10,true);await assert.rejects(call(100),e=>e.code==='22023');await state()
const rollback = async fn=>{await db.exec('RESET ROLE;BEGIN');try{await fn()}finally{await db.exec('ROLLBACK;RESET ROLE')}}
// No newer linked reservation may replace the group's explicitly selected reservation.
await rollback(async()=>{
 await db.query("INSERT INTO schedule_events SELECT $1,organization_id,store_id,'2030-02-20',organization_scenario_id,scenario_master_id,scenario_id,false FROM schedule_events",[id(41)])
 await db.query("INSERT INTO reservations SELECT $1,organization_id,private_group_id,$2,store_id,status,NULL,'wrong@example.invalid','Wrong','2029-12-01' FROM reservations",[id(51),id(41)])
 await db.exec('DELETE FROM private_group_survey_deadlines')
 await actor();await call(103);await state()
 const row=(await db.query('SELECT * FROM private_group_survey_deliveries WHERE id=$1',[id(103)])).rows[0]
 assert.equal(row.schedule_event_id,id(40));assert.equal(row.customer_email,'current@example.invalid');assert.match(row.message_body,/1\/13まで/)
})
for(const mutation of ["UPDATE private_groups SET reservation_id=NULL","UPDATE private_groups SET status='cancelled'","UPDATE reservations SET status='cancelled'","UPDATE reservations SET private_group_id=NULL","UPDATE schedule_events SET is_cancelled=true","UPDATE schedule_events SET organization_id='00000000-0000-0000-0000-000000000099'","UPDATE operating_setting_overrides SET settings='{\"survey_enabled\":false}'"]) {
 await rollback(async()=>{await db.exec(mutation);const before=await state();await actor();await db.exec('SAVEPOINT denied');await assert.rejects(call(104));await db.exec('ROLLBACK TO denied');assert.deepEqual(await state(),before)})
}
// Chat failure or queue failure rolls back the frozen deadline and every other insert.
for(const table of ['private_group_messages','private_group_survey_deliveries']) await rollback(async()=>{
 await db.exec(`DELETE FROM private_group_survey_deadlines;CREATE FUNCTION fail_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture failure';END$$;CREATE TRIGGER fail_write BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_write()`)
 const before=await state();await actor();await db.exec('SAVEPOINT denied');await assert.rejects(call(105),/fixture failure/);await db.exec('ROLLBACK TO denied');assert.deepEqual(await state(),before)
})
// Browser roles cannot directly inspect recipients or manipulate delivery state.
for(const role of ['anon','authenticated']) {await actor(1,10,false,role);await assert.rejects(db.query('SELECT * FROM private_group_survey_deliveries'),e=>e.code==='42501')}
await db.exec('RESET ROLE')
const saved=await state()
await db.exec(read('supabase/rollbacks/20260927050000_private_survey_delivery.sql'))
await actor();await assert.rejects(call(110),e=>e.code==='42501')
assert.deepEqual(await state(),saved)
await db.exec(migration)
await actor();assert.equal((await call(100)).replayed,true)
assert.deepEqual(await state(),saved)
await db.close()
console.log('PASS survey notice: actual resolver, current reservation, same-org active staff/admin, atomic chat+deadline+outbox, idempotency, denial and rollback')

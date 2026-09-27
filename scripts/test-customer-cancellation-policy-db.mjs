import fs from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.org',true),'')::uuid$$;
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.admin',true),'false')='true'$$;
CREATE TABLE customers(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE staff(user_id uuid,organization_id uuid,status text);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,current_participants int,is_cancelled boolean,updated_at timestamptz);
CREATE TABLE private_groups(id uuid PRIMARY KEY,status text,updated_at timestamptz,organization_id uuid,reservation_id uuid);
CREATE TABLE global_settings(organization_id uuid,system_msg_booking_cancelled_title text,system_msg_booking_cancelled_body text);
CREATE TABLE private_group_messages(id uuid DEFAULT gen_random_uuid(),group_id uuid,sender_type text,message text);
CREATE TABLE reservations(id uuid PRIMARY KEY,schedule_event_id uuid,status text,customer_id uuid,organization_id uuid,private_group_id uuid,participant_count int,cancelled_at timestamptz,cancellation_reason text,updated_at timestamptz);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
`)
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.query('INSERT INTO customers VALUES ($1,$2),($3,$4)',[id(1),id(11),id(2),id(12)])
await db.query("INSERT INTO staff VALUES ($1,$2,'active'),($3,$2,'inactive'),($4,$5,'active')",[id(13),id(21),id(14),id(15),id(22)])
const reset = async () => {
  await db.exec('RESET ROLE; DELETE FROM private_group_messages; DELETE FROM global_settings; DELETE FROM reservations; DELETE FROM schedule_events; DELETE FROM private_groups;')
  await db.query("INSERT INTO private_groups VALUES ($1,'confirmed',NULL,'00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000051')",[id(31)])
  await db.query('INSERT INTO schedule_events(id,current_participants,is_cancelled,updated_at) VALUES ($1,2,false,NULL)',[id(41)])
  await db.query("INSERT INTO reservations(id,schedule_event_id,status,customer_id,organization_id,private_group_id,participant_count,cancelled_at,cancellation_reason,updated_at) VALUES ($1,$2,'confirmed',$3,$4,$5,2,NULL,NULL,NULL)",[id(51),id(41),id(2),id(21),id(31)])
}
const actor = async (user,org=id(21),admin=false,role='authenticated') => {
  await db.query("SELECT set_config('test.uid',$1,false),set_config('test.org',$2,false),set_config('test.admin',$3,false)",[user||'',org||'',String(admin)])
  await db.exec(`SET ROLE ${role}`)
}
const call = name => db.query(`SELECT ${name}($1::uuid,$2::uuid,$3::text) AS ok`,[id(51),id(1),'fixture'])
const names=['cancel_reservation_with_lock','cancel_reservation_and_group_with_lock']
await db.exec(fs.readFileSync('supabase/migrations/20260927038000_cancellation_owner_binding.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260927039000_cancellation_group_notice.sql','utf8'))
await db.exec('GRANT EXECUTE ON FUNCTION public.cancel_reservation_and_group_with_lock(uuid,uuid,text) TO service_role')
const cancel = () => call('cancel_reservation_and_group_with_notice')
const saved = async () => {
  await db.exec('RESET ROLE')
  return { reservation:(await db.query('SELECT status FROM reservations WHERE id=$1',[id(51)])).rows[0].status,
    group:(await db.query('SELECT status FROM private_groups')).rows[0]?.status,
    count:(await db.query('SELECT current_participants FROM schedule_events')).rows[0].current_participants,
    messages:(await db.query('SELECT * FROM private_group_messages')).rows }
}
await db.exec(`
ALTER TABLE schedule_events ADD organization_id uuid, ADD date date, ADD start_time time, ADD is_private_booking boolean, ADD category text;
ALTER TABLE reservations ADD reservation_source text, ADD cancellation_policy_snapshot_version smallint,
ADD cancellation_policy_store_id uuid,ADD cancellation_policy_performance_type text,ADD cancellation_policy_deadline_hours int,
ADD cancellation_policy_fee_basis text,ADD cancellation_policy_updated_at timestamptz,ADD cancellation_policy_fees jsonb;
CREATE FUNCTION resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('value',coalesce(nullif(current_setting(CASE WHEN $2='private_cancellation_deadline_hours' THEN 'test.private_deadline' ELSE 'test.deadline' END,true),''),'48')::jsonb) $$;
`)
const ddl=fs.readFileSync('supabase/migrations/20260927043000_customer_cancellation_policy_guard.sql','utf8')
await db.exec(ddl)
await db.exec(fs.readFileSync('supabase/migrations/20260927040000_close_legacy_group_cancellation.sql','utf8'))
const prepare=async(hours=240,snapshot=true)=>{
 await reset();await db.query("SELECT set_config('test.deadline','48',false)")
 await db.query("UPDATE schedule_events SET organization_id=$1,date=((statement_timestamp()+$2*interval '1 hour') AT TIME ZONE 'Asia/Tokyo')::date,start_time=((statement_timestamp()+$2*interval '1 hour') AT TIME ZONE 'Asia/Tokyo')::time,is_private_booking=false",[id(21),hours])
 await db.exec('UPDATE reservations SET private_group_id=NULL')
 if(snapshot)await db.query("UPDATE reservations SET cancellation_policy_snapshot_version=1,cancellation_policy_store_id=$1,cancellation_policy_performance_type='open',cancellation_policy_deadline_hours=48,cancellation_policy_fee_basis='participant_total',cancellation_policy_updated_at=now(),cancellation_policy_fees='[]'::jsonb",[id(61)])
}
for(const mutate of ["UPDATE reservations SET cancellation_policy_deadline_hours=300", "UPDATE reservations SET cancellation_policy_fees='[{\"hours_before\":300,\"fee_percentage\":50,\"description\":\"fee\"}]'::jsonb"]){
 await prepare();await db.exec(mutate);await actor(id(12));await assert.rejects(cancel(),e=>e.code==='P0052');assert.equal((await saved()).reservation,'confirmed')
}
for(const mutate of ["UPDATE reservations SET cancellation_policy_fees=NULL","UPDATE reservations SET cancellation_policy_fees='[{\"hours_before\":300}]'::jsonb",'UPDATE reservations SET cancellation_policy_store_id=NULL','UPDATE schedule_events SET date=NULL',"UPDATE schedule_events SET organization_id='00000000-0000-0000-0000-000000000022'"]){
 await prepare();await db.exec(mutate);await actor(id(12));await assert.rejects(cancel(),e=>e.code==='P0053');assert.equal((await saved()).reservation,'confirmed')
}
await prepare();await db.query("SELECT set_config('test.deadline','9999',false)");await actor(id(12));await cancel();assert.equal((await saved()).reservation,'cancelled')
await prepare(240,false);await db.query("SELECT set_config('test.deadline','300',false)");await actor(id(12));await assert.rejects(cancel(),e=>e.code==='P0052');await saved()
await prepare(240,false);await actor(id(12));await cancel();assert.equal((await saved()).reservation,'cancelled')
await prepare(24);await db.exec('UPDATE reservations SET cancellation_policy_deadline_hours=0');await actor(id(12));await assert.rejects(cancel(),e=>e.code==='P0052');await saved()
await prepare(24);await actor(id(13));await cancel();assert.equal((await saved()).reservation,'cancelled')
await prepare(240);await db.query('UPDATE reservations SET private_group_id=$1',[id(31)]);await actor(id(12));await cancel();assert.equal((await saved()).messages.length,1)
await prepare(24);await db.exec(fs.readFileSync('supabase/rollbacks/20260927043000_customer_cancellation_policy_guard.sql','utf8'));await actor(id(12));await cancel();await saved()
await db.exec(ddl);await prepare(24);await actor(id(12));await assert.rejects(cancel(),e=>e.code==='P0052');await saved()
// Exact boundary uses one SQL statement timestamp for both event and guard.
for (const [hours, feeRules, expected] of [
 [48, [], true], [47.999, [], false],
 [48, [{hours_before:48,fee_percentage:50,description:'boundary'}], false],
 [48.001, [{hours_before:48,fee_percentage:50,description:'boundary'}], true],
 [240, [{hours_before:300,fee_percentage:50,description:'first'},{hours_before:300,fee_percentage:0,description:'last'}], true],
 [240, [{hours_before:300,fee_percentage:0,description:'first'},{hours_before:300,fee_percentage:50,description:'last'}], false],
]) {
 await prepare();await db.query('UPDATE reservations SET cancellation_policy_fees=$1::jsonb',[JSON.stringify(feeRules)])
 await actor(id(12));await db.exec('RESET ROLE')
 const exact=()=>db.exec(`DO $$BEGIN
 UPDATE schedule_events SET date=((statement_timestamp()+interval '${hours} hours') AT TIME ZONE 'Asia/Tokyo')::date,
 start_time=((statement_timestamp()+interval '${hours} hours') AT TIME ZONE 'Asia/Tokyo')::time;
 SET LOCAL ROLE authenticated;
 PERFORM cancel_reservation_and_group_with_notice('${id(51)}'::uuid,NULL::uuid,'boundary');
 END $$; RESET ROLE;`)
 if(expected)await exact();else await assert.rejects(exact(),e=>e.code==='P0052')
 assert.equal((await saved()).reservation,expected?'cancelled':'confirmed')
}
await prepare(700);await db.exec("UPDATE reservations SET cancellation_policy_performance_type='private',cancellation_policy_deadline_hours=0");await actor(id(12));await assert.rejects(cancel(),e=>e.code==='P0052');await saved()
for(const value of ['null','"48"','-1']) {
 await prepare(240,false);await db.query("SELECT set_config('test.deadline',$1,false)",[value]);await actor(id(12));await assert.rejects(cancel(),e=>e.code==='P0053');await saved()
}
await prepare();await actor(id(12));await assert.rejects(db.query('SELECT assert_customer_cancellation_policy($1)',[id(51)]),e=>e.code==='42501');await saved()
await prepare();await actor(null,null,false,'anon');await assert.rejects(cancel(),e=>e.code==='42501');await saved()
await prepare();await actor(id(11));await assert.rejects(cancel(),e=>e.code==='P0009');await saved()
await prepare(240,false);await db.exec("UPDATE schedule_events SET category='private'; SELECT set_config('test.private_deadline','720',false)");await actor(id(12));await assert.rejects(cancel(),e=>e.code==='P0052');assert.equal((await saved()).reservation,'confirmed')
console.log('PASS: real customer RPC policy gate: frozen policy, legacy resolver, deadlines, fees, incomplete/malformed snapshots, event org, staff bypass, notice, rollback/reapply')
await db.close()

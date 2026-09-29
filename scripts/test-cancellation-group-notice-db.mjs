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
  await db.query('INSERT INTO schedule_events VALUES ($1,2,false,NULL)',[id(41)])
  await db.query("INSERT INTO reservations VALUES ($1,$2,'confirmed',$3,$4,$5,2,NULL,NULL,NULL)",[id(51),id(41),id(2),id(21),id(31)])
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
for (const [mutation,code] of [
  ["UPDATE private_groups SET organization_id='00000000-0000-0000-0000-000000000022'",'P0050'],
  ['DELETE FROM private_groups','P0050'],
  ["UPDATE private_groups SET reservation_id='00000000-0000-0000-0000-000000000052'",'P0051'],
  ['UPDATE private_groups SET reservation_id=NULL','P0051'],
]) {
  await reset(); await db.exec(mutation); await actor(id(12))
  await assert.rejects(cancel(),e=>e.code===code)
  const result=await saved(); assert.equal(result.reservation,'confirmed');assert.equal(result.count,2);assert.equal(result.messages.length,0)
}
// Insertion failure rolls back reservation, group and capacity changes.
await db.exec("CREATE FUNCTION fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture notice failure'; END$$; CREATE TRIGGER fail_notice BEFORE INSERT ON private_group_messages FOR EACH ROW EXECUTE FUNCTION fail_notice();")
await reset();await actor(id(12));await assert.rejects(cancel(),/fixture notice failure/)
assert.deepEqual(await saved(),{reservation:'confirmed',group:'confirmed',count:2,messages:[]})
await db.exec('DROP TRIGGER fail_notice ON private_group_messages')
for (const [user,admin] of [[id(12),false],[id(13),false],[id(16),true]]) {
 await reset();await db.query('INSERT INTO global_settings VALUES ($1,$2,$3)',[id(21),'組織タイトル','組織本文']);await db.query('INSERT INTO global_settings VALUES ($1,$2,$3)',[id(22),'別組織','別本文'])
 await actor(user,id(21),admin);assert.equal((await cancel()).rows[0].ok,true)
 const result=await saved();assert.equal(result.reservation,'cancelled');assert.equal(result.group,'cancelled');assert.equal(result.count,0);assert.equal(result.messages.length,1)
 assert.deepEqual(JSON.parse(result.messages[0].message),{type:'system',action:'booking_cancelled',reservationId:id(51),title:'組織タイトル',body:'組織本文'})
 await actor(user,id(21),admin);await assert.rejects(cancel(),e=>e.code==='P0005');assert.equal((await saved()).messages.length,1)
}
await reset();await db.query("INSERT INTO reservations(id,schedule_event_id,status,participant_count) VALUES ($1,$2,'checked_in',3)",[id(52),id(41)])
await actor(id(12));await cancel();assert.equal((await saved()).count,3)
await reset();await db.exec('UPDATE schedule_events SET is_cancelled=NULL');await actor(id(12));await cancel();assert.equal((await saved()).count,0)
await reset();await db.exec('UPDATE schedule_events SET is_cancelled=true,current_participants=7');await actor(id(12));await cancel();assert.equal((await saved()).count,7)
await reset();await db.exec('UPDATE reservations SET private_group_id=NULL');await actor(id(12));await cancel();assert.equal((await saved()).messages.length,0)
await reset();await actor(id(11));await assert.rejects(cancel(),e=>e.code==='P0009');assert.equal((await saved()).reservation,'confirmed')
await reset();await actor(null,null,false,'anon');await assert.rejects(cancel(),e=>e.code==='42501');assert.equal((await saved()).reservation,'confirmed')
await reset();await actor(id(12));await cancel();assert.equal(JSON.parse((await saved()).messages[0].message).body,'fixture')
// Rollback and reapply preserve the preceding ownership fix.
await db.exec(fs.readFileSync('supabase/rollbacks/20260927039000_cancellation_group_notice.sql','utf8'))
await reset();await actor(id(11));await assert.rejects(call('cancel_reservation_and_group_with_lock'),e=>e.code==='P0009');await db.exec('RESET ROLE')
await db.exec(fs.readFileSync('supabase/migrations/20260927039000_cancellation_group_notice.sql','utf8'))
await reset();await actor(id(12));await cancel();assert.equal((await saved()).messages.length,1)
if (process.argv.includes('--closure')) {
 const close=fs.readFileSync('supabase/migrations/20260927040000_close_legacy_group_cancellation.sql','utf8')
 const restore=fs.readFileSync('supabase/rollbacks/20260927040000_close_legacy_group_cancellation.sql','utf8')
 await db.exec(close)
 for (const role of ['authenticated','anon']) {
   await reset();await actor(id(12),id(21),false,role)
   await assert.rejects(call('cancel_reservation_and_group_with_lock'),e=>e.code==='42501')
   assert.equal((await saved()).reservation,'confirmed')
 }
 await reset();await actor(id(12));await cancel();assert.equal((await saved()).messages.length,1)
 await db.exec('CREATE TRIGGER fail_notice BEFORE INSERT ON private_group_messages FOR EACH ROW EXECUTE FUNCTION fail_notice()')
 await reset();await actor(id(12));await assert.rejects(cancel(),/fixture notice failure/)
 assert.deepEqual(await saved(),{reservation:'confirmed',group:'confirmed',count:2,messages:[]})
 await db.exec('DROP TRIGGER fail_notice ON private_group_messages')
 // Production old ACL explicitly includes service_role; model that precondition below in fixture setup.
 assert.equal((await db.query("SELECT has_function_privilege('service_role','public.cancel_reservation_and_group_with_lock(uuid,uuid,text)','EXECUTE') AS ok")).rows[0].ok,true)
 await db.exec(restore);await reset();await actor(id(12));await call('cancel_reservation_and_group_with_lock');assert.equal((await saved()).reservation,'cancelled')
 await db.exec(close);await reset();await actor(id(12));await cancel();assert.equal((await saved()).messages.length,1)
 console.log('PASS: closure denies direct auth/anon, preserves real authenticated wrapper cancellation+notice+failure rollback, service privilege, ACL restore/reapply')
}
console.log('PASS: group tenant/link validation, owner/staff/admin, atomic notice failure rollback, templates, capacity/checked-in/cancelled events, no-group, anon/forgery denial, duplicate rejection, rollback/reapply')
await db.close()

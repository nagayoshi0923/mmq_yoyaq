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
await db.exec(fs.readFileSync('supabase/migrations/20260927040000_close_legacy_group_cancellation.sql','utf8'))
const migration=fs.readFileSync('supabase/migrations/20260927042000_plain_cancellation_staff_boundary.sql','utf8')
const rollback=fs.readFileSync('supabase/rollbacks/20260927042000_plain_cancellation_staff_boundary.sql','utf8')
await db.exec(migration)
const calls=[()=>call('cancel_reservation_with_lock'),()=>db.query('SELECT cancel_reservation_with_lock($1::uuid,$2::text) AS ok',[id(51),'fixture'])]
for (const plain of calls) {
 for (const [user,org,admin,role] of [[id(12),id(21),false,'authenticated'],[id(14),id(21),false,'authenticated'],[id(15),id(22),false,'authenticated'],[id(16),id(22),true,'authenticated'],[null,null,false,'anon'],[null,null,false,'service_role']]) {
  await reset();await actor(user,org,admin,role)
  await assert.rejects(plain(),e=>e.code==='P0009')
  assert.deepEqual(await saved(),{reservation:'confirmed',group:'confirmed',count:2,messages:[]})
 }
 for (const [user,admin] of [[id(13),false],[id(16),true]]) {
  await reset();await actor(user,id(21),admin);assert.equal((await plain()).rows[0].ok,true)
  assert.deepEqual(await saved(),{reservation:'cancelled',group:'confirmed',count:0,messages:[]})
 }
 await reset();await db.exec('UPDATE schedule_events SET is_cancelled=NULL');
 await db.query("INSERT INTO reservations(id,schedule_event_id,status,participant_count) VALUES ($1,$2,'checked_in',3)",[id(52),id(41)])
 await actor(id(13));await plain();assert.equal((await saved()).count,3)
 await reset();await db.exec('UPDATE schedule_events SET is_cancelled=true,current_participants=7');await actor(id(13));await plain();assert.equal((await saved()).count,7)
}
// Actual normal customer wrapper remains authorized and records the group notice.
await reset();await actor(id(12));await cancel();const normal=await saved();assert.equal(normal.group,'cancelled');assert.equal(normal.messages.length,1)
// Owner-delegated store cancellation under pre-held event/reservation locks remains callable.
await db.exec(`CREATE FUNCTION fixture_store_cancel() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM schedule_events FOR UPDATE;
 PERFORM 1 FROM reservations ORDER BY id FOR UPDATE;
 UPDATE schedule_events SET is_cancelled=true;
 RETURN cancel_reservation_with_lock('00000000-0000-0000-0000-000000000051'::uuid,NULL::uuid,'store');
END $$;`)
await reset();await actor(id(13));assert.equal((await db.query('SELECT fixture_store_cancel() AS ok')).rows[0].ok,true);assert.equal((await saved()).count,2)
// A failed capacity update must roll back the reservation cancellation.
await db.exec("CREATE FUNCTION fail_capacity() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture capacity failure';END$$; CREATE TRIGGER fail_capacity BEFORE UPDATE ON schedule_events FOR EACH ROW EXECUTE FUNCTION fail_capacity();")
await reset();await actor(id(13));await assert.rejects(calls[0](),/fixture capacity failure/);assert.equal((await saved()).reservation,'confirmed');await db.exec('DROP TRIGGER fail_capacity ON schedule_events')
await db.exec(rollback)
for(const plain of calls){await reset();await actor(id(12));assert.equal((await plain()).rows[0].ok,true);await saved()}
await db.exec(migration)
for(const plain of calls){await reset();await actor(id(12));await assert.rejects(plain(),e=>e.code==='P0009');await saved()}
console.log('PASS: both plain signatures staff-only; wrong/inactive/anonymous actors denied; normal customer notice path retained; checked-in/NULL/cancelled capacity; delegated locked staff path; failure rollback; restore/reapply')
await db.close()

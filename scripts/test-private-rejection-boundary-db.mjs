import fs from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.org',true),'')::uuid$$;
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('test.admin',true),'')::boolean,false)$$;
CREATE TABLE staff(user_id uuid,organization_id uuid,status text);
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,private_group_id uuid,status text);
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,reservation_id uuid,organizer_id uuid,status text);
CREATE TABLE private_group_candidate_dates(id uuid PRIMARY KEY,group_id uuid,status text);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;`)
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const reset=async()=>{
 await db.exec('RESET ROLE;DELETE FROM private_group_candidate_dates;DELETE FROM private_groups;DELETE FROM reservations;DELETE FROM staff')
 await db.query("INSERT INTO staff VALUES($1,$2,'active'),($3,$2,'inactive'),($4,$5,'active')",[id(1),id(10),id(2),id(3),id(11)])
 await db.query("INSERT INTO reservations VALUES($1,$2,$3,'cancelled')",[id(20),id(10),id(30)])
 await db.query("INSERT INTO private_groups VALUES($1,$2,$3,$4,'confirmed')",[id(30),id(10),id(20),id(4)])
 await db.query("INSERT INTO private_group_candidate_dates VALUES($1,$2,'selected'),($3,$2,'pending')",[id(40),id(30),id(41)])
}
const actor=async(uid=id(1),org=id(10),admin=false,role='authenticated')=>{
 await db.query("SELECT set_config('test.uid',$1,false),set_config('test.org',$2,false),set_config('test.admin',$3,false)",[uid||'',org||'',admin===null?'':String(admin)])
 await db.exec(`SET ROLE ${role}`)
}
const call=()=>db.query('SELECT mark_private_group_rejected_after_booking_rejection($1)',[id(20)])
const saved=async()=>{await db.exec('RESET ROLE');return {
 groups:(await db.query('SELECT * FROM private_groups ORDER BY id')).rows,
 reservations:(await db.query('SELECT * FROM reservations ORDER BY id')).rows,
 candidates:(await db.query('SELECT * FROM private_group_candidate_dates ORDER BY id')).rows,
}}
const migration=fs.readFileSync('supabase/migrations/20260927044000_private_rejection_boundary.sql','utf8')
const lockWait=fs.readFileSync('supabase/migrations/20260927054000_private_rejection_lock_wait.sql','utf8')
const rollback=fs.readFileSync('supabase/rollbacks/20260927044000_private_rejection_boundary.sql','utf8')
const lockWaitRollback=fs.readFileSync('supabase/rollbacks/20260927054000_private_rejection_lock_wait.sql','utf8')
await db.exec(rollback)
await db.exec('REVOKE ALL ON FUNCTION mark_private_group_rejected_after_booking_rejection(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION mark_private_group_rejected_after_booking_rejection(uuid) TO authenticated,anon,service_role')
const acl=(await db.query("SELECT proacl::text AS acl FROM pg_proc WHERE oid='mark_private_group_rejected_after_booking_rejection(uuid)'::regprocedure")).rows[0].acl
// Reproduce the current old entry: organizer may reset an active request; any org admin may reset a foreign group.
for (const args of [[id(4),null,false],[id(5),id(11),true]]) {
 await reset();await db.exec("UPDATE reservations SET status='confirmed'");await actor(...args);await call();assert.equal((await saved()).groups[0].status,'date_adjusting')
}
// The actual production helper returns false for anon; do not mislabel anonymous execution privilege as a proven bypass.
await reset();await actor(null,null,false,'anon');await assert.rejects(call(),e=>e.code==='P0010');await saved()
await db.exec(migration)
await db.exec(lockWait)
assert.equal((await db.query("SELECT proacl::text AS acl FROM pg_proc WHERE oid='mark_private_group_rejected_after_booking_rejection(uuid)'::regprocedure")).rows[0].acl,acl)
assert.equal(
  (await db.query("SELECT pg_get_functiondef('mark_private_group_rejected_after_booking_rejection(uuid)'::regprocedure) AS def")).rows[0].def.includes('FOR UPDATE NOWAIT'),
  false
)
assert.match(
  (await db.query("SELECT pg_get_functiondef('mark_private_group_rejected_after_booking_rejection(uuid)'::regprocedure) AS def")).rows[0].def,
  /FOR UPDATE/
)
for(const args of [[null,null,null,'anon'],[null,null,null,'authenticated'],[null,null,null,'service_role'],[id(2),id(10),false],[id(3),id(11),false],[id(4),id(10),null],[id(5),id(11),true],[id(6),id(10),null]]) {
 await reset();const before=await saved();await actor(...args);await assert.rejects(call(),e=>e.code==='42501');assert.deepEqual(await saved(),before)
}
for(const args of [[id(1),id(10),false],[id(5),id(10),true]]) {
 await reset();await actor(...args);await call();const after=await saved()
 assert.equal(after.groups[0].status,'date_adjusting');assert.ok(after.candidates.every(c=>c.status==='rejected'));assert.equal(after.reservations[0].status,'cancelled')
 // A retry must preserve candidates added after the first rejection.
 await db.query("INSERT INTO private_group_candidate_dates VALUES($1,$2,'pending')",[id(42),id(30)])
 const before=await saved();await actor(...args);await call();assert.deepEqual(await saved(),before)
}
for(const [sql,code] of [
 ["UPDATE reservations SET status='confirmed'",'22023'],["UPDATE reservations SET status=NULL",'22023'],
 ["UPDATE private_groups SET organization_id='00000000-0000-0000-0000-000000000011'",'P0050'],
 ["UPDATE private_groups SET reservation_id=NULL",'P0051'],
 ["UPDATE private_groups SET reservation_id='00000000-0000-0000-0000-000000000021'",'P0051'],
 ["UPDATE private_groups SET status='cancelled'",'22023'],["UPDATE private_groups SET status='gathering'",'22023'],["UPDATE private_groups SET status=NULL",'22023'],
 ['DELETE FROM private_groups','P0050'],['DELETE FROM reservations','P0005'],
]) {
 await reset();await db.exec(sql);const before=await saved();await actor();await assert.rejects(call(),e=>e.code===code);assert.deepEqual(await saved(),before)
}
await reset();await db.exec("UPDATE private_groups SET status='booking_requested'");await actor();await call();assert.equal((await saved()).groups[0].status,'date_adjusting')
await reset();await db.exec('UPDATE reservations SET private_group_id=NULL');const noGroup=await saved();await actor();await call();assert.deepEqual(await saved(),noGroup)
await reset();await db.exec("CREATE FUNCTION fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture candidate failure';END$$;CREATE TRIGGER fixture_fail BEFORE UPDATE ON private_group_candidate_dates FOR EACH ROW EXECUTE FUNCTION fixture_fail()")
const before=await saved();await actor();await assert.rejects(call(),/fixture candidate failure/);assert.deepEqual(await saved(),before);await db.exec('DROP TRIGGER fixture_fail ON private_group_candidate_dates')
await db.exec(lockWaitRollback)
assert.match(
  (await db.query("SELECT pg_get_functiondef('mark_private_group_rejected_after_booking_rejection(uuid)'::regprocedure) AS def")).rows[0].def,
  /FOR UPDATE NOWAIT/
)
await db.exec(rollback);await reset();await actor(id(4),null,false);await call();assert.equal((await saved()).groups[0].status,'date_adjusting')
await db.exec(migration);await db.exec(lockWait);await reset();await actor(null,null,null,'anon');await assert.rejects(call(),e=>e.code==='42501')
console.log('PASS: old organizer and foreign admin bypass reproduced; production anon denial retained; staff/admin tenant and active membership; anonymous/customer/inactive denied; cancelled reservation/current group link; safe retry; lock wait; all-write rollback; ACL preserved; restore/reapply')
await db.close()

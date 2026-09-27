import fs from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,organizer_id uuid,status text,reservation_id uuid,updated_at timestamptz);
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,private_group_id uuid,status text);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`)
await db.exec(fs.readFileSync('supabase/migrations/20260927041000_cancel_unrequested_private_group.sql','utf8'))
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const reset=async(status='gathering')=>{
 await db.exec('RESET ROLE;DELETE FROM reservations;DELETE FROM private_groups')
 await db.query('INSERT INTO private_groups VALUES($1,$2,$3,$4,NULL,NULL)',[id(1),id(2),id(3),status])
}
const actor=async(uid=id(3),role='authenticated')=>{await db.query("SELECT set_config('test.uid',$1,false)",[uid||'']);await db.exec(`SET ROLE ${role}`)}
const cancel=()=>db.query('SELECT cancel_unrequested_private_group($1) AS ok',[id(1)])
const status=async()=>{await db.exec('RESET ROLE');return (await db.query('SELECT status FROM private_groups')).rows[0].status}
for(const state of ['gathering','date_adjusting','cancelled']){
 await reset(state);await actor();assert.equal((await cancel()).rows[0].ok,true);assert.equal(await status(),'cancelled')
}
for(const state of ['booking_requested','confirmed',null]){
 await reset(state);await actor();await assert.rejects(cancel(),e=>e.code==='22023');assert.equal(await status(),state)
}
for(const [uid,role] of [[id(4),'authenticated'],[null,'authenticated'],[null,'anon']]){
 await reset();await actor(uid,role);await assert.rejects(cancel(),e=>e.code==='42501');assert.equal(await status(),'gathering')
}
for(const linked of [true,false])for(const state of ['pending','confirmed','gm_confirmed','checked_in',null]){
 await reset();await db.query('INSERT INTO reservations VALUES($1,$2,$3,$4)',[id(5),id(2),id(1),state])
 if(linked)await db.query('UPDATE private_groups SET reservation_id=$1',[id(5)])
 await actor();await assert.rejects(cancel(),e=>e.code==='22023');assert.equal(await status(),'gathering')
 assert.equal((await db.query('SELECT status FROM reservations')).rows[0].status,state)
}
await reset('date_adjusting');await db.query("INSERT INTO reservations VALUES($1,$2,$3,'cancelled')",[id(5),id(2),id(1)]);await db.query('UPDATE private_groups SET reservation_id=$1',[id(5)]);await actor();await cancel();assert.equal(await status(),'cancelled')
for(const mutation of [
 "UPDATE private_groups SET reservation_id='00000000-0000-0000-0000-000000000005'",
 "INSERT INTO reservations VALUES('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000001','cancelled')"
]){await reset();await db.exec(mutation);await actor();await assert.rejects(cancel(),e=>e.code==='P0051');assert.equal(await status(),'gathering')}
await reset();await db.exec("CREATE FUNCTION fail_update() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture failure';END$$;CREATE TRIGGER fail_update AFTER UPDATE ON private_groups FOR EACH ROW EXECUTE FUNCTION fail_update()")
await actor();await assert.rejects(cancel(),/fixture failure/);assert.equal(await status(),'gathering');await db.exec('DROP TRIGGER fail_update ON private_groups')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927041000_cancel_unrequested_private_group.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20260927041000_cancel_unrequested_private_group.sql','utf8'));await reset();await actor();await cancel();assert.equal(await status(),'cancelled')
console.log('PASS: organizer only, prebooking states/idempotence, linked and reverse-linked live reservations denied, cancelled history preserved, malformed linkage, rollback and reapply')
await db.close()

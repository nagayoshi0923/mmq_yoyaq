import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const org='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002'
const alice='20000000-0000-0000-0000-000000000001', bob='20000000-0000-0000-0000-000000000002'
const orphan='30000000-0000-0000-0000-000000000004'
const event='30000000-0000-0000-0000-000000000001', legacy='30000000-0000-0000-0000-000000000002', duplicate='30000000-0000-0000-0000-000000000003'
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE staff(id uuid PRIMARY KEY, organization_id uuid, name text UNIQUE);
CREATE TABLE schedule_events(id uuid PRIMARY KEY, organization_id uuid, gms text[], gm_roles jsonb, notes text, updated_at timestamptz DEFAULT now());
INSERT INTO organizations VALUES('${org}'),('${other}');
INSERT INTO staff VALUES('${alice}','${org}','Alice'),('${bob}','${other}','Bob');
INSERT INTO schedule_events(id,organization_id,gms,gm_roles) VALUES
('${event}','${org}',ARRAY['Alice'],'{"Alice":"reception"}'),
('${legacy}','${org}',ARRAY['unregistered'],'{}'),
('${duplicate}','${org}',ARRAY['Alice','Alice'],'{}'),
('${orphan}','${org}',ARRAY['Alice'],'{"Old Alice":"observer"}');`)
await db.exec(fs.readFileSync('supabase/migrations/20260921120000_event_staff_identity.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260921123000_confirm_event_staff_roles.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260927009000_event_staff_lock_order.sql','utf8'))
const rows=async(id=event)=>(await db.query('SELECT staff_id,staff_name,role,resolution_status,ordinal FROM schedule_event_staff_assignments WHERE event_id=$1 ORDER BY ordinal',[id])).rows
assert.equal((await rows())[0].staff_id,alice)
assert.equal((await rows(legacy))[0].resolution_status,'unmatched')
assert.equal((await rows(duplicate)).length,2)
assert.ok((await rows(duplicate)).every(x=>x.resolution_status==='duplicate' && x.staff_id===null))
console.log('PASS exact identities, unknown history, and duplicate positions are preserved')
assert.equal((await db.query('SELECT role_confirmed FROM schedule_event_staff_assignments WHERE event_id=$1',[orphan])).rows[0].role_confirmed,false)
await db.query("UPDATE schedule_events SET gm_roles='{}' WHERE id=$1",[orphan])
assert.equal((await db.query('SELECT role_confirmed FROM schedule_event_staff_assignments WHERE event_id=$1',[orphan])).rows[0].role_confirmed,false,'removing orphan keys does not confirm a role')
await db.query("UPDATE staff SET name='AfterRename' WHERE id=$1",[alice])
assert.equal((await db.query('SELECT role_confirmed FROM schedule_event_staff_assignments WHERE event_id=$1',[orphan])).rows[0].role_confirmed,false,'rename preserves unconfirmed role by staff ID')
await db.query("UPDATE staff SET name='Alice' WHERE id=$1",[alice])
await db.query("UPDATE schedule_events SET gms=ARRAY['Alice'] WHERE id=$1",[duplicate])
assert.equal((await rows(duplicate))[0].staff_id,alice)
await db.query("UPDATE schedule_events SET gm_roles=jsonb_build_object('Alice','reception') WHERE id=$1",[orphan])
assert.equal((await db.query('SELECT role_confirmed FROM schedule_event_staff_assignments WHERE event_id=$1',[orphan])).rows[0].role_confirmed,true)
console.log('PASS uncertain legacy role is flagged; explicit role confirmation and duplicate correction resolve normally')
await db.query("UPDATE staff SET name='Renamed' WHERE id=$1",[alice])
assert.equal((await rows())[0].staff_id,alice)
assert.equal((await rows())[0].role,'reception')
assert.equal((await rows())[0].staff_name,'Renamed')
assert.deepEqual((await db.query('SELECT gm_roles FROM schedule_events WHERE id=$1',[event])).rows[0].gm_roles,{Renamed:'reception'})
console.log('PASS staff rename atomically preserves identity and role')
await assert.rejects(db.query("UPDATE schedule_events SET gm_roles=jsonb_build_object('Alice','staff') WHERE id=$1",[event]))
assert.equal((await rows())[0].role,'reception')
console.log('PASS stale name-keyed roles cannot reset a renamed staff role')
const before=await rows()
await assert.rejects(db.query("UPDATE schedule_events SET gms=ARRAY['Renamed','Bob'] WHERE id=$1",[event]))
assert.deepEqual(await rows(),before)
await assert.rejects(db.query("UPDATE schedule_events SET gms=ARRAY['Renamed','Renamed'] WHERE id=$1",[event]))
await assert.rejects(db.query("UPDATE schedule_events SET gm_roles='{}'::jsonb || jsonb_build_object('Renamed','invalid') WHERE id=$1",[event]))
assert.deepEqual(await rows(),before)
await assert.rejects(db.query('UPDATE staff SET organization_id=$1 WHERE id=$2',[other,alice]))
await assert.rejects(db.query('UPDATE schedule_events SET organization_id=$1 WHERE id=$2',[other,event]))
await assert.rejects(db.query('DELETE FROM staff WHERE id=$1',[alice]))
console.log('PASS foreign staff, duplicate writes, invalid roles, organization moves, and historical deletion rejected atomically')
await db.query("UPDATE schedule_events SET notes='history edit',gm_roles='{"+'"unregistered":"observer"'+"}' WHERE id=$1",[legacy])
assert.equal((await rows(legacy))[0].resolution_status,'unmatched')
await db.query("INSERT INTO staff VALUES(gen_random_uuid(),$1,'unregistered')",[org])
await db.query("UPDATE schedule_events SET gm_roles='{"+'"unregistered":"staff"'+"}' WHERE id=$1",[legacy])
assert.equal((await rows(legacy))[0].staff_id,null)
console.log('PASS historical unknown names never bind to a newly created namesake')
await db.exec(`CREATE FUNCTION injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
CREATE TRIGGER fail AFTER UPDATE ON schedule_events FOR EACH ROW EXECUTE FUNCTION injected_failure();`)
await assert.rejects(db.query("UPDATE staff SET name='Rollback' WHERE id=$1",[alice]))
assert.equal((await db.query('SELECT name FROM staff WHERE id=$1',[alice])).rows[0].name,'Renamed')
assert.deepEqual(await rows(),before)
await db.exec('DROP TRIGGER fail ON schedule_events')
console.log('PASS downstream failure rolls back name, roles and assignments')
await db.query("UPDATE schedule_events SET gms='{}',gm_roles='{}' WHERE id=$1",[event])
assert.deepEqual(await rows(),[])
console.log('PASS explicit zero staff clears assignments')
for(const role of ['anon','authenticated']) for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])
  assert.equal((await db.query("SELECT has_table_privilege($1,'schedule_event_staff_assignments',$2) allowed",[role,privilege])).rows[0].allowed,false)
for(const signature of ['sync_event_staff_identity()','rename_event_staff_identity()']) for(const role of ['anon','authenticated','service_role'])
  assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,signature])).rows[0].allowed,false)
console.log('PASS browser roles have no access and trigger helpers are not callable')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927009000_event_staff_lock_order.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rollbacks/20260921123000_confirm_event_staff_roles.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rollbacks/20260921120000_event_staff_identity.sql','utf8'))
assert.equal((await db.query("SELECT name FROM staff WHERE id=$1",[alice])).rows[0].name,'Renamed')
assert.equal((await db.query('SELECT count(*)::int n FROM schedule_events')).rows[0].n,4)
console.log('PASS rollback preserves existing event data')
await db.close()

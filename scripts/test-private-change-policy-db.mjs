import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''fixture.user'',true),'''')::uuid';
CREATE TABLE stores(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,store_id uuid,category text,is_private_booking boolean,date date,start_time time);
CREATE TABLE organization_scenarios(id uuid,organization_id uuid,scenario_master_id uuid);
CREATE TABLE staff(user_id uuid,organization_id uuid,status text);
CREATE TABLE users(id uuid,organization_id uuid,role text);
CREATE TABLE fixture_settings(scope uuid PRIMARY KEY,value jsonb);
CREATE FUNCTION resolve_operating_setting(o uuid,k text,d jsonb,s uuid,sc uuid,e uuid) RETURNS jsonb LANGUAGE sql AS
' SELECT COALESCE((SELECT value FROM fixture_settings WHERE scope=e),(SELECT value FROM fixture_settings WHERE scope=s),(SELECT value FROM fixture_settings WHERE scope=o),jsonb_build_object(''value'',d))';
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,store_id uuid,schedule_event_id uuid,scenario_master_id uuid,private_group_id uuid,reservation_source text,reservation_type text,participant_count integer DEFAULT 6,requested_datetime timestamptz,reservation_change_deadline_hours_snapshot integer,cancellation_policy_snapshot_version integer DEFAULT 1,cancellation_policy_store_id uuid);
-- The cancellation trigger owns its immutable store marker; exercised with the actual trigger on staging too.
CREATE FUNCTION fixture_cancellation_marker() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN NEW.cancellation_policy_store_id:=NEW.store_id;
 ELSE NEW.cancellation_policy_store_id:=COALESCE(OLD.cancellation_policy_store_id,NEW.store_id); END IF;
 RETURN NEW; END $$;
CREATE TRIGGER z_cancel_marker BEFORE INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION fixture_cancellation_marker();`)
for(const [n,org] of [[2,1],[3,1],[4,9]])await db.query('INSERT INTO stores VALUES($1,$2)',[id(n),id(org)])
await db.query("INSERT INTO schedule_events VALUES($1,$2,$3,'private',true,current_date+20,'14:00')",[id(5),id(1),id(2)])
for(const [n,value] of [[1,72],[2,48],[3,12],[5,24]])await db.query('INSERT INTO fixture_settings VALUES($1,$2)',[id(n),JSON.stringify({value})])
const migration='20260927016000_private_change_policy_first_store.sql'
await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'))
await db.exec('CREATE TRIGGER a_change_policy BEFORE INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION set_reservation_change_policy_snapshot()')
async function create(n,{version=1,privateBooking=true}={}){
 await db.query("INSERT INTO reservations(id,organization_id,reservation_source,reservation_type,requested_datetime,cancellation_policy_snapshot_version) VALUES($1,$2,$3,$4,now()+interval '1 day',$5)",[id(n),id(1),privateBooking?'web_private':'web',privateBooking?'private_booking':'normal',version])
}
const value=async n=>(await db.query('SELECT reservation_change_deadline_hours_snapshot v FROM reservations WHERE id=$1',[id(n)])).rows[0].v
await create(10);assert.equal(await value(10),72)
await db.query('UPDATE reservations SET store_id=$1,schedule_event_id=$2,reservation_change_deadline_hours_snapshot=999 WHERE id=$3',[id(2),id(5),id(10)])
assert.equal(await value(10),24,'first store/event overrides provisional organization value')
await db.query('UPDATE reservations SET store_id=NULL,schedule_event_id=NULL WHERE id=$1',[id(10)])
await db.query('UPDATE reservations SET store_id=$1,reservation_change_deadline_hours_snapshot=999 WHERE id=$2',[id(3),id(10)])
assert.equal(await value(10),24,'unlink/relink cannot refreeze')
await create(11,{version:null});await db.query('UPDATE reservations SET store_id=$1 WHERE id=$2',[id(2),id(11)]);assert.equal(await value(11),72,'legacy history remains unchanged')
await create(12,{privateBooking:false});await db.query('UPDATE reservations SET store_id=$1 WHERE id=$2',[id(2),id(12)]);assert.equal(await value(12),72)
for(const [n,v] of [[13,0],[14,null]]){
 await create(n);await db.query('UPDATE fixture_settings SET value=$1 WHERE scope=$2',[JSON.stringify({value:v}),id(2)])
 await db.query('UPDATE reservations SET store_id=$1 WHERE id=$2',[id(2),id(n)]);assert.equal(await value(n),v)
}
await create(15)
await assert.rejects(db.query('UPDATE reservations SET store_id=$1 WHERE id=$2',[id(4),id(15)]),e=>e.code==='23514')
await assert.rejects(db.query('UPDATE reservations SET store_id=$1,schedule_event_id=$2 WHERE id=$3',[id(3),id(5),id(15)]),e=>e.code==='23514')
await db.query("SELECT set_config('fixture.user',$1,false)",[id(20)])
await assert.rejects(db.query('UPDATE reservations SET store_id=$1,participant_count=5 WHERE id=$2',[id(2),id(15)]),e=>e.code==='P0050')
assert.equal(await value(15),72,'expired customer cannot bypass old deadline while binding store')
await db.query("INSERT INTO staff VALUES($1,$2,'active')",[id(20),id(1)])
await db.query('UPDATE reservations SET store_id=$1,participant_count=5 WHERE id=$2',[id(2),id(15)])
assert.equal(await value(15),null)
// Cancellation snapshots existed before change-deadline snapshots. Preserve those old NULLs.
await db.exec('ALTER TABLE reservations DISABLE TRIGGER a_change_policy')
await db.query("INSERT INTO reservations(id,organization_id,reservation_source,reservation_type,requested_datetime,reservation_change_deadline_hours_snapshot) VALUES($1,$2,'web_private','private_booking',now()+interval '20 days',NULL),($3,$2,'web_private','private_booking',now()+interval '20 days',72)",[id(16),id(1),id(17)])
await db.exec('ALTER TABLE reservations ENABLE TRIGGER a_change_policy')
await db.query('UPDATE fixture_settings SET value=$1 WHERE scope=$2',[JSON.stringify({value:48}),id(2)])
for(const [n,expected] of [[16,null],[17,48]]){
 await db.query('UPDATE reservations SET store_id=$1 WHERE id=$2',[id(2),id(n)]);assert.equal(await value(n),expected)
}
await db.query('UPDATE fixture_settings SET value=$1 WHERE scope=$2',[JSON.stringify({value:null}),id(1)])
await create(18);assert.equal(await value(18),null)
await db.query('UPDATE reservations SET store_id=$1 WHERE id=$2',[id(2),id(18)])
assert.equal(await value(18),48,'new NULL is distinguishable from legacy unrestricted history')
await db.exec(fs.readFileSync('supabase/rollbacks/'+migration,'utf8'))
await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'))
assert.equal(await value(10),24)
await db.close()
console.log('PASS private change policy: first store/event, frozen history, unlink/relink, legacy, zero/null, tenant, expired customer, staff, rollback/reapply')

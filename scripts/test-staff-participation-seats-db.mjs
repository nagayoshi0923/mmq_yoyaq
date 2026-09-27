import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.org',true),'')::uuid$$;
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE users(id uuid PRIMARY KEY,role text);
CREATE TABLE staff(id uuid PRIMARY KEY,organization_id uuid,name text,status text);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,is_cancelled boolean DEFAULT false,max_participants int,capacity int,scenario text,scenario_master_id uuid,store_id uuid,date date,start_time time,end_time time);
CREATE TABLE schedule_event_staff_assignments(event_id uuid,staff_id uuid,role text);
CREATE TABLE reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,schedule_event_id uuid,reservation_number text,title text,scenario_master_id uuid,store_id uuid,customer_id uuid,customer_name text,customer_notes text,requested_datetime timestamptz,duration int,participant_count int,participant_names text[],assigned_staff text[],base_price int,options_price int,total_price int,discount_amount int,final_price int,payment_method text,payment_status text,status text,reservation_source text,created_by uuid,created_at timestamptz DEFAULT now());
CREATE TABLE audit_logs(user_id uuid,organization_id uuid,action text,resource_type text,resource_id uuid,old_values jsonb,new_values jsonb);
INSERT INTO organizations VALUES('${id(1)}'),('${id(2)}');INSERT INTO users VALUES('${id(10)}','admin'),('${id(11)}','customer');
INSERT INTO staff VALUES('${id(21)}','${id(1)}','A','active'),('${id(22)}','${id(1)}','B','active'),('${id(23)}','${id(2)}','A','active');
INSERT INTO schedule_events VALUES('${id(30)}','${id(1)}',false,2,2,'Test',NULL,NULL,'2026-11-01','15:30','18:30');
INSERT INTO schedule_event_staff_assignments VALUES('${id(30)}','${id(21)}','staff'),('${id(30)}','${id(22)}','staff');
INSERT INTO reservations(id,organization_id,schedule_event_id,reservation_number,participant_count,participant_names,status,reservation_source,total_price,final_price)
VALUES('${id(40)}','${id(1)}','${id(30)}','web-1',2,ARRAY['A','B'],'confirmed','web',10000,10000);
SELECT set_config('test.actor','${id(10)}',false),set_config('test.org','${id(1)}',false);`)
await db.exec(`ALTER TABLE staff ADD COLUMN user_id uuid;
CREATE TABLE schedule_event_history(schedule_event_id uuid,organization_id uuid,changed_by_user_id uuid,changed_by_staff_id uuid,changed_by_name text,action_type text,changes jsonb,old_values jsonb,new_values jsonb,event_date date,store_id uuid,time_slot text,notes text);
ALTER TABLE schedule_events ADD COLUMN time_slot text;
ALTER TABLE schedule_events ADD COLUMN gms text[] DEFAULT ARRAY['A','B'],ADD COLUMN gm_roles jsonb DEFAULT '{"A":"staff","B":"staff"}';
CREATE FUNCTION fixture_assignments() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 DELETE FROM schedule_event_staff_assignments WHERE event_id=NEW.id;
 INSERT INTO schedule_event_staff_assignments SELECT NEW.id,s.id,coalesce(NEW.gm_roles->>s.name,'main') FROM staff s WHERE s.organization_id=NEW.organization_id AND s.name=ANY(NEW.gms);
 RETURN NEW;END $$;
CREATE TRIGGER fixture_assignments AFTER UPDATE OF gms,gm_roles ON schedule_events FOR EACH ROW EXECUTE FUNCTION fixture_assignments();`)
const migration=fs.readFileSync('supabase/migrations/20260928001200_staff_participation_seats.sql','utf8')
await db.exec(migration)
const read=async()=> (await db.query('SELECT get_event_staff_participations($1) value',[id(30)])).rows[0].value
let desiredStaff={gms:['A','B'],gm_roles:{A:'staff',B:'staff'}}
const save=async(entries,expected=[],expectedStaff=desiredStaff) => (await db.query('SELECT sync_event_staff_participations($1,$2::jsonb,$3::jsonb,$4::text[],$5::jsonb,$6::jsonb) value',[id(30),JSON.stringify(entries),JSON.stringify(expected),desiredStaff.gms,JSON.stringify(desiredStaff.gm_roles),JSON.stringify(expectedStaff)])).rows[0].value
const entry=(n,mode='included',reservation=id(40))=>({staff_id:id(n),mode,reservation_id:reservation})
let state=await save([entry(21),entry(22)])
assert.equal((await db.query('SELECT sum(participant_count) n FROM reservations')).rows[0].n,2,'included participants do not consume another seat')
assert.equal(state.entries.length,2)
assert.equal((await db.query('SELECT total_price FROM reservations WHERE id=$1',[id(40)])).rows[0].total_price,10000)
await assert.rejects(save([entry(21),entry(22)],[]),/更新されました/)
await assert.rejects(save([entry(21),entry(22,'additional',null)],state.entries),/定員2名に対して3名/)
assert.deepEqual((await read()).entries,state.entries,'over-capacity does not partially change links')
await assert.rejects(save([entry(21)],state.entries),/参加ごとに/)
await assert.rejects(save([entry(21),entry(21)],state.entries),/重複/)
const initialStaff=desiredStaff;desiredStaff={gms:['A','B'],gm_roles:{A:'staff',B:'main'}}
await assert.rejects(save([entry(21,'additional',null)],state.entries,initialStaff),/定員/)
assert.deepEqual((await read()).assignment,initialStaff,'roles also roll back on seat failure')
desiredStaff=initialStaff
await db.exec(`SELECT set_config('test.actor','${id(11)}',false)`)
await assert.rejects(read(),/権限/);await assert.rejects(save([],state.entries),/権限/)
await db.exec(`SELECT set_config('test.actor','${id(10)}',false),set_config('test.org','${id(2)}',false)`)
await assert.rejects(read(),/権限/);await assert.rejects(save([],state.entries),/公演/)
await db.exec(`SELECT set_config('test.org','${id(1)}',false);UPDATE schedule_events SET max_participants=4;`)
state=await save([entry(21,'additional',null),entry(22,'additional',null)],state.entries)
const ids=state.entries.map(e=>e.reservation_id)
assert.equal((await db.query("SELECT sum(participant_count) n FROM reservations WHERE status='confirmed'")).rows[0].n,4)
const again=await save(state.entries,state.entries)
assert.deepEqual(again.entries,state.entries,'re-save does not double book')
await db.exec(`UPDATE reservations SET total_price=500 WHERE id='${ids[0]}'`)
const modified=await read();assert.equal(modified.entries.find(e=>e.staff_id===id(21)).needs_confirmation,true)
await db.exec('UPDATE schedule_events SET max_participants=5;')
const recovered=await save([entry(21,'additional',null),state.entries.find(e=>e.staff_id===id(22))],modified.entries)
assert.equal((await db.query('SELECT status FROM reservations WHERE id=$1',[ids[0]])).rows[0].status,'confirmed','changed old seat remains untouched')
assert.notEqual(recovered.entries.find(e=>e.staff_id===id(21)).reservation_id,ids[0])
// restore isolated fixture to the pre-case state for late-error coverage
await db.exec(`DELETE FROM event_staff_participations WHERE staff_id='${id(21)}';DELETE FROM reservations WHERE id='${recovered.entries.find(e=>e.staff_id===id(21)).reservation_id}';UPDATE reservations SET total_price=0 WHERE id='${ids[0]}';INSERT INTO event_staff_participations VALUES('${id(30)}','${id(21)}','${id(1)}','${ids[0]}','additional');UPDATE schedule_events SET max_participants=4;`)
// Force a late insert failure after cancellations and an earlier successful insert.
await db.exec(`CREATE FUNCTION fixture_late_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.customer_notes='B' THEN RAISE EXCEPTION 'fixture late failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fixture_late_failure BEFORE INSERT ON reservations FOR EACH ROW EXECUTE FUNCTION fixture_late_failure();`)
await assert.rejects(save([entry(21,'additional',null),entry(22,'additional',null)],state.entries),/fixture late failure/)
assert.deepEqual((await read()).entries,state.entries)
assert.equal((await db.query("SELECT count(*) n FROM reservations WHERE status='confirmed'")).rows[0].n,3,'old seats and no partial new seat after late failure')
await db.exec('DROP TRIGGER fixture_late_failure ON reservations;')
state=await save([entry(21),entry(22)],state.entries)
assert.equal((await db.query("SELECT count(*) n FROM reservations WHERE id=ANY($1::uuid[]) AND status='cancelled'",[ids])).rows[0].n,2)
await db.exec("UPDATE reservations SET participant_count=1 WHERE reservation_source='web'")
assert.ok((await read()).entries.every(e=>e.needs_confirmation),'decreased booking invalidates all ambiguous included links')
await db.exec("UPDATE reservations SET participant_count=2 WHERE reservation_source='web'")
await db.exec(`UPDATE reservations SET status='cancelled' WHERE id='${id(40)}'`)
assert.ok((await read()).entries.every(e=>e.needs_confirmation),'cancelled booking requires explicit reconfirmation')
await db.exec(`UPDATE reservations SET status='confirmed' WHERE id='${id(40)}'`)
const oldStaff=desiredStaff;desiredStaff={gms:[],gm_roles:{}}
state=await save([],state.entries,oldStaff)
assert.equal(state.entries.length,0)
assert.equal((await db.query('SELECT status FROM reservations WHERE id=$1',[id(40)])).rows[0].status,'confirmed','customer booking remains when roles removed')
const emptyStaff=desiredStaff;desiredStaff={gms:['A','B'],gm_roles:{A:'staff',B:'staff'}}
state=await save([entry(21),entry(22)],[],emptyStaff)
await db.exec(`DELETE FROM reservations WHERE id='${id(40)}'`)
state=await read()
assert.ok(state.entries.every(e=>e.needs_confirmation&&e.reservation_id===null),'booking delete succeeds and requires reconfirmation')
const previousStaff=desiredStaff;desiredStaff={gms:[],gm_roles:{}}
await save([],state.entries,previousStaff)
await db.exec(fs.readFileSync('supabase/rollbacks/20260928001200_staff_participation_seats.sql','utf8'))
await db.exec(migration)
assert.equal((await read()).entries.length,0)
await db.close()
console.log('PASS included/extra seats, capacity, stale save, duplicate staff, organization/auth boundary, idempotent save, late-error rollback, customer booking/price preservation, rollback/reapply')

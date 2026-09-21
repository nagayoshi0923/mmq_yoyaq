import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const id='10000000-0000-0000-0000-000000000001', empty='10000000-0000-0000-0000-000000000002'
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE scenario_masters(id uuid PRIMARY KEY,title text,author text);
CREATE TABLE organization_scenarios(scenario_master_id uuid,license_amount integer);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,scenario_master_id uuid,category text,is_cancelled boolean);
CREATE TABLE external_performance_reports(scenario_master_id uuid,status text,performance_count integer);
CREATE TABLE reservations(id uuid PRIMARY KEY,schedule_event_id uuid);
CREATE INDEX idx_reservations_schedule_event_id ON reservations(schedule_event_id);
CREATE INDEX idx_reservations_event ON reservations(schedule_event_id);
INSERT INTO scenario_masters VALUES('${id}','example','author'),('${empty}','empty','author');
INSERT INTO organization_scenarios VALUES('${id}',1000),('${id}',1000),('${id}',2000);
INSERT INTO schedule_events VALUES(gen_random_uuid(),'${id}','open',false),(gen_random_uuid(),'${id}','private',false),(gen_random_uuid(),'${id}','open',true),(gen_random_uuid(),'${id}','mtg',false);
INSERT INTO external_performance_reports VALUES('${id}','approved',3),('${id}','pending',20),('${id}','rejected',40);`)
await db.exec(fs.readFileSync('supabase/tests/fixtures/license_performance_summary_legacy.sql','utf8'))
await db.exec('REVOKE ALL ON license_performance_summary FROM PUBLIC,anon,authenticated; GRANT SELECT ON license_performance_summary TO service_role;')
const select=async()=>(await db.query('SELECT * FROM license_performance_summary WHERE scenario_master_id=$1 ORDER BY license_amount',[id])).rows
assert.ok((await select())[0].external_performance_count>3)
const cols=async()=>(await db.query("SELECT attname,atttypid FROM pg_attribute WHERE attrelid='license_performance_summary'::regclass AND attnum>0 ORDER BY attnum")).rows
const beforeCols=await cols()
await db.exec(fs.readFileSync('supabase/migrations/20260921121000_fix_license_summary_fanout.sql','utf8'))
assert.deepEqual(await cols(),beforeCols)
let rows=await select()
assert.equal(rows.length,2)
for(const row of rows){assert.equal(row.internal_performance_count,2);assert.equal(row.external_performance_count,3);assert.equal(row.total_performance_count,5);assert.equal(row.total_license_fee,5*row.license_amount)}
assert.equal((await db.query('SELECT total_performance_count FROM license_performance_summary WHERE scenario_master_id=$1',[empty])).rows[0].total_performance_count,0)
console.log('PASS internal/external facts counted once, cancellation/status exclusions, duplicate rates, distinct rates, empty scenario, stable column types')
await db.exec(`INSERT INTO external_performance_reports VALUES('${id}','approved',3);`)
assert.equal((await select())[0].external_performance_count,6)
await db.exec('DELETE FROM schedule_events')
rows=await select();assert.equal(rows[0].internal_performance_count,0);assert.equal(rows[0].external_performance_count,6)
console.log('PASS equal-sized reports remain separate facts and external-only scenarios are counted')
for(const role of ['anon','authenticated']) assert.equal((await db.query("SELECT has_table_privilege($1,'license_performance_summary','SELECT') allowed",[role])).rows[0].allowed,false)
assert.equal((await db.query("SELECT has_table_privilege('service_role','license_performance_summary','SELECT') allowed")).rows[0].allowed,true)
await db.exec(fs.readFileSync('supabase/migrations/20260921122000_deduplicate_reservation_event_index.sql','utf8'))
assert.equal((await db.query("SELECT to_regclass('idx_reservations_event') removed, to_regclass('idx_reservations_schedule_event_id') kept")).rows[0].removed,null)
assert.ok((await db.query("SELECT to_regclass('idx_reservations_schedule_event_id') kept")).rows[0].kept)
await db.exec(fs.readFileSync('supabase/rollbacks/20260921122000_deduplicate_reservation_event_index.sql','utf8'))
assert.ok((await db.query("SELECT to_regclass('idx_reservations_event') restored")).rows[0].restored)
await db.exec('DROP INDEX idx_reservations_event; CREATE INDEX idx_reservations_event ON reservations(schedule_event_id) WHERE schedule_event_id IS NOT NULL;')
await assert.rejects(db.exec(fs.readFileSync('supabase/migrations/20260921122000_deduplicate_reservation_event_index.sql','utf8')), /definitions differ/)
await db.exec('ROLLBACK')
assert.ok((await db.query("SELECT to_regclass('idx_reservations_event') kept")).rows[0].kept)
console.log('PASS partial indexes are rejected without dropping either index')
await db.exec(fs.readFileSync('supabase/rollbacks/20260921121000_fix_license_summary_fanout.sql','utf8'))
assert.deepEqual(await cols(),beforeCols)
console.log('PASS existing ACL preserved and both changes have working rollback')
await db.close()

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,date date,start_time time,end_time time,time_slot text);
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,schedule_event_id uuid,private_group_id uuid,status text,requested_datetime timestamptz);
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,reservation_id uuid);
CREATE TABLE private_group_candidate_dates(id uuid PRIMARY KEY,group_id uuid,date date,start_time text,end_time text,time_slot text,status text);
INSERT INTO schedule_events VALUES('${id(1)}','${id(9)}','2027-03-01','09:00','12:00','朝');
INSERT INTO reservations VALUES('${id(2)}','${id(9)}','${id(1)}','${id(3)}','confirmed','2027-03-01T09:00+09');
INSERT INTO private_groups VALUES('${id(3)}','${id(9)}','${id(2)}');
INSERT INTO private_group_candidate_dates VALUES('${id(4)}','${id(3)}','2027-03-01','09:00','12:00','午前','active'),('${id(5)}','${id(3)}','2027-03-01','14:00','17:00','午後','active');`)
await db.exec('GRANT SELECT,UPDATE ON private_group_candidate_dates TO anon,authenticated; GRANT SELECT,UPDATE ON schedule_events TO authenticated')
const migration=fs.readFileSync('supabase/migrations/20260927052000_event_datetime_atomic_sync.sql','utf8')
await db.exec(migration)
await db.exec('SET ROLE authenticated')
await assert.rejects(()=>db.exec("UPDATE private_group_candidate_dates SET start_time='14:00'"),/permission denied/)
await db.exec('RESET ROLE')
const query = async sql => (await db.query(sql)).rows
const update = () => db.exec(`UPDATE schedule_events SET date='2027-03-02',start_time='18:00',end_time='22:00',time_slot='夜' WHERE id='${id(1)}'`)
const snapshot = () => query(`SELECT (SELECT jsonb_agg(t) FROM schedule_events t) e,(SELECT jsonb_agg(t) FROM reservations t) r,(SELECT jsonb_agg(t) FROM private_group_candidate_dates t) c`)
async function scenario(test) {await db.exec('BEGIN');try {await test()} finally {await db.exec('ROLLBACK')}}
await scenario(async()=>{
 await db.exec('SET ROLE authenticated');await update();await db.exec('RESET ROLE')
 assert.equal((await query('SELECT requested_datetime FROM reservations'))[0].requested_datetime.toISOString(),'2027-03-02T09:00:00.000Z')
 const rows=await query('SELECT * FROM private_group_candidate_dates ORDER BY id')
 assert.equal(rows[0].start_time,'18:00:00');assert.equal(rows[0].time_slot,'夜間')
 assert.equal(rows[1].start_time,'14:00');assert.equal(rows[1].date.toISOString().slice(0,10),'2027-03-01')
})
await scenario(async()=>{
 await db.exec(`UPDATE private_group_candidate_dates SET start_time='10:00' WHERE id='${id(4)}'`)
 const before=await query('SELECT * FROM private_group_candidate_dates ORDER BY id');await update()
 assert.deepEqual(await query('SELECT * FROM private_group_candidate_dates ORDER BY id'),before)
})
await scenario(async()=>{
 await db.exec(`UPDATE private_groups SET reservation_id='${id(99)}'`)
 const before=await query('SELECT * FROM private_group_candidate_dates ORDER BY id');await update()
 assert.deepEqual(await query('SELECT * FROM private_group_candidate_dates ORDER BY id'),before)
})
await scenario(async()=>{
 await db.exec(`UPDATE reservations SET status='cancelled'`)
 const before=await query('SELECT * FROM reservations');await update();assert.deepEqual(await query('SELECT * FROM reservations'),before)
})
// Errors roll the event and every related row back, not just the failing update.
await db.exec(`INSERT INTO private_group_candidate_dates SELECT '${id(6)}',group_id,date,start_time,end_time,time_slot,status FROM private_group_candidate_dates WHERE id='${id(4)}'`)
let before=await snapshot();await assert.rejects(update,/EVENT_PRIVATE_CANDIDATE_AMBIGUOUS/);assert.deepEqual(await snapshot(),before)
await db.exec(`DELETE FROM private_group_candidate_dates WHERE id='${id(6)}';UPDATE private_groups SET organization_id='${id(8)}'`)
before=await snapshot();await assert.rejects(update,/EVENT_PRIVATE_GROUP_ORGANIZATION_MISMATCH/);assert.deepEqual(await snapshot(),before)
await db.exec(`UPDATE private_groups SET organization_id='${id(9)}';UPDATE reservations SET organization_id='${id(8)}'`)
before=await snapshot();await assert.rejects(update,/EVENT_BOOKING_ORGANIZATION_MISMATCH/);assert.deepEqual(await snapshot(),before)
await db.exec(`UPDATE reservations SET organization_id='${id(9)}';CREATE FUNCTION fail_candidate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER fail_candidate BEFORE UPDATE ON private_group_candidate_dates FOR EACH ROW EXECUTE FUNCTION fail_candidate();`)
before=await snapshot();await assert.rejects(update,/injected failure/);assert.deepEqual(await snapshot(),before)
await db.exec('DROP TRIGGER fail_candidate ON private_group_candidate_dates')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927052000_event_datetime_atomic_sync.sql','utf8'));await db.exec(migration);await update()
await db.close();console.log('PASS event datetime atomic sync, exact matching, historical preservation, organization boundaries, failure rollback and reapply')

// Integrate with the real candidate deadline resolver, trigger and authenticated add RPC.
const { execFileSync } = await import('node:child_process')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const dir=fs.mkdtempSync(join(tmpdir(),'mmq-event-sync-'))
let integrated
try {
 const fixture=join(dir,'fixture.sql')
 execFileSync(process.execPath,['scripts/test-private-group-candidate-add-db.mjs','--export-fixture',fixture])
 integrated=new PGlite();await integrated.exec(fs.readFileSync(fixture,'utf8'))
 await integrated.exec(`ALTER TABLE schedule_events ADD COLUMN time_slot text; ALTER TABLE reservations ADD COLUMN schedule_event_id uuid,ADD COLUMN private_group_id uuid,ADD COLUMN requested_datetime timestamptz;
 GRANT UPDATE ON private_group_candidate_dates TO anon,authenticated;`)
 await integrated.exec(migration)
 await integrated.query("SELECT set_config('test.actor',$1,false)",[id(1)])
 await integrated.exec('SET ROLE authenticated')
 const added=await integrated.query('SELECT private_group_add_candidate_dates($1,$2,$3,$4,$5) AS result',[id(100),id(1000),id(20),[id(30)],JSON.stringify([{date:'2030-01-08',time_slot:'afternoon',start_time:'13:00',end_time:'16:00'}])])
 assert.equal(added.rows[0].result.success,true,'secure candidate RPC works after UPDATE revocation')
 await assert.rejects(()=>integrated.query('SELECT private_group_add_candidate_dates($1,$2,$3,$4,$5)',[id(100),id(1001),id(20),[id(30)],JSON.stringify([{date:new Date().toISOString().slice(0,10),time_slot:'afternoon',start_time:'13:00',end_time:'16:00'}])]),e=>e.code==='P0045')
 await integrated.exec('RESET ROLE')
 await integrated.exec(`INSERT INTO schedule_events(id,organization_id,date,start_time,end_time,time_slot) VALUES('${id(200)}','${id(10)}','2030-01-08','13:00','16:00','昼');
 INSERT INTO reservations(id,organization_id,status,schedule_event_id,private_group_id,requested_datetime) VALUES('${id(201)}','${id(10)}','confirmed','${id(200)}','${id(100)}','2030-01-08T13:00+09');
 UPDATE private_groups SET reservation_id='${id(201)}',status='confirmed' WHERE id='${id(100)}';`)
 await integrated.exec(`UPDATE schedule_events SET date=current_date WHERE id='${id(200)}'`)
 assert.equal((await integrated.query('SELECT date=current_date AS matches FROM private_group_candidate_dates')).rows[0].matches,true,'existing confirmed event can move inside new-request deadline')
 await integrated.exec(`UPDATE schedule_events SET date='2030-01-09' WHERE id='${id(200)}'`)
 assert.equal((await integrated.query('SELECT date::text AS date FROM private_group_candidate_dates')).rows[0].date,'2030-01-09')
 console.log('PASS real candidate deadline/RPC integration and old-client UPDATE rejection')
} finally {if(integrated)await integrated.close();fs.rmSync(dir,{recursive:true,force:true})}

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE TABLE schedule_events(id uuid PRIMARY KEY,current_participants integer);
CREATE TABLE reservations(id uuid PRIMARY KEY,schedule_event_id uuid,participant_count integer,status text);
INSERT INTO schedule_events VALUES('${id(1)}',7),('${id(2)}',0);`)
const name='20260928001300_serialize_participant_recalculation.sql'
const restore=fs.readFileSync('supabase/rollbacks/'+name,'utf8')
const migration=fs.readFileSync('supabase/migrations/'+name,'utf8')
await db.exec(restore)
await db.exec(`CREATE TRIGGER trigger_recalc_participants AFTER INSERT OR DELETE OR UPDATE OF participant_count,status,schedule_event_id ON reservations FOR EACH ROW EXECUTE FUNCTION recalc_current_participants_trigger();`)
const catalog=async()=>(await db.query("SELECT proname,prosrc,prosecdef,proconfig,proacl FROM pg_proc WHERE proname IN ('recalc_current_participants_for_event','recalc_current_participants_trigger') ORDER BY proname")).rows
const before=await catalog()
await db.exec(migration)
assert.equal((await db.query('SELECT current_participants FROM schedule_events WHERE id=$1',[id(1)])).rows[0].current_participants,7,'migration does not infer/backfill existing counts')
const count=async event=>(await db.query('SELECT current_participants FROM schedule_events WHERE id=$1',[id(event)])).rows[0].current_participants
for(const [n,status] of ['pending','confirmed','gm_confirmed','checked_in','cancelled','completed','no_show'].entries()) await db.query('INSERT INTO reservations VALUES($1,$2,1,$3)',[id(10+n),id(1),status])
assert.equal(await count(1),4,'preserve existing status semantics')
await db.query('UPDATE reservations SET participant_count=3 WHERE id=$1',[id(10)]);assert.equal(await count(1),6)
await db.query('UPDATE reservations SET schedule_event_id=$1 WHERE id=$2',[id(2),id(10)]);assert.equal(await count(1),3);assert.equal(await count(2),3)
await db.query("UPDATE reservations SET status='cancelled' WHERE id=$1",[id(10)]);assert.equal(await count(2),0)
await db.query('DELETE FROM reservations WHERE id=$1',[id(11)]);assert.equal(await count(1),2)
await db.query('UPDATE reservations SET schedule_event_id=NULL WHERE id=$1',[id(12)]);assert.equal(await count(1),1)
await db.exec('BEGIN');await db.query('DELETE FROM reservations WHERE id=$1',[id(13)]);assert.equal(await count(1),0);await db.exec('ROLLBACK');assert.equal(await count(1),1)
await db.exec(restore);assert.deepEqual(await catalog(),before,'inverse restores bodies, security and ACL')
await db.exec(migration);assert.equal(await count(1),1)
await db.close();console.log('PASS status semantics, count edits, event moves, cancellation, deletion, null link, transaction rollback, no data backfill, inverse/reapply')

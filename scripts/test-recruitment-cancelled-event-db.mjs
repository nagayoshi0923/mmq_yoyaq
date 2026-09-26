import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,is_cancelled boolean);
CREATE TABLE performance_recruitment_deadlines(schedule_event_id uuid,organization_id uuid,status text,cycle integer DEFAULT 1,updated_at timestamptz DEFAULT now());
CREATE TABLE performance_recruitment_notices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),schedule_event_id uuid,organization_id uuid,kind text,status text,sent_at timestamptz,lease_until timestamptz,attempts integer DEFAULT 2,snapshot jsonb DEFAULT '{"keep":true}');`)
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
for(const n of [1,2]){
 await db.query('INSERT INTO schedule_events VALUES($1,$2,$3)',[id(n),id(10),n===1])
 await db.query("INSERT INTO performance_recruitment_deadlines(schedule_event_id,organization_id,status) VALUES($1,$2,'active')",[id(n),id(10)])
 for(const status of ['pending','failed','sending','sent'])await db.query("INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,kind,status,sent_at,lease_until) VALUES($1,$2,'extension',$3,CASE WHEN $3='sent' THEN now() END,now()+interval '5 minutes')",[id(n),id(10),status])
 await db.query("INSERT INTO performance_recruitment_notices(schedule_event_id,organization_id,kind,status) VALUES($1,$2,'cancelled','pending')",[id(n),id(10)])
}
// Deliberately inconsistent legacy rows must not be modified across organizations.
await db.query("INSERT INTO performance_recruitment_deadlines(schedule_event_id,organization_id,status) VALUES($1,$2,'active')",[id(2),id(11)])
const name='20260927014000_recruitment_cancelled_event_sync.sql'
const captured = JSON.parse(fs.readFileSync('supabase/rollbacks/'+name,'utf8').match(/jsonb_to_recordset\('(.+)'::jsonb\)/)[1])
for(const row of captured){
 await db.query('INSERT INTO schedule_events VALUES($1,$2,true)',[row.schedule_event_id,row.organization_id])
 await db.query('INSERT INTO performance_recruitment_deadlines(schedule_event_id,organization_id,status,updated_at) VALUES($1,$2,$3,$4)',[row.schedule_event_id,row.organization_id,row.status,row.updated_at])
}
await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'))
const state=async n=>(await db.query('SELECT status FROM performance_recruitment_deadlines WHERE schedule_event_id=$1 AND organization_id=$2',[id(n),id(10)])).rows[0].status
assert.equal(await state(1),'cancelled');assert.equal(await state(2),'active')
await db.query('UPDATE schedule_events SET is_cancelled=true WHERE id=$1',[id(2)])
assert.equal(await state(2),'cancelled')
const rows=(await db.query('SELECT kind,status,sent_at,lease_until,attempts,snapshot FROM performance_recruitment_notices WHERE schedule_event_id=$1',[id(2)])).rows
assert.equal(rows.filter(r=>r.status==='expired'&&r.lease_until===null).length,3)
assert.equal(rows.filter(r=>r.status==='sent'&&r.sent_at).length,1)
assert.equal(rows.find(r=>r.kind==='cancelled').status,'pending')
assert.ok(rows.every(r=>r.attempts===2 && r.snapshot.keep===true))
assert.equal((await db.query('SELECT status FROM performance_recruitment_deadlines WHERE organization_id=$1',[id(11)])).rows[0].status,'active')
await db.query('UPDATE schedule_events SET is_cancelled=false WHERE id=$1',[id(2)])
assert.equal(await state(2),'cancelled','reopening an event must not silently restart or resend recruitment')
await db.exec(fs.readFileSync('supabase/rollbacks/'+name,'utf8'))
for(const row of captured){
 const restored=(await db.query('SELECT status,updated_at FROM performance_recruitment_deadlines WHERE schedule_event_id=$1 AND organization_id=$2',[row.schedule_event_id,row.organization_id])).rows[0]
 assert.equal(restored.status,row.status);assert.equal(new Date(restored.updated_at).getTime(),new Date(row.updated_at).getTime())
}
await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'))
assert.equal(await state(2),'cancelled')
await db.close()
console.log('PASS cancelled recruitment: backfill, event cancellation, queued/leased notices, sent history, org boundary, no automatic reopen, rollback/reapply')

import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
await db.exec('CREATE TABLE schedule_events(id integer PRIMARY KEY,gm_cost integer DEFAULT 0); INSERT INTO schedule_events(id) VALUES(1); INSERT INTO schedule_events VALUES(2,1234)')
const name='20260927018000_unrecorded_event_gm_cost.sql'
await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'))
await db.exec('INSERT INTO schedule_events(id) VALUES(3); INSERT INTO schedule_events VALUES(4,0)')
assert.deepEqual((await db.query('SELECT gm_cost FROM schedule_events ORDER BY id')).rows.map(r=>r.gm_cost),[0,1234,null,0])
await db.exec(fs.readFileSync('supabase/rollbacks/'+name,'utf8'))
await db.exec('INSERT INTO schedule_events(id) VALUES(5)')
assert.equal((await db.query('SELECT gm_cost FROM schedule_events WHERE id=5')).rows[0].gm_cost,0)
await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'))
assert.deepEqual((await db.query('SELECT gm_cost FROM schedule_events ORDER BY id')).rows.map(r=>r.gm_cost),[0,1234,null,0,0])
await db.close()
console.log('PASS event GM cost: preserve history, unrecorded NULL, explicit zero, rollback/reapply')

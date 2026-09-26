import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const name = '20260927020000_gm_response_org_integrity.sql'
const migration = fs.readFileSync('supabase/migrations/' + name, 'utf8')
const rollback = fs.readFileSync('supabase/rollbacks/' + name, 'utf8')
await db.exec(`CREATE TABLE staff(id integer PRIMARY KEY, organization_id integer NOT NULL);
 CREATE TABLE reservations(id integer PRIMARY KEY, organization_id integer NOT NULL);
 CREATE TABLE gm_availability_responses(id integer PRIMARY KEY, staff_id integer NOT NULL, reservation_id integer NOT NULL, organization_id integer NOT NULL, notes text);
 INSERT INTO staff VALUES(1,10),(2,20); INSERT INTO reservations VALUES(1,10),(2,20);
 INSERT INTO gm_availability_responses VALUES(1,2,1,10,'legacy');`)
await db.exec(migration)
assert.equal((await db.query('SELECT notes FROM gm_availability_responses WHERE id=1')).rows[0].notes, 'legacy')
await db.exec('INSERT INTO gm_availability_responses VALUES(2,1,1,10,NULL)')
for (const sql of [
 'INSERT INTO gm_availability_responses VALUES(3,2,1,10,NULL)',
 'INSERT INTO gm_availability_responses VALUES(3,1,2,10,NULL)',
 'UPDATE gm_availability_responses SET staff_id=2 WHERE id=2',
 'UPDATE gm_availability_responses SET reservation_id=2 WHERE id=2',
 'UPDATE staff SET organization_id=20 WHERE id=1',
 'UPDATE reservations SET organization_id=20 WHERE id=1',
]) await assert.rejects(db.exec(sql), /violates foreign key constraint/)
assert.equal(Number((await db.query('SELECT count(*) FROM gm_availability_responses')).rows[0].count), 2)
await db.exec('DELETE FROM staff WHERE id=1')
assert.equal(Number((await db.query('SELECT count(*) FROM gm_availability_responses')).rows[0].count), 1)
await db.exec(rollback)
await db.exec(migration)
const constraints = (await db.query("SELECT conname,convalidated FROM pg_constraint WHERE conname LIKE 'gm_responses_%'")).rows
assert.equal(constraints.find(x=>x.conname==='gm_responses_staff_org_fkey').convalidated, false)
assert.equal(constraints.find(x=>x.conname==='gm_responses_reservation_org_fkey').convalidated, true)
await db.close()
console.log('PASS GM response tenant integrity: insert/update/parent reassignment, legacy preserved, cascade, rollback/reapply')

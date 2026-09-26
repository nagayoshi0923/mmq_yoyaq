import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const name = '20260927021000_remove_duplicate_unique_constraints.sql'
const migration = fs.readFileSync('supabase/migrations/' + name, 'utf8')
const rollback = fs.readFileSync('supabase/rollbacks/' + name, 'utf8')
await db.exec(`CREATE TABLE business_hours_settings(id integer PRIMARY KEY, store_id integer UNIQUE); ALTER TABLE business_hours_settings ADD CONSTRAINT business_hours_settings_store_id_unique UNIQUE(store_id);
CREATE TABLE gm_availability_responses(id integer PRIMARY KEY, reservation_id integer, staff_id integer, UNIQUE(reservation_id,staff_id)); ALTER TABLE gm_availability_responses ADD CONSTRAINT gm_availability_responses_reservation_staff_unique UNIQUE(reservation_id,staff_id);
INSERT INTO business_hours_settings VALUES(1,1),(2,NULL),(3,NULL);
INSERT INTO gm_availability_responses VALUES(1,1,1);`)
const snapshot = async () => JSON.stringify([(await db.query('SELECT * FROM business_hours_settings ORDER BY id')).rows,(await db.query('SELECT * FROM gm_availability_responses ORDER BY id')).rows])
const before = await snapshot()
await db.exec(migration)
assert.equal(await snapshot(),before)
await assert.rejects(db.exec('INSERT INTO business_hours_settings VALUES(4,1)'),/violates unique constraint/)
await assert.rejects(db.exec('INSERT INTO gm_availability_responses VALUES(2,1,1)'),/violates unique constraint/)
await db.exec('INSERT INTO gm_availability_responses VALUES(2,1,1) ON CONFLICT(reservation_id,staff_id) DO NOTHING')
assert.equal(await snapshot(),before)
await db.exec(rollback)
await db.exec(migration)
assert.equal(await snapshot(),before)
await db.exec(rollback)
// 2番目の定義が変わっていたら、1番目の削除もトランザクション全体で取り消す。
await db.exec('ALTER TABLE gm_availability_responses DROP CONSTRAINT gm_availability_responses_reservation_staff_unique; ALTER TABLE gm_availability_responses ADD CONSTRAINT gm_availability_responses_reservation_staff_unique UNIQUE(staff_id,reservation_id)')
await assert.rejects(db.exec(migration),/重複UNIQUEの定義/)
await db.exec('ROLLBACK')
assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname='business_hours_settings_store_id_unique'")).rows[0].n,1)
assert.equal(await snapshot(),before)
await db.close()
console.log('PASS duplicate UNIQUE cleanup: data preserved, uniqueness/upsert/null semantics, rollback/reapply and drift rollback')

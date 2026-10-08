import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,organizer_id uuid,status text,reservation_id uuid);
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,status text);
CREATE TABLE private_group_candidate_dates(id uuid PRIMARY KEY,group_id uuid REFERENCES private_groups,date date,time_slot text,start_time text,end_time text,order_num integer,status text);
CREATE TABLE private_group_date_responses(id uuid PRIMARY KEY,group_id uuid,member_id uuid,candidate_date_id uuid REFERENCES private_group_candidate_dates,response text);
INSERT INTO private_groups VALUES ('${id(1)}','${id(10)}','${id(11)}','gathering',NULL),('${id(2)}','${id(20)}','${id(21)}','gathering',NULL);
INSERT INTO private_group_candidate_dates VALUES ('${id(3)}','${id(1)}','2026-12-05','夜間','19:00','23:00',1,'active'),('${id(4)}','${id(2)}','2026-12-05','夜間','19:00','23:00',1,'active');
INSERT INTO private_group_date_responses VALUES ('${id(5)}','${id(1)}','${id(6)}','${id(3)}','ok');`)
const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_private_group_candidate_withdrawal.sql'))
await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'))
const actor = async n => db.query("SELECT set_config('test.actor',$1,false)",[n ? id(n) : ''])
const call = async (group=1,candidate=3) => (await db.query('SELECT private_group_withdraw_candidate($1,$2) AS result',[id(group),id(candidate)])).rows[0].result
const denied = async (fn,code) => {await assert.rejects(fn,e=>e.code===code)}
await actor(null);await denied(()=>call(),'42501')
await actor(21);await denied(()=>call(),'42501')
await actor(11);await denied(()=>call(1,4),'22023')
for(const status of ['booking_requested','confirmed','cancelled']) {
 await db.query('UPDATE private_groups SET status=$1 WHERE id=$2',[status,id(1)]);await denied(()=>call(),'22023')
}
await db.query("UPDATE private_groups SET status='gathering',reservation_id=$1 WHERE id=$2",[id(7),id(1)])
await denied(()=>call(),'22023') // missing reservation fails closed
await db.exec(`INSERT INTO reservations VALUES ('${id(7)}','${id(10)}','pending');`)
await denied(()=>call(),'22023')
await db.query("UPDATE reservations SET organization_id=$1,status='cancelled' WHERE id=$2",[id(20),id(7)])
await denied(()=>call(),'22023') // cross-tenant reservation fails closed
await db.query('UPDATE reservations SET organization_id=$1 WHERE id=$2',[id(10),id(7)])
assert.equal((await call()).success,true)
assert.equal((await call()).replayed,true)
const row=(await db.query('SELECT * FROM private_group_candidate_dates WHERE id=$1',[id(3)])).rows[0]
assert.equal(row.status,'rejected');assert.ok(row.withdrawn_at);assert.equal(row.order_num,1)
assert.equal((await db.query('SELECT * FROM private_group_date_responses WHERE id=$1',[id(5)])).rows[0].response,'ok')
await denied(()=>db.query("UPDATE private_group_date_responses SET response='ng' WHERE id=$1",[id(5)]),'40001')
await denied(()=>db.exec(`INSERT INTO private_group_date_responses VALUES ('${id(8)}','${id(1)}','${id(9)}','${id(3)}','maybe');`),'40001')
assert.equal((await db.query('SELECT count(*)::integer AS n FROM private_group_candidate_dates')).rows[0].n,2)
assert.equal((await db.query("SELECT has_function_privilege('anon','private_group_withdraw_candidate(uuid,uuid)','execute') AS allowed")).rows[0].allowed,false)
assert.equal((await db.query("SELECT has_function_privilege('authenticated','private_group_withdraw_candidate(uuid,uuid)','execute') AS allowed")).rows[0].allowed,true)
await db.exec(fs.readFileSync(`supabase/rollbacks/${migration}`,'utf8'))
assert.equal((await db.query('SELECT count(*)::integer AS n FROM private_group_date_responses')).rows[0].n,1)
console.log('PASS: 主催者/未認証/別組織/候補の取り違え/申込・確定・取消/予約不整合/再送/回答保持/古い回答拒否/権限/rollback')
await db.close()

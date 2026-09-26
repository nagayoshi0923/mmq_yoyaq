import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite();const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE users(id uuid PRIMARY KEY,organization_id uuid,role text);
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT organization_id FROM users WHERE id=auth.uid() $$;
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,reservation_id uuid);
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,private_group_id uuid REFERENCES private_groups ON DELETE SET NULL,reservation_source text,status text,payment_status text,schedule_event_id uuid,event_id uuid);
ALTER TABLE private_groups ADD FOREIGN KEY(reservation_id) REFERENCES reservations ON DELETE SET NULL;
CREATE TABLE schedule_events(id uuid PRIMARY KEY,reservation_id uuid REFERENCES reservations ON DELETE SET NULL);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid REFERENCES private_groups ON DELETE CASCADE);
CREATE TABLE private_group_messages(id uuid PRIMARY KEY,group_id uuid REFERENCES private_groups ON DELETE CASCADE);
CREATE TABLE gm_availability_responses(id uuid PRIMARY KEY,reservation_id uuid REFERENCES reservations ON DELETE CASCADE);
CREATE TABLE billing(id uuid PRIMARY KEY,reservation_id uuid REFERENCES reservations);
CREATE TABLE audit_logs(user_id uuid,organization_id uuid,action text,resource_type text,resource_id uuid,old_values jsonb);
INSERT INTO users VALUES('${id(1)}','${id(10)}','staff'),('${id(2)}','${id(20)}','admin'),('${id(3)}','${id(10)}','customer');`)
const path='20260927008000_private_booking_atomic_delete.sql';const sql=fs.readFileSync('supabase/migrations/'+path,'utf8');await db.exec(sql)
async function fixture(n){await db.query('INSERT INTO private_groups VALUES($1,$2,NULL)',[id(n),id(10)]);await db.query("INSERT INTO reservations VALUES($1,$2,$1,'web_private','pending','pending',NULL,NULL)",[id(n),id(10)]);await db.query('UPDATE private_groups SET reservation_id=$1 WHERE id=$1',[id(n)]);for(const t of ['private_group_members','private_group_messages','gm_availability_responses'])await db.query(`INSERT INTO ${t} VALUES($1,$1)`,[id(n)])}
async function remove(n,user=id(1)){await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('SET ROLE '+(user?'authenticated':'anon'));try{await db.query('SELECT delete_private_booking_request_atomic($1)',[id(n)])}finally{await db.exec('RESET ROLE')}}
async function exists(table,n){return (await db.query(`SELECT 1 FROM ${table} WHERE id=$1`,[id(n)])).rows.length===1}
await fixture(100)
await assert.rejects(()=>remove(100,null),/permission denied/)
await assert.rejects(()=>remove(100,id(2)),/見つかりません/)
await assert.rejects(()=>remove(100,id(3)),/権限/)
await db.query('INSERT INTO billing VALUES($1,$1)',[id(100)])
await assert.rejects(()=>remove(100),/関連履歴/)
for(const t of ['reservations','private_groups','private_group_members','private_group_messages','gm_availability_responses'])assert.equal(await exists(t,100),true,'restrictive FK preserves '+t)
assert.equal((await db.query('SELECT * FROM audit_logs')).rows.length,0)
await db.query('DELETE FROM billing');await remove(100)
for(const t of ['reservations','private_groups','private_group_members','private_group_messages','gm_availability_responses'])assert.equal(await exists(t,100),false,'atomic cleanup '+t)
assert.equal((await db.query('SELECT * FROM audit_logs')).rows.length,1)
await fixture(101);await db.query("UPDATE reservations SET status='confirmed' WHERE id=$1",[id(101)]);await assert.rejects(()=>remove(101),/公演・支払/)
await db.query("UPDATE reservations SET status='cancelled',payment_status='paid' WHERE id=$1",[id(101)]);await assert.rejects(()=>remove(101),/公演・支払/)
await db.query("UPDATE reservations SET payment_status='pending' WHERE id=$1",[id(101)]);await db.query('INSERT INTO schedule_events VALUES($1,$1)',[id(101)]);await assert.rejects(()=>remove(101),/公演・支払/)
await db.query('DELETE FROM schedule_events');await db.query("INSERT INTO reservations VALUES($1,$2,$3,'web_private','pending','pending',NULL,NULL)",[id(102),id(10),id(101)]);await assert.rejects(()=>remove(101),/別の予約/)
await db.query('DELETE FROM reservations WHERE id=$1',[id(102)])
// Failure in the group cascade occurs after reservation deletion; it must restore the reservation too.
await db.exec(`CREATE FUNCTION fail_group_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'late delete failed'; END $$;CREATE TRIGGER fail_delete BEFORE DELETE ON private_groups FOR EACH ROW EXECUTE FUNCTION fail_group_delete();`)
await assert.rejects(()=>remove(101),/late delete failed/);assert.equal(await exists('reservations',101),true);assert.equal(await exists('gm_availability_responses',101),true)
await db.exec('DROP TRIGGER fail_delete ON private_groups');await remove(101)
await db.exec(fs.readFileSync('supabase/rollbacks/'+path,'utf8'));await db.exec(sql)
await db.close();console.log('PASS private request deletion: org/role boundary, whole cleanup, financial/event/shared-group protection, early+late rollback, migration reapply')

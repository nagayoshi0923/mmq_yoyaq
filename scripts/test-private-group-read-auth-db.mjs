import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE users(id uuid PRIMARY KEY,role text,organization_id uuid);
CREATE TABLE staff(user_id uuid,organization_id uuid,status text);
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,organizer_id uuid);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,guest_name text,guest_email text,is_organizer boolean,status text,joined_at timestamptz,created_at timestamptz);
CREATE FUNCTION require_private_group_member(uuid,uuid,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'guest verification required' USING ERRCODE='42501'; END $$;`)
for(const [n,role,org] of [[1,'customer',null],[2,'customer',null],[3,'staff',10],[4,'staff',20],[5,'staff',10],[6,'admin',10],[7,'license_admin',20],[8,'customer',null]]) await db.query('INSERT INTO users VALUES($1,$2,$3)',[id(n),role,org?id(org):null])
await db.query('INSERT INTO private_groups VALUES($1,$2,$3)',[id(100),id(10),id(1)])
for(const [n,u,status] of [[101,1,'joined'],[102,2,'joined'],[103,8,'declined'],[104,null,'joined']]) await db.query('INSERT INTO private_group_members VALUES($1,$2,$3,$4,$5,false,$6,now(),now())',[id(n),id(100),u?id(u):null,'fixture',`${n}@example.invalid`,status])
for(const [u,o,status] of [[3,10,'active'],[4,20,'active'],[5,10,'resigned']])await db.query('INSERT INTO staff VALUES($1,$2,$3)',[id(u),id(o),status])
const migration=fs.readFileSync('supabase/migrations/20260927026000_private_group_read_authorization.sql','utf8')
const rollback=fs.readFileSync('supabase/rollbacks/20260927026000_private_group_read_authorization.sql','utf8')
await db.exec(migration)
async function read(actor,group=100){await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):'']);return (await db.query('SELECT * FROM get_group_members_by_group_id($1)',[group?id(group):null])).rows}
for(const actor of [null,4,5,8,999])await assert.rejects(read(actor),e=>e.code==='42501')
for(const group of [null,999])await assert.rejects(read(1,group),e=>e.code==='42501')
for(const actor of [1,3,6,7])assert.equal((await read(actor)).filter(x=>x.guest_email!==null).length,4)
const rows=await read(2);assert.equal(rows.length,4);assert.equal(rows.filter(x=>x.guest_email!==null).length,1);assert.equal(rows.find(x=>x.user_id===id(2)).guest_email,'102@example.invalid')
await db.exec('SET ROLE authenticated');assert.equal((await read(2)).length,4);await assert.rejects(read(4),e=>e.code==='42501');await db.exec('RESET ROLE')
assert.equal((await db.query("SELECT has_function_privilege('anon','get_group_members_by_group_id(uuid)','EXECUTE') AS allowed")).rows[0].allowed,false)
assert.equal((await db.query("SELECT has_function_privilege('authenticated','authorize_private_group_read(uuid,uuid,text)','EXECUTE') AS allowed")).rows[0].allowed,false)
await db.exec(rollback);assert.equal((await read(4)).length,4);await db.exec(migration);await assert.rejects(read(4),e=>e.code==='42501');assert.equal((await db.query('SELECT count(*)::int n FROM private_group_members')).rows[0].n,4)
await db.close();console.log('PASS private read: organizer/member/own email/active staff/admin/license; foreign/retired/declined/unknown/NULL denied; authenticated role; rollback/reapply. Guest token integration remains in the existing session suite.')

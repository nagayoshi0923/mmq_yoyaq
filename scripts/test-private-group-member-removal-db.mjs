import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;
CREATE TABLE users(id uuid PRIMARY KEY,role text,organization_id uuid);
CREATE TABLE staff(user_id uuid,status text);
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,organizer_id uuid,scenario_master_id uuid,character_assignments jsonb,updated_at timestamptz);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,status text,guest_name text,created_at timestamptz DEFAULT now());
CREATE TABLE customers(id uuid PRIMARY KEY,user_id uuid,nickname text,name text);
CREATE TABLE organization_scenarios(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid,characters jsonb,player_count_max integer DEFAULT 2);
CREATE VIEW organization_scenarios_with_master AS SELECT * FROM organization_scenarios;
CREATE TABLE org_scenario_survey_questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_scenario_id uuid,question_text text,question_type text,options jsonb,is_required boolean,order_num integer);
CREATE TABLE private_group_survey_responses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,member_id uuid,responses jsonb,updated_at timestamptz,UNIQUE(group_id,member_id));
CREATE TABLE private_group_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,member_id uuid,message text,created_at timestamptz DEFAULT now());`)
const guards = fs.readFileSync(fs.readdirSync('supabase/migrations').map(x=>'supabase/migrations/'+x).find(x=>x.includes('202609270061')), 'utf8')
await db.exec(guards.slice(guards.indexOf('CREATE FUNCTION public.private_group_actor_role'), guards.indexOf('CREATE FUNCTION public.guard_private_group_browser_write')))
await db.exec(guards.slice(guards.indexOf('CREATE OR REPLACE FUNCTION public.upsert_character_assignments_to_survey')))
for (const [n,role,org] of [[1,'customer',null],[2,'customer',null],[3,'staff',10],[4,'staff',20],[5,'staff',10]]) await db.query('INSERT INTO users VALUES($1,$2,$3)',[id(n),role,org?id(org):null])
await db.query("INSERT INTO staff VALUES($1,'resigned')",[id(5)])
await db.query("INSERT INTO private_groups VALUES($1,$2,$3,$4,'{}',now())",[id(100),id(10),id(1),id(20)])
for (const n of [101,102]) await db.query("INSERT INTO private_group_members(id,group_id,status,guest_name) VALUES($1,$2,'joined',$3)",[id(n),id(100),'member'+n])
await db.query('INSERT INTO organization_scenarios(id,organization_id,scenario_master_id,characters) VALUES($1,$2,$3,$4)',[id(30),id(10),id(20),JSON.stringify([{id:'a',name:'A'},{id:'b',name:'B'}])])
await db.exec('ALTER TABLE private_group_members ADD COLUMN is_organizer boolean DEFAULT false')
await db.query('UPDATE private_group_members SET user_id=$1,is_organizer=true WHERE id=$2',[id(1),id(101)])
await db.query('UPDATE private_group_members SET user_id=$1 WHERE id=$2',[id(2),id(102)])
await db.query("INSERT INTO private_group_members(id,group_id,user_id,status,guest_name) VALUES($1,$2,$3,'joined','duplicate')",[id(103),id(100),id(2)])
const migration=fs.readFileSync('supabase/migrations/20260927032000_private_group_member_removal.sql','utf8')
await db.exec(migration)
const actor=async n=>db.query("SELECT set_config('test.actor',$1,false)",[n?id(n):''])
async function remove(a,m=102){await actor(a);return db.query('SELECT private_group_remove_member($1)',[id(m)])}
async function leave(a){await actor(a);return db.query('SELECT private_group_leave($1)',[id(100)])}
for(const a of [null,2,4,5,999])await assert.rejects(remove(a),e=>e.code==='42501')
await assert.rejects(remove(1,101),e=>e.code==='42501')
await assert.rejects(leave(null),e=>e.code==='42501');await assert.rejects(leave(1),e=>e.code==='42501')
// 複数の本人行のうち1件が失敗しても、一部だけ退出しない。
await db.exec(`CREATE FUNCTION fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.guest_name='duplicate' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN OLD; END $$;
CREATE TRIGGER fail_delete BEFORE DELETE ON private_group_members FOR EACH ROW EXECUTE FUNCTION fail_delete();`)
await assert.rejects(leave(2),/fixture failure/)
assert.equal((await db.query('SELECT * FROM private_group_members')).rows.length,3)
await db.exec('DROP TRIGGER fail_delete ON private_group_members')
await db.exec('SET ROLE authenticated');await leave(2);await leave(2);await db.exec('RESET ROLE')
assert.deepEqual((await db.query('SELECT id FROM private_group_members')).rows.map(x=>x.id),[id(101)])
await db.query("INSERT INTO private_group_members(id,group_id,status,guest_name) VALUES($1,$2,'joined','guest')",[id(104),id(100)])
await db.exec('SET ROLE authenticated');await remove(1,104);await db.exec('RESET ROLE')
assert.equal((await db.query('SELECT * FROM private_group_members')).rows.length,1)
await db.exec('SET ROLE authenticated');await remove(3,101);await db.exec('RESET ROLE')
assert.equal((await db.query('SELECT * FROM private_group_members')).rows.length,0)
await db.exec('SET ROLE anon')
await assert.rejects(db.query('SELECT private_group_leave($1)',[id(100)]),e=>e.code==='42501')
await assert.rejects(db.query('SELECT private_group_remove_member($1)',[id(101)]),e=>e.code==='42501')
await db.exec('RESET ROLE')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927032000_private_group_member_removal.sql','utf8'))
await db.exec(migration)
await db.close()
console.log('PASS member removal: manager/staff/foreign/retired/anonymous, organizer guard, duplicate self rows, atomic rollback, retry, rollback/reapply')

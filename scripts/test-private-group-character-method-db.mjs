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
await db.exec('ALTER TABLE private_groups ADD COLUMN character_assignment_method text')
const migration=fs.readFileSync('supabase/migrations/20260927031000_private_group_character_method.sql','utf8')
await db.exec(migration)
await db.query("INSERT INTO org_scenario_survey_questions(id,org_scenario_id,question_type) VALUES($1,$2,'character_selection'),($3,$2,'character_selection'),($4,$2,'text')",[id(401),id(30),id(402),id(403)])
const answers={[id(401)]:'a',[id(402)]:'b',[id(403)]:'保護する回答'}
await db.query('INSERT INTO private_group_survey_responses(group_id,member_id,responses) VALUES($1,$2,$3)',[id(100),id(101),answers])
async function change(actor,method='self',expectedMethod=null,expectedAssignments={}) {
 await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):''])
 return db.query('SELECT private_group_set_character_method($1,$2,$3,$4)',[id(100),method,expectedMethod,expectedAssignments])
}
for(const actor of [null,2,4,5,999])await assert.rejects(change(actor),e=>e.code==='42501')
await assert.rejects(change(1,'bad'),e=>e.code==='22023')
await assert.rejects(change(1,'self','survey'),e=>e.code==='40001')
await assert.rejects(change(1,'self',null,{[id(101)]:'b'}),e=>e.code==='40001')
await db.exec(`CREATE FUNCTION fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$;
CREATE TRIGGER fail_notice BEFORE INSERT ON private_group_messages FOR EACH ROW EXECUTE FUNCTION fail_notice();`)
await assert.rejects(change(1),/fixture failure/)
assert.equal((await db.query('SELECT character_assignment_method FROM private_groups')).rows[0].character_assignment_method,null)
assert.deepEqual((await db.query('SELECT responses FROM private_group_survey_responses')).rows[0].responses,answers)
await db.exec('DROP TRIGGER fail_notice ON private_group_messages; SET ROLE authenticated')
await change(1)
await db.exec('RESET ROLE')
assert.equal((await db.query('SELECT character_assignment_method FROM private_groups')).rows[0].character_assignment_method,'self')
assert.deepEqual((await db.query('SELECT responses FROM private_group_survey_responses')).rows[0].responses,{[id(403)]:'保護する回答'})
await change(3,null,'self')
assert.equal((await db.query('SELECT character_assignment_method FROM private_groups')).rows[0].character_assignment_method,null)
assert.equal((await db.query('SELECT * FROM private_group_messages')).rows.length,2)
await change(1,'survey')
assert.equal((await db.query('SELECT * FROM private_group_messages')).rows.length,3)
await db.exec(fs.readFileSync('supabase/rollbacks/20260927031000_private_group_character_method.sql','utf8'))
await db.exec(migration)
await db.close()
console.log('PASS character method: auth, stale state, atomic rollback, all character answers cleared, other answers/history retained, reset/reselect')

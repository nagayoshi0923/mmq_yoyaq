import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE users(id uuid PRIMARY KEY,role text,organization_id uuid);
CREATE TABLE staff(user_id uuid UNIQUE,organization_id uuid,status text);
CREATE TABLE staff_account_access(user_id uuid);
CREATE TABLE scenario_masters(id uuid PRIMARY KEY,title text);
CREATE TABLE organization_scenarios(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid,survey_enabled boolean);
CREATE TABLE org_scenario_survey_questions(id uuid PRIMARY KEY,org_scenario_id uuid NOT NULL REFERENCES organization_scenarios(id),question_text text NOT NULL,question_type text NOT NULL,options jsonb,is_required boolean NOT NULL,order_num integer NOT NULL,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE private_group_survey_responses(id uuid,responses jsonb);`)
for(const [n,role,org] of [[1,'staff',10],[2,'staff',20],[3,'staff',10],[4,'customer',10],[5,'admin',10],[6,'license_admin',20]]) {
 await db.query('INSERT INTO users VALUES($1,$2,$3)',[id(n),role,id(org)])
}
await db.query("INSERT INTO staff VALUES($1,$2,'active'),($3,$2,'resigned')",[id(1),id(10),id(3)])
await db.query("INSERT INTO scenario_masters VALUES($1,'同組織'),($2,'別組織')",[id(30),id(40)])
await db.query('INSERT INTO organization_scenarios VALUES($1,$2,$3,true),($4,$5,$6,true)',[id(100),id(10),id(30),id(200),id(20),id(40)])
const sql=fs.readFileSync('supabase/migrations/20260927110000_survey_question_settings.sql','utf8')
await db.exec(sql)
const resolverSource=fs.readFileSync('supabase/migrations/20260927005000_staff_lifecycle_resigned_org.sql','utf8')
await db.exec(resolverSource.match(/CREATE OR REPLACE FUNCTION public\.get_user_organization_id\(\)[\s\S]*?\$function\$;/)[0])
const fallbackSql=fs.readFileSync('supabase/migrations/20260928014000_survey_staff_organization_fallback.sql','utf8')
await db.exec(fallbackSql)
const actor=async n=>db.query("SELECT set_config('test.actor',$1,false)",[n?id(n):''])
const read=async (scenario=100)=>(await db.query('SELECT read_survey_question_settings($1) result',[id(scenario)])).rows[0].result
const save=async (questions,revision,scenario=100)=>(await db.query('SELECT save_survey_question_settings($1,$2,$3) result',[id(scenario),JSON.stringify(questions),revision])).rows[0].result
const question=(n,text='本文')=>({id:id(n),question_text:text,question_type:'text',options:[],is_required:false,order_num:99})
for(const n of [null,2,3,4,999]) { await actor(n); await assert.rejects(read(),e=>e.code==='42501') }
await actor(1); await db.exec('SET ROLE authenticated')
const empty=await read(); assert.deepEqual(empty.questions,[])
const first=await save([question(1000)],empty.revision);assert.equal(first.questions[0].order_num,1)
await db.exec('RESET ROLE')
await db.query('INSERT INTO private_group_survey_responses VALUES($1,$2)',[id(500),JSON.stringify({[id(1000)]:'保存済み回答'})])
await assert.rejects(save([question(1001)],empty.revision),e=>e.code==='40001')
for(const invalid of [[question(1001),question(1001)],[question(1001),question(1002,'')],[{...question(1001),options:[{value:'x',label:'a'},{value:'x',label:'b'}]}],[{...question(1001),question_type:'single_choice'}],[{...question(1001),id:'bad'}]]) {
 await assert.rejects(save(invalid,first.revision));assert.deepEqual(await read(),first)
}
await actor(2);const other=await read(200);await save([question(2000)],other.revision,200)
await actor(1);await assert.rejects(save([question(2000)],first.revision),e=>e.code==='42501');assert.deepEqual(await read(),first)
const changed=await save([question(1000,'変更'),question(1002)],first.revision)
assert.equal(changed.questions.length,2);assert.equal(changed.questions[0].question_text,'変更')
assert.equal(changed.questions[0].created_at,first.questions[0].created_at)
assert.notEqual(changed.revision,first.revision)
// Simulate a legacy writer changing the set between read and save.
await db.query("UPDATE org_scenario_survey_questions SET question_text='旧クライアント更新' WHERE id=$1",[id(1000)])
await assert.rejects(save([question(1000)],changed.revision),e=>e.code==='40001')
const sources=(await db.query('SELECT list_survey_question_sources($1) result',[id(10)])).rows[0].result
assert.equal(sources.length,1);assert.equal(sources[0].questionCount,2)
await assert.rejects(db.query('SELECT list_survey_question_sources($1)',[id(20)]),e=>e.code==='42501')
const beforeDelete=await read();assert.deepEqual((await save([],beforeDelete.revision)).questions,[])
assert.deepEqual((await db.query('SELECT responses FROM private_group_survey_responses')).rows[0].responses,{[id(1000)]:'保存済み回答'})
for(const n of [5,6]){await actor(n);await read()}
await db.exec('SET ROLE anon');await assert.rejects(read(),e=>e.code==='42501');await db.exec('RESET ROLE')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927110000_survey_question_settings.sql','utf8'));await db.exec(sql);await read()
await db.exec(fallbackSql)
// Exercise the real lifecycle resolver, including legacy null organization IDs.
for (const [n,role,status,staffOrg] of [[7,'staff','active',10],[8,'admin','active',10],[9,'staff','inactive',10],[10,'staff','resigned',10],[11,'customer','active',10],[12,'staff','active',20]]) {
 await db.query('INSERT INTO users VALUES($1,$2,NULL)',[id(n),role])
 await db.query('INSERT INTO staff VALUES($1,$2,$3)',[id(n),id(staffOrg),status])
}
for (const n of [7,8]) {
 await actor(n); await db.exec('SET ROLE authenticated')
 const snapshot=await read(); await save(snapshot.questions,snapshot.revision)
 await db.query('SELECT list_survey_question_sources($1)',[id(10)])
 await assert.rejects(read(200),e=>e.code==='42501')
 await assert.rejects(db.query('SELECT require_survey_question_staff($1)',[id(10)]),e=>e.code==='42501')
 await db.exec('RESET ROLE')
}
for (const n of [9,10,11,12]) { await actor(n); await assert.rejects(read(),e=>e.code==='42501') }
await actor(7)
await db.exec(fs.readFileSync('supabase/rollbacks/20260928014000_survey_staff_organization_fallback.sql','utf8'))
await assert.rejects(read(),e=>e.code==='42501')
await db.exec(fallbackSql);await read()
// Question reads/saves must still work when all browser table grants are closed.
await db.exec(`CREATE TABLE private_groups(id uuid);CREATE TABLE private_group_members(id uuid);CREATE TABLE private_group_candidate_dates(id uuid);CREATE TABLE private_group_date_responses(id uuid);CREATE TABLE private_group_messages(id uuid);CREATE TABLE private_group_invitations(id uuid);`)
await db.exec(fs.readFileSync('supabase/migrations/20260927113000_private_group_direct_access_closure.sql','utf8'))
await actor(1);await db.exec('SET ROLE authenticated')
await assert.rejects(db.query('SELECT * FROM org_scenario_survey_questions'),e=>e.code==='42501')
const closedSnapshot=await read();assert.equal((await save([question(3000)],closedSnapshot.revision)).questions.length,1)
await db.exec('RESET ROLE')
await db.close();console.log('survey question settings DB: PASS (authorization, atomicity, revision, ownership, response preservation, rollback)')

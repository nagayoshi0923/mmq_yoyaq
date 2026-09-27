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
await db.exec(`ALTER TABLE private_groups ADD COLUMN status text DEFAULT 'gathering', ADD COLUMN reservation_id uuid, ADD COLUMN preferred_store_ids uuid[] DEFAULT '{}';
ALTER TABLE organization_scenarios ADD COLUMN available_stores text[] DEFAULT '{}';
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,status text);
CREATE TABLE stores(id uuid PRIMARY KEY,organization_id uuid,status text DEFAULT 'active',ownership_type text DEFAULT 'direct',is_temporary boolean DEFAULT false);
CREATE TABLE private_group_candidate_dates(id uuid PRIMARY KEY,group_id uuid,date date,time_slot text,start_time text,end_time text,status text DEFAULT 'active');
CREATE TABLE private_group_date_responses(candidate_date_id uuid REFERENCES private_group_candidate_dates(id) ON DELETE CASCADE);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,store_id uuid,date date,start_time time,end_time time,is_cancelled boolean DEFAULT false);
CREATE TABLE schedule_blocked_slots(organization_id uuid,store_id text,date date,time_slot text);
CREATE TABLE fixture_preparation(store_id uuid,event_id uuid,minutes integer);
CREATE FUNCTION resolve_preparation_minutes(o uuid,s uuid,c uuid,e uuid) RETURNS integer LANGUAGE sql AS $$SELECT coalesce((SELECT minutes FROM fixture_preparation WHERE store_id=s OR event_id=e LIMIT 1),0)$$;`)
for(const [n,org]of [[201,10],[202,10],[203,20],[204,10],[205,10]])await db.query('INSERT INTO stores(id,organization_id) VALUES($1,$2)',[id(n),id(org)])
await db.exec("UPDATE stores SET is_temporary=true WHERE id='"+id(204)+"'; UPDATE stores SET ownership_type='office' WHERE id='"+id(205)+"'")
const migration=fs.readFileSync('supabase/migrations/20260927033000_private_group_preferred_stores.sql','utf8')
await db.exec(migration)
const actor=async n=>db.query("SELECT set_config('test.actor',$1,false)",[n?id(n):''])
async function save(a,stores=[201],expected=[]){await actor(a);return db.query('SELECT private_group_set_preferred_stores($1,$2,$3) AS removed',[id(100),stores?.map(id),expected?.map(id)])}
for(const a of [null,2,4,5,999])await assert.rejects(save(a),e=>e.code==='42501')
for(const stores of [[],null,[203],[204],[205],[999]])await assert.rejects(save(1,stores),e=>e.code==='22023')
await assert.rejects(save(1,[201],null),e=>e.code==='40001')
await db.query("UPDATE private_groups SET status='booking_requested'")
await assert.rejects(save(1),e=>e.code==='22023')
await db.exec("UPDATE private_groups SET status='gathering',reservation_id='"+id(400)+"'; INSERT INTO reservations VALUES('"+id(400)+"','"+id(10)+"','pending')")
await assert.rejects(save(1),e=>e.code==='22023')
await db.exec("UPDATE reservations SET status='cancelled'")
const addCandidate=async(n,date='2030-01-01',start='15:00',end='17:00',status='active')=>db.query('INSERT INTO private_group_candidate_dates VALUES($1,$2,$3,\'afternoon\',$4,$5,$6)',[id(n),id(100),date,start,end,status])
await addCandidate(301);await addCandidate(302,'2030-01-01','15:00','17:00','rejected')
await db.query('INSERT INTO private_group_date_responses VALUES($1)',[id(301)])
await db.query("INSERT INTO schedule_events VALUES($1,$2,$3,'2030-01-01','15:30','16:00',false)",[id(501),id(10),id(201)])
// 1店舗が埋まっていても他の希望店舗に空きがあれば維持。180日より先の候補も対象。
assert.equal((await save(1,[201,202])).rows[0].removed,0)
await assert.rejects(save(1,[201],[]),e=>e.code==='40001')
// 最後のgroup保存が失敗しても候補・回答の削除を全て戻す。
await db.exec(`CREATE FUNCTION fail_save() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture failure';END$$;
CREATE TRIGGER fail_save BEFORE UPDATE ON private_groups FOR EACH ROW EXECUTE FUNCTION fail_save();`)
await assert.rejects(save(1,[201],[201,202]),/fixture failure/)
assert.equal((await db.query('SELECT * FROM private_group_candidate_dates')).rows.length,2)
assert.equal((await db.query('SELECT * FROM private_group_date_responses')).rows.length,1)
await db.exec('DROP TRIGGER fail_save ON private_groups')
await db.exec('SET ROLE authenticated')
assert.equal((await save(1,[201],[201,202])).rows[0].removed,1)
await db.exec('RESET ROLE')
assert.equal((await db.query('SELECT * FROM private_group_date_responses')).rows.length,0)
assert.deepEqual((await db.query('SELECT id FROM private_group_candidate_dates')).rows.map(x=>x.id),[id(302)])
// 募集停止枠も予約申請時と同様に不可。取消公演と別組織の公演は影響しない。
await addCandidate(303,'2030-02-01')
await db.query("INSERT INTO schedule_blocked_slots VALUES($1,$2,'2030-02-01','afternoon')",[id(10),id(201)])
assert.equal((await save(3,[201],[201])).rows[0].removed,1)
await addCandidate(304,'2030-03-01')
await db.query("INSERT INTO schedule_events VALUES($1,$2,$3,'2030-03-01','15:00','17:00',true)",[id(502),id(10),id(201)])
await db.query("INSERT INTO schedule_events VALUES($1,$2,$3,'2030-03-01','15:00','17:00',false)",[id(503),id(20),id(201)])
assert.equal((await save(1,[201],[201])).rows[0].removed,0)
// 前日の深夜公演と準備時間の競合。準備時間0と60を区別。
await addCandidate(305,'2030-04-02','00:30','02:00')
await db.query("INSERT INTO schedule_events VALUES($1,$2,$3,'2030-04-01','23:00','00:30',false)",[id(504),id(10),id(201)])
assert.equal((await save(1,[201],[201])).rows[0].removed,0)
await db.query('INSERT INTO fixture_preparation VALUES($1,NULL,60)',[id(201)])
assert.equal((await save(1,[201],[201])).rows[0].removed,1)
// 作品に明示された臨時店舗は選べるが、作品の許可外店舗は拒否。
await db.query('UPDATE organization_scenarios SET available_stores=$1',[[id(204)]])
await assert.rejects(save(1,[201],[201]),e=>e.code==='22023')
assert.equal((await save(1,[204],[201])).rows[0].removed,0)
await db.exec('SET ROLE anon')
await assert.rejects(save(1,[204],[204]),e=>e.code==='42501')
await db.exec('RESET ROLE')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927033000_private_group_preferred_stores.sql','utf8'))
await db.exec(migration);await db.close()
console.log('PASS preferred stores: auth/scope/eligibility/status/stale, free alternative, blocked slots, preparation/overnight, cascade atomic rollback, rollback/reapply')

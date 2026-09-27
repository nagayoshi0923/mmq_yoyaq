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
CREATE SCHEMA extensions; CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql AS $$ SELECT sha256(convert_to($1,'UTF8')) $$;
CREATE TABLE private_group_guest_sessions(token_hash text,member_id uuid,expires_at timestamptz);`)
for(const [n,role,org] of [[1,'customer',null],[2,'customer',null],[3,'staff',10],[4,'staff',20],[5,'staff',10],[6,'admin',10],[7,'license_admin',20],[8,'customer',null]]) await db.query('INSERT INTO users VALUES($1,$2,$3)',[id(n),role,org?id(org):null])
await db.query('INSERT INTO private_groups VALUES($1,$2,$3)',[id(100),id(10),id(1)])
for(const [n,u,status] of [[101,1,'joined'],[102,2,'joined'],[103,8,'declined'],[104,null,'joined']]) await db.query('INSERT INTO private_group_members VALUES($1,$2,$3,$4,$5,false,$6,now(),now())',[id(n),id(100),u?id(u):null,'fixture',`${n}@example.invalid`,status])
for(const [u,o,status] of [[3,10,'active'],[4,20,'active'],[5,10,'resigned']])await db.query('INSERT INTO staff VALUES($1,$2,$3)',[id(u),id(o),status])
const guestSql=fs.readFileSync('supabase/migrations/20260927006000_private_group_member_sessions.sql','utf8');
await db.exec(guestSql.slice(guestSql.indexOf('CREATE FUNCTION public.require_private_group_member('),guestSql.indexOf('CREATE FUNCTION public.join_private_group(')));
const migration=fs.readFileSync('supabase/migrations/20260927026000_private_group_read_authorization.sql','utf8')
await db.exec(migration)

await db.exec(`ALTER TABLE private_groups ADD COLUMN invite_code text, ADD COLUMN scenario_master_id uuid, ADD COLUMN name text, ADD COLUMN status text DEFAULT 'gathering', ADD COLUMN reservation_id uuid, ADD COLUMN target_participant_count integer, ADD COLUMN preferred_store_ids uuid[], ADD COLUMN notes text, ADD COLUMN created_at timestamptz, ADD COLUMN updated_at timestamptz, ADD COLUMN total_price integer, ADD COLUMN per_person_price integer, ADD COLUMN character_assignments jsonb, ADD COLUMN character_assignment_method text;
ALTER TABLE private_group_members ADD COLUMN guest_phone text, ADD COLUMN coupon_id uuid, ADD COLUMN payment_amount integer, ADD COLUMN coupon_discount integer, ADD COLUMN final_amount integer, ADD COLUMN payment_status text;
ALTER TABLE staff ADD COLUMN id uuid, ADD COLUMN name text;
CREATE TABLE customers(id uuid,user_id uuid,nickname text,name text);
CREATE TABLE reservations(id uuid,organization_id uuid,status text,confirmed_by uuid);
CREATE TABLE scenario_masters(id uuid,title text,key_visual_url text,player_count_min integer,player_count_max integer);
CREATE TABLE organization_scenarios_with_master(organization_id uuid,scenario_master_id uuid,characters jsonb,player_count_min integer,player_count_max integer,survey_enabled boolean);
CREATE TABLE private_group_candidate_dates(id uuid,group_id uuid,order_num integer,date date);
CREATE TABLE private_group_date_responses(id uuid,group_id uuid,member_id uuid,candidate_date_id uuid,response text);
CREATE TABLE private_group_survey_responses(group_id uuid,member_id uuid,responses jsonb,submitted_at timestamptz);
CREATE TABLE private_group_messages(id uuid,group_id uuid,member_id uuid,message text,created_at timestamptz,sender_type text);`)
await db.query("UPDATE private_groups SET invite_code='fixture-invite',notes='internal note'")
await db.query('INSERT INTO private_group_candidate_dates VALUES($1,$2,1,current_date)',[id(200),id(100)])
await db.query("INSERT INTO private_group_messages VALUES($1,$2,$3,'private message',now(),'member')",[id(300),id(100),id(101)])
await db.query("INSERT INTO customers VALUES($1,$2,NULL,'staff-only customer name')",[id(900),id(2)])
await db.exec(fs.readFileSync('supabase/migrations/20260927028000_private_group_read_snapshot.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260927030000_private_group_notice_read_scope.sql','utf8'))
async function read(actor, member=null, token=null, limit=100, before=null) {
 await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):''])
 return (await db.query('SELECT private_group_read_messages($1,$2,$3,$4,$5,$6) result',[id(100),member?id(member):null,token,before?.created_at||null,before?.id||null,limit])).rows[0].result
}
async function notice(n, member, user=null) {
 await db.query("INSERT INTO private_group_messages VALUES($1,$2,$3,$4,'2026-01-01'::timestamptz+$5*interval '1 second','system')",[id(n),id(100),id(member),JSON.stringify({type:'system',action:'individual_notice',target_member_id:id(member),target_user_id:user?id(user):null,message:'secret'}),n])
}
await notice(401,101,1); await notice(402,102,2); await notice(403,104); await notice(404,999,2)
assert.deepEqual((await read(1)).map(x=>x.id).sort(),[id(300),id(401)].sort())
assert.deepEqual((await read(2)).map(x=>x.id).sort(),[id(300),id(402),id(404)].sort())
assert.equal((await read(3)).length,5)
assert.deepEqual((await read(1,102)).map(x=>x.id).sort(),[id(300),id(401)].sort())
for (const actor of [null,4,5,8,999]) await assert.rejects(read(actor),e=>e.code==='42501')
const token='a'.repeat(64)
await db.query("INSERT INTO private_group_guest_sessions VALUES(encode(extensions.digest($1,'sha256'),'hex'),$2,now()+interval '1 hour')",[token,id(104)])
await db.exec('SET ROLE anon')
assert.deepEqual((await read(null,104,token)).map(x=>x.id).sort(),[id(300),id(403)].sort())
await assert.rejects(read(null,102,token),e=>e.code==='42501')
await db.exec('RESET ROLE')
// 他人宛ての最新通知が大量にあっても、本人の古い通知へページングできる。
for(let n=500;n<610;n++)await notice(n,101,1)
const page1=await read(2,null,null,2)
assert.equal(page1.length,2)
const page2=await read(2,null,null,2,page1[0])
assert.equal(page2.length,1)
assert.deepEqual([...page2,...page1].map(x=>x.id).sort(),[id(300),id(402),id(404)].sort())
await db.query("INSERT INTO private_group_messages VALUES($1,$2,NULL,'{broken json',now(),'member')",[id(800),id(100)])
assert.ok((await read(2)).some(x=>x.message==='{broken json'))
await db.exec(fs.readFileSync('supabase/rollbacks/20260927030000_private_group_notice_read_scope.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260927030000_private_group_notice_read_scope.sql','utf8'))
assert.equal((await read(2)).length,4)
// 送信先・資料・定型文は認証した組織の現在値から解決する。
await db.exec(`CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;
ALTER TABLE organization_scenarios_with_master ADD COLUMN org_scenario_id uuid,ADD COLUMN individual_notice_template text;
CREATE TABLE global_settings(organization_id uuid,individual_notice_default_body text);
ALTER TABLE private_group_messages ALTER COLUMN id SET DEFAULT gen_random_uuid(),ALTER COLUMN created_at SET DEFAULT now();`)
const guards=fs.readFileSync(fs.readdirSync('supabase/migrations').map(x=>'supabase/migrations/'+x).find(x=>x.includes('202609270061')),'utf8')
await db.exec(guards.slice(guards.indexOf('CREATE FUNCTION public.private_group_actor_role'),guards.indexOf('CREATE FUNCTION public.guard_private_group_browser_write')))
await db.query('UPDATE private_groups SET scenario_master_id=$1',[id(20)])
await db.query("INSERT INTO organization_scenarios_with_master(organization_id,scenario_master_id,org_scenario_id,characters,individual_notice_template) VALUES($1,$2,$3,$4,'作品定型文')",[id(10),id(20),id(30),JSON.stringify([{id:'a',name:'役A',url:'https://example.invalid/a',survey_description:'役の説明'}])])
await db.query("INSERT INTO global_settings VALUES($1,'組織定型文')",[id(10)])
await db.query('UPDATE staff SET name=$1,id=$2 WHERE user_id=$3',['担当者',id(303),id(3)])
async function send(actor,member=102,message='連絡',char='a',template=true){
 await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):''])
 return (await db.query('SELECT private_group_send_individual_notice($1,$2,$3,$4,$5) result',[id(100),id(member),message,char,template])).rows[0].result
}
for(const actor of [null,1,2,4,5,999])await assert.rejects(send(actor),e=>e.code==='42501')
for(const member of [103,999])await assert.rejects(send(3,member),e=>e.code==='22023')
await assert.rejects(send(3,102,'','bad'),e=>e.code==='22023')
await assert.rejects(send(3,102,'',null,false),e=>e.code==='22023')
const sent=await send(3)
assert.ok(sent.id);assert.ok(sent.created_at)
const payload=JSON.parse(sent.message)
assert.equal(payload.target_user_id,id(2));assert.equal(payload.target_member_name,'ニックネーム未設定')
assert.equal(payload.sent_by,'担当者');assert.equal(payload.character_name,'役A')
assert.ok(payload.message.includes('作品定型文'));assert.ok(!payload.message.includes('組織定型文'))
assert.ok(payload.message.includes('役の説明'));assert.ok(payload.message.includes('https://example.invalid/a'))
assert.ok(!(await read(1)).some(x=>x.id===sent.id));assert.ok((await read(2)).some(x=>x.id===sent.id))
await db.query('UPDATE organization_scenarios_with_master SET individual_notice_template=NULL')
const inherited=JSON.parse((await send(3,104,'',null,true)).message)
assert.equal(inherited.message,'組織定型文');assert.equal(inherited.target_user_id,null)
await db.close()
console.log('PASS individual notice read scope: own/organizer/staff/guest/spoof/recreated user, plain text, pagination, rollback/reapply')

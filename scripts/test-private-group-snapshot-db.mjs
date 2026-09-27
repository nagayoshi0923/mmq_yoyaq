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
const snapshotSql=fs.readFileSync('supabase/migrations/20260927028000_private_group_read_snapshot.sql','utf8')
await db.exec(snapshotSql)
async function snap(actor,invite=null,member=null,token=null){await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):'']);return (await db.query('SELECT private_group_read_snapshot($1,$2,$3,$4) result',[id(100),invite,member?id(member):null,token])).rows[0].result}
const preview=await snap(null,'fixture-invite');assert.equal(preview.access_level,'preview');assert.deepEqual(preview.group.members,[]);assert.equal(preview.group.notes,null);assert.equal(preview.group.candidate_dates.length,1)
for(const actor of [null,4,5,8,999])await assert.rejects(snap(actor),e=>e.code==='42501')
await assert.rejects(snap(null,'wrong'),e=>e.code==='42501')
const member=await snap(2);assert.equal(member.access_level,'member');assert.equal(member.current_member_id,id(102));assert.equal(member.group.members.filter(x=>x.guest_email!==null).length,1)
assert.equal(member.group.members.find(x=>x.id===id(102)).staff_display_name,null)
assert.equal((await snap(3)).group.members.find(x=>x.id===id(102)).staff_display_name,'staff-only customer name')
assert.equal((await snap(1)).group.members.find(x=>x.id===id(102)).staff_display_name,null)
const spoof=await snap(2,null,104);assert.equal(spoof.current_member_id,id(102));assert.equal(spoof.group.members.find(x=>x.id===id(104)).guest_email,null)
assert.equal((await snap(1)).group.notes,'internal note');assert.equal((await snap(3)).access_level,'staff')
await snap(4,'fixture-invite');await assert.rejects(db.query('SELECT private_group_read_messages($1)',[id(100)]),e=>e.code==='42501')
await snap(2);assert.equal((await db.query('SELECT private_group_read_messages($1) result',[id(100)])).rows[0].result.length,1)
// 最新100件を昇順で返す。古い先頭100件で新着が欠落しない。
await db.query("INSERT INTO private_group_messages SELECT ('00000000-0000-0000-0001-'||lpad(n::text,12,'0'))::uuid,$1,$2,'message '||n,'2026-01-01'::timestamptz+n*interval '1 second','member' FROM generate_series(1,105) n",[id(100),id(101)])
const recent=(await db.query('SELECT private_group_read_messages($1) result',[id(100)])).rows[0].result
assert.equal(recent.length,100);assert.equal(recent[0].message,'message 7');assert.equal(recent.at(-1).message,'private message')
const historyPage=(await db.query('SELECT private_group_read_messages($1,NULL,NULL,NULL,NULL,50) result',[id(100)])).rows[0].result
const older=(await db.query('SELECT private_group_read_messages($1,NULL,NULL,$2,$3,500) result',[id(100),historyPage[0].created_at,historyPage[0].id])).rows[0].result
assert.equal(historyPage.length,50);assert.equal(older.length,56)
assert.equal(new Set([...older,...historyPage].map(m=>m.id)).size,106)
await assert.rejects(db.query('SELECT private_group_read_messages($1,NULL,NULL,now(),NULL,100)',[id(100)]),e=>e.code==='22023')
const token='a'.repeat(64)
await db.query("INSERT INTO private_group_guest_sessions VALUES(encode(extensions.digest($1,'sha256'),'hex'),$2,now()+interval '1 hour')",[token,id(104)])
const guest=await snap(null,null,104,token);assert.equal(guest.current_member_id,id(104));assert.equal(guest.group.members.filter(x=>x.guest_email!==null).length,1)
await assert.rejects(snap(null,null,104,'b'.repeat(64)),e=>e.code==='42501')
await assert.rejects(snap(null,null,102,token),e=>e.code==='42501')
await db.exec('SET ROLE anon');assert.equal((await snap(null,'fixture-invite')).access_level,'preview');assert.equal((await snap(null,null,104,token)).access_level,'member');await db.exec('RESET ROLE')
await db.query("UPDATE private_group_guest_sessions SET expires_at=now()-interval '1 second'")
await assert.rejects(snap(null,null,104,token),e=>e.code==='42501')
assert.equal((await snap(null,'fixture-invite',104,token)).access_level,'preview')
// 一覧自体の認可を空結果に依存させず、組織横断と退職済みを拒否する。
async function list(actor,scope='joined',org=null,after=null,limit=100){
 await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):'']);
 return (await db.query('SELECT private_group_read_list($1,$2,$3,$4) result',[scope,org?id(org):null,after,limit])).rows[0].result
}
assert.equal((await list(2)).length,1)
assert.equal((await list(8)).length,0)
assert.equal((await list(1,'organized')).length,1)
assert.equal((await list(2,'organized')).length,0)
assert.equal((await list(3,'staff',10)).length,1)
for(const actor of [null,2,4,5]) await assert.rejects(list(actor,'staff',10),e=>e.code==='42501')
await assert.rejects(list(3,'staff',null),e=>e.code==='42501')
await assert.rejects(list(3,'bad',10),e=>e.code==='22023')
await assert.rejects(list(3,'staff',10,null,101),e=>e.code==='22023')
await db.query("INSERT INTO private_groups(id,organization_id,organizer_id,invite_code,created_at) SELECT ('00000000-0000-0000-0002-'||lpad(n::text,12,'0'))::uuid,$1,$2,'page-'||n,now() FROM generate_series(1,105) n",[id(10),id(1)])
const first=await list(1,'organized');assert.equal(first.length,100)
const second=await list(1,'organized',null,first.at(-1).id);assert.equal(second.length,6)
assert.equal(new Set([...first,...second].map(g=>g.id)).size,106)
assert.equal((await list(1,'organized',null,second.at(-1).id)).length,0)
assert.equal((await list(4,'staff',20)).length,0)
await list(3,'staff',10)
const subset=(await db.query("SELECT private_group_read_list('staff',$1,NULL,100,$2::uuid[]) result",[id(10),[id(100),id(999)]] )).rows[0].result
assert.deepEqual(subset.map(g=>g.id),[id(100)])
await db.query('INSERT INTO reservations(id,organization_id) VALUES($1,$2)',[id(800),id(10)])
await db.query('UPDATE private_groups SET reservation_id=$1 WHERE id=$2',[id(800),id(100)])
await db.query('INSERT INTO private_group_survey_responses VALUES($1,$2,$3,now())',[id(100),id(102),JSON.stringify({answer:'private'})])
await list(3,'staff',10)
assert.equal((await db.query('SELECT private_group_read_reservation($1) result',[id(800)])).rows[0].result.group.id,id(100))
assert.equal((await db.query('SELECT private_group_read_reservation($1) result',[id(999)])).rows[0].result,null)
assert.equal((await db.query('SELECT private_group_read_survey_responses($1) result',[id(100)])).rows[0].result.length,1)
for(const actor of [1,2,4,5]) {
 await db.query("SELECT set_config('test.actor',$1,false)",[id(actor)])
 await assert.rejects(db.query('SELECT private_group_read_survey_responses($1)',[id(100)]),e=>e.code==='42501')
}
await assert.rejects(db.query('SELECT private_group_read_reservation($1)',[id(800)]),e=>e.code==='42501')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927028000_private_group_read_snapshot.sql','utf8'));await db.exec(snapshotSql);assert.equal((await snap(2)).group.members.length,4)
// 幹事メンバー削除後も共通プロフィールから表示名を解決し、staff以外へ投影しない。
const organizerMigration = fs.readFileSync('supabase/migrations/20260927094830_private_group_organizer_display_name.sql','utf8')
await db.exec('ALTER TABLE customers ADD COLUMN organization_id uuid')
await db.exec(organizerMigration)
await db.query('INSERT INTO customers(id,user_id,nickname,name,organization_id) VALUES($1,$2,$3,$4,NULL)',[id(901),id(1),'共通幹事','実名'])
assert.equal((await snap(3)).group.organizer_display_name,'共通幹事')
assert.equal((await list(3,'staff',10)).find(g=>g.id===id(100)).organizer_display_name,'共通幹事')
await db.query('DELETE FROM private_group_members WHERE id=$1',[id(101)])
assert.equal((await snap(3)).group.organizer_display_name,'共通幹事')
for (const actor of [1,2]) assert.equal((await snap(actor)).group.organizer_display_name,null)
assert.equal((await snap(null,'fixture-invite')).group.organizer_display_name,null)
assert.equal((await snap(4,'fixture-invite')).group.organizer_display_name,null)
for (const actor of [null,4,5,8,999]) await assert.rejects(snap(actor),e=>e.code==='42501')
await db.query('UPDATE customers SET nickname=NULL,organization_id=$1 WHERE id=$2',[id(20),id(901)])
assert.equal((await snap(3)).group.organizer_display_name,'実名')
await db.query('DELETE FROM customers WHERE id=$1',[id(901)])
assert.equal((await snap(3)).group.organizer_display_name,null)
await db.query("INSERT INTO private_group_members(id,group_id,user_id,guest_name,is_organizer,status) VALUES($1,$2,$3,'幹事入力名',true,'joined')",[id(101),id(100),id(1)])
assert.equal((await snap(3)).group.organizer_display_name,'幹事入力名')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927094830_private_group_organizer_display_name.sql','utf8'))
assert.equal(Object.hasOwn((await snap(3)).group,'organizer_display_name'),false)
await db.exec(organizerMigration)
assert.equal((await snap(3)).group.organizer_display_name,'幹事入力名')
console.log('PASS organizer: NULL/other-org profile, deleted member, nickname/name/member fallback, no profile, staff-only field, cross-org/inactive denied, rollback/reapply')
// The production SELECT boundary must preserve preview/member/staff RPCs.
await db.exec('CREATE TABLE org_scenario_survey_questions(id uuid); CREATE TABLE private_group_invitations(id uuid);')
await db.exec(fs.readFileSync('supabase/migrations/20260927113000_private_group_direct_access_closure.sql','utf8'))
for (const [actor,role,invite,level] of [[null,'anon','fixture-invite','preview'],[2,'authenticated',null,'member'],[3,'authenticated',null,'staff']]) {
 await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):''])
 await db.exec(`SET ROLE ${role}`)
 try {
  await assert.rejects(db.query('SELECT * FROM private_group_members'),e=>e.code==='42501')
  assert.equal((await db.query('SELECT private_group_read_snapshot($1,$2) result',[id(100),invite])).rows[0].result.access_level,level)
 } finally { await db.exec('RESET ROLE') }
}
await db.close();console.log('PASS snapshot: preview minimal, member contacts private, spoofed member denied, chat membership, rollback/reapply; actual guest validator valid/invalid/expired tokens and anon role')

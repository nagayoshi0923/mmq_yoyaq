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

await db.exec(`ALTER TABLE users ADD COLUMN email text, ADD COLUMN display_name text;
CREATE TABLE private_group_invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid NOT NULL REFERENCES private_groups(id),invited_user_id uuid,invited_email text NOT NULL,invited_by uuid NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),created_at timestamptz NOT NULL DEFAULT now(),responded_at timestamptz,UNIQUE(group_id,invited_email));`)
for(const n of [9,11,12]) await db.query("INSERT INTO users(id,role,email) VALUES($1,'customer',$2)",[id(n),`target${n}@example.invalid`])
await db.query("UPDATE users SET email='organizer@example.invalid' WHERE id=$1",[id(1)])
await db.query("UPDATE users SET email='member@example.invalid' WHERE id=$1",[id(2)])
await db.query("INSERT INTO customers VALUES($1,$2,'公開ニックネーム','実名は返さない')",[id(901),id(9)])
const sql=fs.readFileSync('supabase/migrations/20260927105000_private_group_invitations_rpc.sql','utf8')
await db.exec(sql)
async function call(actor,name,args){
 await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):''])
 return (await db.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result
}
const search=(a,email,group=100)=>call(a,'private_group_search_invitee',[id(group),email])
const list=(a,after=null,limit=100)=>call(a,'private_group_read_invitations',[id(100),after,limit])
const create=(a,target)=>call(a,'private_group_manage_invitation',[id(100),'create',id(target),null,target===1?'organizer@example.invalid':target===2?'member@example.invalid':`target${target}@example.invalid`])
const cancel=(a,inv)=>call(a,'private_group_manage_invitation',[id(100),'cancel',null,inv])
for(const a of [null,4,5,8,999]){
 await assert.rejects(search(a,'target9@example.invalid'),e=>e.code==='42501')
 await assert.rejects(list(a),e=>e.code==='42501')
 await assert.rejects(create(a,9),e=>e.code==='42501')
}
assert.equal(await search(2,'%@example.invalid'),null)
assert.equal(await search(2,'target_@example.invalid'),null)
assert.equal(await search(2,'unknown@example.invalid'),null)
await assert.rejects(search(2,'bad'),e=>e.code==='22023')
await assert.rejects(search(1,'organizer@example.invalid'),e=>e.code==='23514')
await assert.rejects(search(1,'member@example.invalid'),e=>e.code==='23514')
assert.deepEqual(await search(2,' TARGET9@EXAMPLE.INVALID '),{id:id(9),email:'target9@example.invalid',display_name:'公開ニックネーム'})
const own=await create(2,9);assert.equal(own.status,'pending')
assert.deepEqual(await create(2,9),own)
const other=await create(1,11)
assert.deepEqual((await list(2)).map(x=>x.id),[own.id])
assert.equal((await list(1)).length,2);assert.equal((await list(3)).length,2)
await assert.rejects(cancel(2,other.id),e=>e.code==='42501')
assert.equal((await cancel(2,own.id)).status,'cancelled')
assert.equal((await cancel(2,own.id)).status,'cancelled')
assert.equal((await create(2,9)).id,own.id)
await assert.rejects(call(2,'private_group_manage_invitation',[id(100),'create',id(12),null,null]),e=>e.code==='22023')
await assert.rejects(call(2,'private_group_manage_invitation',[id(100),'create',id(12),null,'wrong@example.invalid']),e=>e.code==='23514')
await db.query("UPDATE private_group_invitations SET status='declined',responded_at=now() WHERE id=$1",[own.id])
const declinedBefore=(await db.query('SELECT responded_at FROM private_group_invitations WHERE id=$1',[own.id])).rows[0].responded_at
await assert.rejects(create(2,9),e=>e.code==='23514')
await assert.rejects(cancel(1,own.id),e=>e.code==='23514')
assert.equal((await db.query('SELECT responded_at FROM private_group_invitations WHERE id=$1',[own.id])).rows[0].responded_at.valueOf(),declinedBefore.valueOf())
await db.query("UPDATE private_group_invitations SET status='accepted' WHERE id=$1",[own.id])
await assert.rejects(cancel(1,own.id),e=>e.code==='23514')
await assert.rejects(create(2,9),e=>e.code==='23514')
await assert.rejects(cancel(1,id(9999)),e=>e.code==='42501')
await assert.rejects(call(1,'private_group_manage_invitation',[id(100),null,null,null]),e=>e.code==='22023')
await assert.rejects(create(1,1),e=>e.code==='22023')
await assert.rejects(create(1,2),e=>e.code==='23514')
await db.query("INSERT INTO private_group_invitations(group_id,invited_user_id,invited_email,invited_by) VALUES($1,$2,'TARGET11@EXAMPLE.INVALID',$3)",[id(100),id(11),id(1)])
await assert.rejects(create(1,11),e=>e.code==='23514')
await db.query("DELETE FROM private_group_invitations WHERE invited_email='TARGET11@EXAMPLE.INVALID'")
await db.query("UPDATE private_groups SET status='cancelled' WHERE id=$1",[id(100)])
await assert.rejects(search(1,'target12@example.invalid'),e=>e.code==='23514')
await assert.rejects(create(1,12),e=>e.code==='23514')
assert.equal((await cancel(1,other.id)).status,'cancelled')
await db.query("UPDATE private_groups SET status='gathering' WHERE id=$1",[id(100)])
await db.query("INSERT INTO private_group_invitations(id,group_id,invited_email,invited_by) SELECT ('00000000-0000-0000-0003-'||lpad(n::text,12,'0'))::uuid,$1,'fixture'||n||'@example.invalid',$2 FROM generate_series(1,105) n",[id(100),id(1)])
const page=await list(1);const next=await list(1,page.at(-1).id)
assert.equal(page.length,100);assert.equal(next.length,7);assert.equal(new Set([...page,...next].map(x=>x.id)).size,107)
await db.exec('SET ROLE anon');await assert.rejects(search(null,'target9@example.invalid'),e=>e.code==='42501');await db.exec('RESET ROLE')
await db.exec('SET ROLE authenticated');assert.equal((await list(1)).length,100);await db.exec('RESET ROLE')
const before=(await db.query('SELECT count(*)::int count FROM private_group_invitations')).rows[0].count
await db.exec(fs.readFileSync('supabase/rollbacks/20260927105000_private_group_invitations_rpc.sql','utf8'))
await db.exec(sql)
assert.equal((await db.query('SELECT count(*)::int count FROM private_group_invitations')).rows[0].count,before)
assert.equal((await list(1)).length,100)
await db.close()
console.log('PASS invitations: actual group auth, anonymous/other-org/inactive denied, exact email, member/self blocked, nickname only, own history privacy, create retry/cancel/reinvite, answered immutable, cancelled group, pagination, authenticated role, rollback/reapply keeps history')

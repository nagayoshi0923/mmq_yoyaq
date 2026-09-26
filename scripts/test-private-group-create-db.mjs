import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
const db = new PGlite({ extensions: { pgcrypto } })
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE organizations(id uuid PRIMARY KEY,is_active boolean);
CREATE TABLE stores(id uuid PRIMARY KEY,organization_id uuid,status text);
CREATE TABLE organization_scenarios_with_master(organization_id uuid,scenario_master_id uuid,player_count_min integer,player_count_max integer,accepts_private_booking boolean);
CREATE TABLE customers(id uuid,user_id uuid,name text,nickname text);
CREATE TABLE global_settings(organization_id uuid,system_msg_group_created_title text,system_msg_group_created_body text,system_msg_group_created_note text);
CREATE TABLE private_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,scenario_master_id uuid,organizer_id uuid,name text,invite_code text UNIQUE,status text,preferred_store_ids uuid[],notes text);
CREATE TABLE private_group_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid REFERENCES private_groups,user_id uuid,guest_name text,is_organizer boolean,status text,joined_at timestamptz);
CREATE TABLE private_group_candidate_dates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid REFERENCES private_groups,date date NOT NULL,time_slot text,start_time text,end_time text,order_num integer);
CREATE TABLE private_group_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid REFERENCES private_groups,member_id uuid REFERENCES private_group_members,message text);
CREATE FUNCTION candidate_deadline_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.date < current_date+7 THEN RAISE EXCEPTION 'deadline' USING ERRCODE='P0045'; END IF; RETURN NEW; END $$;
CREATE TRIGGER check_deadline BEFORE INSERT ON private_group_candidate_dates FOR EACH ROW EXECUTE FUNCTION candidate_deadline_fixture();
INSERT INTO organizations VALUES('${id(1)}',true),('${id(2)}',false);
INSERT INTO stores VALUES('${id(10)}','${id(1)}','active'),('${id(11)}','${id(2)}','active');
INSERT INTO organization_scenarios_with_master VALUES('${id(1)}','${id(20)}',4,8,true),('${id(1)}','${id(21)}',4,8,false);
INSERT INTO customers VALUES('${id(30)}','${id(40)}','real name','nickname');
INSERT INTO global_settings VALUES('${id(1)}','configured title','configured body','configured note');`)
const migration='20260927007000_private_group_atomic_create.sql'
const sql=fs.readFileSync('supabase/migrations/'+migration,'utf8')
await db.exec(sql)
async function create({user=id(40),org=id(1),scenario=id(20),stores=[id(10)],dates=[],name='group'}={}){
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user||''])
 await db.exec('SET ROLE '+(user?'authenticated':'anon'))
 try{return (await db.query('SELECT create_private_group_atomic($1,$2,$3,$4,$5,$6) result',[org,scenario,name,stores,JSON.stringify(dates),null])).rows[0].result}
 finally{await db.exec('RESET ROLE')}
}
const count=async table=>(await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n
await assert.rejects(()=>create({user:null}),/permission denied/)
await assert.rejects(()=>create({org:id(2)}),/組織/)
await assert.rejects(()=>create({scenario:id(21)}),/受け付け/)
await assert.rejects(()=>create({stores:[id(11)]}),/店舗/)
await assert.rejects(()=>create({dates:{}}),/形式/)
assert.equal(await count('private_groups'),0)
const future=(await db.query("SELECT (current_date+30)::text d")).rows[0].d
const candidate={date:future,time_slot:'午前',start_time:'10:00',end_time:'13:00',order_num:1}
const result=await create({dates:[candidate]})
assert.equal(result.organizer_id,id(40));assert.match(result.invite_code,/^[a-f0-9]{32}$/)
assert.equal(await count('private_groups'),1);assert.equal(await count('private_group_members'),1);assert.equal(await count('private_group_candidate_dates'),1)
assert.equal((await db.query('SELECT guest_name FROM private_group_members')).rows[0].guest_name,'nickname')
assert.equal(JSON.parse((await db.query('SELECT message FROM private_group_messages')).rows[0].message).title,'configured title')
await assert.rejects(()=>create({dates:[candidate,{...candidate,time_slot:'invalid'}]}),/形式/)
await assert.rejects(()=>create({dates:[candidate,{...candidate,date:'2000-01-01'}]}),/deadline/)
for(const table of ['private_groups','private_group_members','private_group_candidate_dates','private_group_messages'])assert.equal(await count(table),1,'failure rolls back '+table)
// A late message failure must roll back every earlier insert as well.
await db.exec(`CREATE FUNCTION fail_message_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'message insert failed'; END $$;
CREATE TRIGGER fail_message BEFORE INSERT ON private_group_messages FOR EACH ROW EXECUTE FUNCTION fail_message_fixture();`)
await assert.rejects(()=>create({dates:[candidate]}),/message insert failed/)
for(const table of ['private_groups','private_group_members','private_group_candidate_dates','private_group_messages'])assert.equal(await count(table),1,'late failure rolls back '+table)
await db.exec('DROP TRIGGER fail_message ON private_group_messages')
await create({dates:[]});assert.equal(await count('private_groups'),2,'no-date invitation remains supported')
await db.exec(fs.readFileSync('supabase/rollbacks/'+migration,'utf8'));await db.exec(sql)
assert.equal(await count('private_groups'),2,'rollback preserves created data')
await db.close()
console.log('PASS private group atomic create: ownership, organization/store/scenario validation, configured message, candidate and late-write rollback, no-date group, migration rollback/reapply')

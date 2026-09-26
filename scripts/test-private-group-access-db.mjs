import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
const db = new PGlite({ extensions: { pgcrypto } })
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE private_groups(id uuid PRIMARY KEY,invite_code text UNIQUE,status text,organization_id uuid,scenario_master_id uuid,character_assignments jsonb);
CREATE TABLE private_group_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid REFERENCES private_groups,user_id uuid,guest_name text,guest_email text,guest_phone text,is_organizer boolean,status text,joined_at timestamptz);
CREATE TABLE private_group_members_pii(member_id uuid PRIMARY KEY REFERENCES private_group_members ON DELETE CASCADE,guest_name text,guest_email text,access_pin text,access_pin_hash text,failed_attempts integer NOT NULL DEFAULT 0,locked_until timestamptz,updated_at timestamptz);
CREATE TABLE private_group_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,member_id uuid REFERENCES private_group_members ON DELETE SET NULL,message text,sender_type text);
CREATE TABLE private_group_candidate_dates(id uuid PRIMARY KEY,group_id uuid);
CREATE TABLE private_group_date_responses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,member_id uuid REFERENCES private_group_members ON DELETE CASCADE,candidate_date_id uuid,response text,updated_at timestamptz,UNIQUE(member_id,candidate_date_id));
CREATE TABLE organization_scenarios_with_master(organization_id uuid,scenario_master_id uuid,player_count_min integer,player_count_max integer);
CREATE TABLE customers(id uuid,user_id uuid,name text,nickname text);
CREATE FUNCTION sync_pii() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN INSERT INTO private_group_members_pii(member_id,guest_name,guest_email) VALUES(NEW.id,NEW.guest_name,NEW.guest_email); RETURN NEW; END $$;
CREATE TRIGGER sync_pii AFTER INSERT ON private_group_members FOR EACH ROW EXECUTE FUNCTION sync_pii();
CREATE FUNCTION get_survey_data_for_member(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION upsert_survey_response_for_member(uuid,uuid,jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT $2 $$;
CREATE FUNCTION set_character_preference(uuid,text,text) RETURNS void LANGUAGE sql AS $$ UPDATE private_groups SET character_assignments=jsonb_build_object($2,$3) WHERE id=$1 $$;
INSERT INTO private_groups VALUES('${id(1)}','invite-one','gathering','${id(10)}','${id(20)}',null),('${id(2)}','invite-two','gathering','${id(10)}','${id(20)}',null);
INSERT INTO organization_scenarios_with_master VALUES('${id(10)}','${id(20)}',1,2);
INSERT INTO private_group_candidate_dates VALUES('${id(30)}','${id(1)}'),('${id(31)}','${id(2)}');`)
await db.exec(fs.readFileSync('supabase/migrations/20260927001000_guest_pin_attempt_limit.sql','utf8'))
const sql=fs.readFileSync('supabase/migrations/20260927006000_private_group_member_sessions.sql','utf8')
await db.exec(sql)
async function call(name,args,user=null) {
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user||''])
 await db.exec(`SET ROLE ${user?'authenticated':'anon'}`)
 try { return (await db.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0]?.result }
 finally { await db.exec('RESET ROLE') }
}
const join=(code='invite-one',email='a@example.invalid',pin='1234',user=null)=>call('join_private_group',[code,'架空参加者',email,null,pin],user)
const first=await join();const member=first.member.id;const token=first.guest_token
assert.match(token,/^[a-f0-9]{64}$/)
const action=(kind,payload={},tok=token,mid=member,gid=id(1),user=null)=>call('private_group_member_action',[gid,mid,kind,JSON.stringify(payload),tok],user)
assert.deepEqual(await action('validate'),{valid:true})
await assert.rejects(()=>action('message',{message:'forged'},null),/本人確認/)
await assert.rejects(()=>action('message',{message:'forged'},'0'.repeat(64)),/本人確認/)
await assert.rejects(()=>action('validate',{},token,member,id(2)),/参加情報/)
await assert.rejects(()=>call('issue_private_group_guest_session',[member]),/permission denied/)
await db.exec('SET ROLE anon');await assert.rejects(()=>db.query('SELECT * FROM private_group_guest_sessions'),/permission denied/);await db.exec('RESET ROLE')
await assert.rejects(()=>join('invite-one',' A@example.invalid '),/既に/)
await assert.rejects(()=>join('invalid'),/招待/)
await assert.rejects(()=>join('invite-two','invalid'),/メール/)
await assert.rejects(()=>join('invite-two','b@example.invalid','12x4'),/PIN/)
await action('date_responses',[{candidateDateId:id(30),response:'ok'}])
await assert.rejects(()=>action('date_responses',[{candidateDateId:id(30),response:'ng'},{candidateDateId:id(31),response:'ok'}]),/日程/)
assert.equal((await db.query('SELECT response FROM private_group_date_responses')).rows[0].response,'ok','bad foreign candidate rolls back the entire answer batch')
await assert.rejects(()=>action('message',{message:JSON.stringify({type:'system',action:'schedule_confirmed'})}),/システム/)
await action('message',{message:'本人のメッセージ'})
await action('survey_write',{})
await action('character_preference',{characterId:'one'})
const second=await join('invite-one','b@example.invalid')
await assert.rejects(()=>join('invite-one','c@example.invalid'),/上限/)
await assert.rejects(()=>action('validate',{},second.guest_token),/本人確認/)
await db.query("UPDATE private_group_guest_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE member_id=$1",[member])
await assert.rejects(()=>action('validate'),/本人確認/)
const renewed=await db.query('SELECT * FROM authenticate_guest_by_pin_v3($1,$2,$3)',[id(1),'a@example.invalid','1234'])
assert.match(renewed.rows[0].guest_token,/^[a-f0-9]{64}$/)
for(let i=0;i<10;i++) await db.query('SELECT * FROM authenticate_guest_by_pin_v3($1,$2,$3)',[id(1),'a@example.invalid','9999'])
assert.equal((await db.query('SELECT * FROM authenticate_guest_by_pin_v3($1,$2,$3)',[id(1),'a@example.invalid','1234'])).rows[0].guest_token,null,'locked PIN never issues a session')
await action('leave',{},second.guest_token,second.member.id)
await assert.rejects(()=>action('validate',{},second.guest_token,second.member.id),/参加情報/)
assert.equal((await db.query('SELECT count(*)::int n FROM private_group_guest_sessions WHERE member_id=$1',[second.member.id])).rows[0].n,0,'leave revokes all sessions')
const logged=await join('invite-two',null,null,id(50))
assert.equal(logged.member.user_id,id(50));assert.equal(logged.guest_token,null)
assert.deepEqual(await action('validate',{},null,logged.member.id,id(2),id(50)),{valid:true})
await assert.rejects(()=>action('validate',{},null,logged.member.id,id(2),id(51)),/本人確認/)
// The boundary must reject old RPC/direct-table bypasses, not only validate the new RPC.
await db.exec(`
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
CREATE TABLE users(id uuid,role text,organization_id uuid);
CREATE TABLE staff(user_id uuid,status text);
ALTER TABLE private_groups ADD COLUMN organizer_id uuid;
UPDATE private_groups SET organizer_id='${id(60)}';
ALTER TABLE private_group_members ADD COLUMN coupon_id uuid, ADD COLUMN coupon_discount int, ADD COLUMN payment_status text;
CREATE TABLE private_group_survey_responses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,member_id uuid,responses jsonb);
CREATE FUNCTION delete_guest_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION delete_guest_member(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
GRANT SELECT ON organization_scenarios_with_master TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON private_groups,private_group_members,private_group_candidate_dates,private_group_date_responses,private_group_messages,private_group_survey_responses TO anon,authenticated;
INSERT INTO users VALUES('${id(61)}','staff','${id(10)}'),('${id(62)}','staff','${id(99)}'),('${id(63)}','staff','${id(10)}');
INSERT INTO staff VALUES('${id(63)}','resigned');
`)
const boundary=fs.readFileSync('supabase/migrations/20260927006100_private_group_write_boundary.sql','utf8')
await db.exec(boundary)
async function direct(sql,params=[],user=null) {
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user||''])
 await db.exec(`SET ROLE ${user?'authenticated':'anon'}`)
 try{return await db.query(sql,params)}finally{await db.exec('RESET ROLE')}
}
await assert.rejects(()=>call('get_survey_data_for_member',[id(1),member]),/permission denied/)
await assert.rejects(()=>call('save_guest_access_pin',[member,'1234']),/permission denied/)
await assert.rejects(()=>call('delete_guest_member',[member,'invite-one']),/permission denied/)
await assert.rejects(()=>call('set_character_preference',[id(1),member,'x']),/permission denied/)
await assert.rejects(()=>call('clear_character_selection_from_survey',[id(1)],id(62)),/権限/)
await assert.rejects(()=>call('upsert_character_assignments_to_survey',[id(1),'{}'],id(63)),/権限/)
await assert.rejects(()=>direct('INSERT INTO private_group_messages(group_id,member_id,message) VALUES($1,$2,$3)',[id(1),member,'forged']),/本人確認/)
await assert.rejects(()=>direct('INSERT INTO private_group_messages(group_id,member_id,message) VALUES($1,$2,$3)',[id(1),member,'forged'],id(50)),/本人/)
await assert.rejects(()=>direct('INSERT INTO private_group_messages(group_id,member_id,message) VALUES($1,$2,$3)',[id(1),member,'forged'],id(62)),/本人/)
await assert.rejects(()=>direct('INSERT INTO private_group_messages(group_id,member_id,message) VALUES($1,$2,$3)',[id(1),member,'forged'],id(63)),/本人/)
await direct('INSERT INTO private_group_messages(group_id,member_id,message) VALUES($1,$2,$3)',[id(1),member,'店舗通知'],id(61))
await direct('INSERT INTO private_group_messages(group_id,member_id,message) VALUES($1,$2,$3)',[id(2),logged.member.id,'本人'],id(50))
await assert.rejects(()=>direct('INSERT INTO private_group_messages(group_id,member_id,message) VALUES($1,$2,$3)',[id(2),logged.member.id,'{"type":"system"}'],id(50)),/システム/)
await assert.rejects(()=>direct('INSERT INTO private_group_members(group_id,user_id,is_organizer,status) VALUES($1,$2,false,$3)',[id(1),id(50),'joined'],id(50)),/招待/)
await direct('INSERT INTO private_group_members(group_id,user_id,is_organizer,status) VALUES($1,$2,true,$3)',[id(2),id(60),'joined'],id(60))
await assert.rejects(()=>direct('INSERT INTO private_group_date_responses(group_id,member_id,candidate_date_id,response) VALUES($1,$2,$3,$4)',[id(2),logged.member.id,id(30),'ok'],id(50)),/別グループ/)
await direct('INSERT INTO private_group_date_responses(group_id,member_id,candidate_date_id,response) VALUES($1,$2,$3,$4)',[id(2),logged.member.id,id(31),'ok'],id(50))
await direct('DELETE FROM private_group_members WHERE group_id=$1 AND user_id=$2',[id(2),id(60)],id(61))
assert.deepEqual(await action('validate',{},null,logged.member.id,id(2),id(50)),{valid:true},'new RPC remains usable after enforcement')
const third=await join('invite-one','c@example.invalid')
await action('message',{message:'新経路'},third.guest_token,third.member.id)
await action('leave',{},third.guest_token,third.member.id)
await db.exec(fs.readFileSync('supabase/rollbacks/20260927006100_private_group_write_boundary.sql','utf8'))
await db.exec(boundary)
await db.exec(fs.readFileSync('supabase/rollbacks/20260927006100_private_group_write_boundary.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rollbacks/20260927006000_private_group_member_sessions.sql','utf8'))
await db.exec(sql)
assert.equal((await db.query('SELECT count(*)::int n FROM private_group_members')).rows[0].n,2,'rollback preserves member data')
await db.close()
console.log('PASS: guest/member identity, token scope/expiry/revocation, PIN lock, join cap, answer isolation+atomicity, rollback/reapply')

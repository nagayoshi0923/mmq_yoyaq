import fs from 'node:fs'
import assert from 'node:assert/strict'
export async function testApprovalNotices(db,{org,scenario,store,gm,request,read}) {
 await db.exec(`
 ALTER TABLE reservations ADD COLUMN created_at timestamptz DEFAULT now();
 ALTER TABLE schedule_events ADD COLUMN scenario_id uuid;
 ALTER TABLE organization_scenarios ADD COLUMN characters jsonb DEFAULT '[]';
 CREATE TABLE global_settings(organization_id uuid,system_msg_schedule_confirmed_title text,system_msg_schedule_confirmed_body text,pre_reading_notice_message text);
 CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,is_organizer boolean);
 CREATE TABLE private_group_messages(id uuid DEFAULT gen_random_uuid(),group_id uuid,member_id uuid,message text,created_at timestamptz DEFAULT now());
 CREATE TABLE private_group_survey_deadlines(group_id uuid PRIMARY KEY,organization_id uuid,deadline_at timestamptz);
 CREATE TABLE fixture_survey(enabled boolean,url text);
 INSERT INTO fixture_survey VALUES(true,'https://example.invalid/survey');
 CREATE OR REPLACE FUNCTION resolve_operating_setting(o uuid,k text,d jsonb,s uuid,sc uuid,e uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('value',CASE k WHEN 'survey_enabled' THEN to_jsonb(enabled) WHEN 'survey_url' THEN to_jsonb(url) WHEN 'survey_deadline_days' THEN '7'::jsonb ELSE '48'::jsonb END) FROM fixture_survey $$;
 `)
 await db.exec(fs.readFileSync('supabase/rpcs/parse_announced_survey_deadline.sql','utf8'))
 await db.exec(fs.readFileSync('supabase/rpcs/get_private_group_survey_settings.sql','utf8'))
 await db.exec(fs.readFileSync('supabase/rpcs/freeze_private_group_survey_deadline.sql','utf8'))
 const migration=fs.readFileSync('supabase/migrations/20260927036000_private_approval_notices.sql','utf8')
 await db.exec(migration)
 const closureMode=process.argv.includes('--closure')
 const signature='approve_private_booking(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid)'
 const closure=fs.readFileSync('supabase/migrations/20260927037000_private_approval_legacy_closure.sql','utf8')
 if(closureMode) {
  // Reproduce the observed production ACL before testing its removal.
  await db.exec(`GRANT EXECUTE ON FUNCTION ${signature} TO PUBLIC,anon,authenticated,service_role`)
  await db.exec(closure)
  for(const role of ['anon','authenticated']) {
   await db.exec(`SET ROLE ${role}`)
   await assert.rejects(db.query("SELECT approve_private_booking(NULL,NULL,NULL,NULL,NULL,NULL,'{}','','')"),e=>e.code==='42501')
   await db.exec('RESET ROLE')
  }
  assert.equal((await db.query("SELECT has_function_privilege('service_role',$1,'EXECUTE') AS allowed",[signature])).rows[0].allowed,true)
 }
 const approve=async(id,date)=> (await db.query("SELECT approve_private_booking_with_notice($1,$2,'14:00','17:00',$3,$4,'{}','Fixture','Fixture') AS result",[id,date,store,gm])).rows[0].result
 const id=await request(scenario,['2027-02-11']);const result=await approve(id,'2027-02-11');
 assert.ok(result.schedule_event_id);assert.match(result.survey_notice,/2\/4まで/)
 const r=await read(id);assert.equal(r.status,'confirmed');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM private_group_messages WHERE group_id=$1',[r.private_group_id])).rows[0].n,2)
 // Missing organizer membership must not prevent notices. Reapproval remains supported.
 const second=await approve(id,'2027-02-11');assert.notEqual(second.schedule_event_id,result.schedule_event_id)
 assert.equal((await db.query('SELECT is_cancelled FROM schedule_events WHERE id=$1',[result.schedule_event_id])).rows[0].is_cancelled,true)
 const broken=await request(scenario,['2027-02-12']);const before=await read(broken)
 await db.query("UPDATE private_groups SET organization_id='10000000-0000-0000-0000-000000000099' WHERE id=$1",[before.private_group_id])
 await assert.rejects(approve(broken,'2027-02-12'),e=>e.code==='P0050')
 assert.deepEqual(await read(broken),before)
 await db.query('UPDATE private_groups SET organization_id=$1,reservation_id=NULL WHERE id=$2',[org,before.private_group_id])
 await assert.rejects(approve(broken,'2027-02-12'),e=>e.code==='P0051');assert.deepEqual(await read(broken),before)
 await db.query('UPDATE private_groups SET reservation_id=$1 WHERE id=$2',[broken,before.private_group_id])
 await db.exec(`CREATE FUNCTION fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture notice failed'; END $$;
 CREATE TRIGGER fail_notice BEFORE INSERT ON private_group_messages FOR EACH ROW EXECUTE FUNCTION fail_notice();`)
 await assert.rejects(approve(broken,'2027-02-12'),/fixture notice failed/);assert.deepEqual(await read(broken),before)
 assert.equal((await db.query('SELECT count(*)::int AS n FROM schedule_events WHERE reservation_id=$1',[broken])).rows[0].n,0)
 await db.exec('DROP TRIGGER fail_notice ON private_group_messages')
 await db.exec(fs.readFileSync('supabase/rollbacks/20260927036000_private_approval_notices.sql','utf8'));await db.exec(migration)
 assert.ok((await approve(broken,'2027-02-12')).schedule_event_id)
 // Internal character survey branch and custom organization message.
 await db.exec("UPDATE fixture_survey SET url=NULL; UPDATE organization_scenarios SET characters='[{\"is_npc\":false}]'")
 await db.query("INSERT INTO global_settings VALUES($1,'Fixture title','Fixture body','Fixture reading notice')",[org])
 const reading=await request(scenario,['2027-02-13']);assert.equal((await approve(reading,'2027-02-13')).survey_notice,'Fixture reading notice')
 await db.exec('UPDATE fixture_survey SET enabled=false')
 const disabled=await request(scenario,['2027-02-14']);assert.equal((await approve(disabled,'2027-02-14')).survey_notice,null)
 const disabledGroup=(await read(disabled)).private_group_id
 assert.equal((await db.query('SELECT count(*)::int AS n FROM private_group_messages WHERE group_id=$1',[disabledGroup])).rows[0].n,1)
 // Failure of the second notice also removes the first notice and frozen deadline.
 await db.exec(`UPDATE fixture_survey SET enabled=true;
 CREATE OR REPLACE FUNCTION fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.message::jsonb->>'action'='pre_reading_notice' THEN RAISE EXCEPTION 'fixture second notice failed'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fail_notice BEFORE INSERT ON private_group_messages FOR EACH ROW EXECUTE FUNCTION fail_notice();`)
 const failed=await request(scenario,['2027-02-15']);const failedBefore=await read(failed)
 await assert.rejects(approve(failed,'2027-02-15'),/fixture second notice failed/)
 assert.deepEqual(await read(failed),failedBefore)
 for(const table of ['private_group_messages','private_group_survey_deadlines']) {
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE group_id=$1`,[failedBefore.private_group_id])).rows[0].n,0)
 }
 await db.exec('DROP TRIGGER fail_notice ON private_group_messages; SET ROLE authenticated')
 assert.ok((await approve(failed,'2027-02-15')).schedule_event_id)
 await db.exec('RESET ROLE')
 assert.equal((await db.query("SELECT has_function_privilege('anon','approve_private_booking_with_notice(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid)','EXECUTE') AS allowed")).rows[0].allowed,false)
 if(closureMode) {
  await db.exec(fs.readFileSync('supabase/rollbacks/20260927037000_private_approval_legacy_closure.sql','utf8'))
  for(const role of ['anon','authenticated']) {
   assert.equal((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",[role,signature])).rows[0].allowed,true)
  }
  await db.exec(closure)
  const reopened=await request(scenario,['2027-02-16'])
  await db.exec('SET ROLE authenticated')
  assert.ok((await approve(reopened,'2027-02-16')).schedule_event_id)
  await db.exec('RESET ROLE')
  console.log('PASS legacy approval closure: old roles denied, new authenticated approval, service ACL, restore/reapply')
 }
 console.log('PASS approval notices: real approval/survey helpers, missing member, reapproval, organization/link refusal, failure rollback, ACL, rollback/reapply')
}

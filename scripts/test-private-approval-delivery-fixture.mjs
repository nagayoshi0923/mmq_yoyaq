import fs from 'node:fs'
import assert from 'node:assert/strict'
export async function testApprovalDelivery(db,{org,scenario,store,gm,request,read}) {
 const sql=p=>fs.readFileSync(p,'utf8')
 await db.exec(`ALTER TABLE customers ADD COLUMN email text,ADD COLUMN name text;
 ALTER TABLE organization_scenarios ADD COLUMN extra_preparation_time integer;
 CREATE TABLE email_settings(id uuid,organization_id uuid,store_id uuid);
 CREATE TABLE reservation_settings(organization_id uuid,store_id uuid);
 CREATE TABLE performance_schedule_settings(organization_id uuid,store_id uuid,default_duration integer);
 CREATE TABLE operating_setting_overrides(organization_id uuid,store_id uuid,organization_scenario_id uuid,schedule_event_id uuid,settings jsonb);`)
 // Replace the old fixture's resolver with production setting inheritance for this suite.
 await db.exec('DROP FUNCTION resolve_operating_setting(uuid,text,jsonb,uuid,uuid,uuid)')
 for(const name of ['get_operating_setting_default','resolve_operating_setting','get_private_group_survey_settings','freeze_private_group_survey_deadline','approve_private_booking_with_notice']) await db.exec(sql(`supabase/rpcs/${name}.sql`))
 await db.exec(sql('supabase/schemas/private_group_survey_deliveries.sql'))
 await db.exec(sql('supabase/schemas/private_booking_approval_requests.sql'))
 await db.exec(sql('supabase/rpcs/approve_private_booking_with_delivery.sql'))
 await db.query('INSERT INTO operating_setting_overrides VALUES($1,NULL,NULL,NULL,$2)',[org,JSON.stringify({survey_enabled:true,survey_url:'https://example.invalid/survey',survey_deadline_days:7})])
 const invoke=async(res,token,date='2027-03-11',name='Fixture') => (await db.query("SELECT approve_private_booking_with_delivery($1,$2,$3,'14:00','17:00',$4,$5,'{}','Fixture',$6) AS result",[token,res,date,store,gm,name])).rows[0].result
 const token=()=>crypto.randomUUID()
 const counts=async()=> (await db.query('SELECT (SELECT count(*) FROM schedule_events)::int AS events,(SELECT count(*) FROM private_group_messages)::int AS messages,(SELECT count(*) FROM private_booking_approval_requests)::int AS receipts,(SELECT count(*) FROM private_group_survey_deliveries)::int AS deliveries')).rows[0]
 const res=await request(scenario,['2027-03-11']),key=token()
 const first=await invoke(res,key);assert.equal(first.replayed,false);assert.ok(first.survey_delivery_id);assert.equal(first.survey_notice,undefined)
 const snapshot=await counts();const replay=await invoke(res,key)
 assert.equal(replay.replayed,true);assert.equal(replay.schedule_event_id,first.schedule_event_id);assert.deepEqual(await counts(),snapshot)
 await assert.rejects(invoke(res,key,'2027-03-11','Changed'),/APPROVAL_REQUEST_CONFLICT/);assert.deepEqual(await counts(),snapshot)
 const next=await invoke(res,token());assert.notEqual(next.schedule_event_id,first.schedule_event_id)
 assert.equal((await db.query('SELECT is_cancelled FROM schedule_events WHERE id=$1',[first.schedule_event_id])).rows[0].is_cancelled,true)
 const queue=(await db.query('SELECT * FROM private_group_survey_deliveries WHERE id=$1',[next.survey_delivery_id])).rows[0]
 assert.equal(queue.schedule_event_id,next.schedule_event_id);assert.equal(queue.customer_email,'fixture@example.invalid');assert.equal(queue.source,'approval')
 const message=(await db.query('SELECT message FROM private_group_messages WHERE id=$1',[queue.message_id])).rows[0]
 assert.equal(JSON.parse(message.message).message,queue.message_body)
 // Same request UUID cannot be reused for another reservation.
 const other=await request(scenario,['2027-03-12']);const before=await read(other)
 await assert.rejects(invoke(other,key,'2027-03-12'),/APPROVAL_REQUEST_CONFLICT/);assert.deepEqual(await read(other),before)
 // Queue persistence failure rolls back real approval, event, notices, deadline and request receipt.
 await db.exec(`CREATE FUNCTION fail_survey_queue() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'queue fixture failure';END$$;
 CREATE TRIGGER fail_survey_queue BEFORE INSERT ON private_group_survey_deliveries FOR EACH ROW EXECUTE FUNCTION fail_survey_queue()`)
 const beforeCounts=await counts()
 await assert.rejects(invoke(other,token(),'2027-03-12'),/queue fixture failure/)
 assert.deepEqual(await read(other),before);assert.deepEqual(await counts(),beforeCounts)
 assert.equal((await db.query('SELECT count(*)::int AS n FROM private_group_survey_deadlines WHERE group_id=$1',[before.private_group_id])).rows[0].n,0)
 await db.exec('DROP TRIGGER fail_survey_queue ON private_group_survey_deliveries')
 // Disabled survey still receives an idempotent approval receipt, without a survey queue.
 await db.exec("UPDATE operating_setting_overrides SET settings='{\"survey_enabled\":false}'")
 const disabledKey=token();const disabled=await invoke(other,disabledKey,'2027-03-12');assert.equal(disabled.survey_delivery_id,undefined)
 const disabledCounts=await counts();assert.equal((await invoke(other,disabledKey,'2027-03-12')).replayed,true);assert.deepEqual(await counts(),disabledCounts)
 await db.exec('SET ROLE anon');await assert.rejects(invoke(other,token(),'2027-03-12'),e=>e.code==='42501');await db.exec('RESET ROLE')
 // The migrated browser must use the durable approval entry. Closing the old
 // entry must preserve nested owner execution, receipt replay and saved rows.
 const closure='20260927051000_close_private_approval_without_delivery.sql'
 const oldSignature='public.approve_private_booking_with_notice(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid)'
 await db.exec(sql('supabase/migrations/'+closure))
 const stable=await counts()
 const oldCall=()=>db.query("SELECT approve_private_booking_with_notice($1,'2027-03-12','14:00','17:00',$2,$3,'{}','Fixture','Fixture')",[other,store,gm])
 for(const role of ['anon','authenticated']) {
  await db.exec('SET ROLE '+role)
  await assert.rejects(oldCall(),e=>e.code==='42501')
  await db.exec('RESET ROLE')
 }
 const acl=(await db.query('SELECT has_function_privilege($1,$3,\'EXECUTE\') AS owner,has_function_privilege($2,$3,\'EXECUTE\') AS service',[ 'postgres','service_role',oldSignature])).rows[0]
 assert.deepEqual(acl,{owner:true,service:true})
 await db.exec('SET ROLE authenticated')
 assert.equal((await invoke(other,disabledKey,'2027-03-12')).replayed,true)
 await db.exec('RESET ROLE');assert.deepEqual(await counts(),stable)
 const fresh=await request(scenario,['2027-03-13'])
 await db.exec("UPDATE operating_setting_overrides SET settings='{\"survey_enabled\":true,\"survey_url\":\"https://example.invalid/survey\",\"survey_deadline_days\":7}'")
 await db.exec('SET ROLE authenticated')
 const freshResult=await invoke(fresh,token(),'2027-03-13')
 assert.ok(freshResult.survey_delivery_id)
 await db.exec('RESET ROLE')
 const afterClosure=await counts()
 await db.exec(sql('supabase/rollbacks/'+closure))
 assert.equal((await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS allowed",[oldSignature])).rows[0].allowed,true)
 await db.exec(sql('supabase/migrations/'+closure))
 assert.equal((await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS allowed",[oldSignature])).rows[0].allowed,false)
 assert.deepEqual(await counts(),afterClosure)
 console.log('PASS approval delivery: actual approval and resolver, retry receipt, intentional reapproval, UUID conflict, atomic queue failure, disabled survey')
}

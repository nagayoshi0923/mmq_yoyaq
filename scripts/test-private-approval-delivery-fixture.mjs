import fs from 'node:fs'
import assert from 'node:assert/strict'
export async function testApprovalDelivery(db,{org,scenario,store,gm,request,read}) {
 const sql=p=>fs.readFileSync(p,'utf8')
 await db.exec(`CREATE TABLE schedule_event_history(id uuid DEFAULT gen_random_uuid(),schedule_event_id uuid,organization_id uuid,event_date date,store_id uuid,time_slot text,changed_by_user_id uuid,changed_by_staff_id uuid,changed_by_name text,action_type text,new_values jsonb,notes text)`);
 await db.exec('ALTER TABLE reservations ADD COLUMN scenario_title text; ALTER TABLE stores ADD COLUMN address text; ALTER TABLE staff ADD COLUMN email text,ADD COLUMN discord_channel_id text,ADD COLUMN discord_user_id text')
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
 await db.exec(sql('supabase/schemas/private_booking_approval_deliveries.sql'))
 await db.exec(sql('supabase/rpcs/enqueue_private_approval_deliveries.sql'))
 await db.exec(sql('supabase/rpcs/private_approval_delivery_state.sql'))
 await db.exec(sql('supabase/rpcs/enqueue_legacy_private_approval_delivery.sql'))
 await db.exec(sql('supabase/rpcs/approve_private_booking_with_delivery.sql'))
 await db.exec(sql('supabase/rpcs/approve_private_booking_with_notifications.sql'))
 await db.query('INSERT INTO operating_setting_overrides VALUES($1,NULL,NULL,NULL,$2)',[org,JSON.stringify({survey_enabled:true,survey_url:'https://example.invalid/survey',survey_deadline_days:7})])
 const invoke=async(res,token,date='2027-03-11',name='Fixture') => (await db.query("SELECT approve_private_booking_with_notifications($1,$2,$3,'14:00','17:00',$4,$5,'{}','Fixture',$6) AS result",[token,res,date,store,gm,name])).rows[0].result
 const token=()=>crypto.randomUUID()
 const counts=async()=> (await db.query('SELECT (SELECT count(*) FROM schedule_events)::int AS events,(SELECT count(*) FROM private_group_messages)::int AS messages,(SELECT count(*) FROM private_booking_approval_requests)::int AS receipts,(SELECT count(*) FROM private_group_survey_deliveries)::int AS deliveries')).rows[0]
 const res=await request(scenario,['2027-03-11']),key=token()
 const first=await invoke(res,key);assert.equal(first.replayed,false);assert.ok(first.survey_delivery_id);assert.equal(first.survey_notice,undefined)
 const jobs=(await db.query('SELECT * FROM private_booking_approval_deliveries WHERE request_id=$1 ORDER BY kind',[key])).rows
 assert.equal((await db.query('SELECT count(*)::int n FROM schedule_event_history WHERE schedule_event_id=$1',[first.schedule_event_id])).rows[0].n,1)
 assert.equal(jobs.length,3);assert.deepEqual(jobs.map(j=>j.kind),['confirmation_email','gm_discord','gm_email'])
 assert.equal(jobs[0].snapshot.customerEmail,'fixture@example.invalid')
 assert.equal(jobs[0].snapshot.scheduleEventId,first.schedule_event_id)
 assert.equal(jobs[1].recipient_key,gm)
 // Compatibility callers reuse the current atomic approval delivery.
 const compat=async(kind,snapshot,correction=null)=>(await db.query('SELECT enqueue_legacy_private_approval_delivery($1,$2,$3,$4,$5) AS id',[org,res,kind,JSON.stringify(snapshot),correction])).rows[0].id
 assert.equal(await compat('confirmation_email',jobs[0].snapshot),jobs[0].id)
 await db.exec('BEGIN')
 try {
  await db.query('DELETE FROM private_booking_approval_deliveries WHERE request_id=$1',[key])
  const legacy=await compat('confirmation_email',jobs[0].snapshot)
  assert.equal(await compat('confirmation_email',jobs[0].snapshot),legacy)
  assert.equal((await db.query('SELECT count(*)::int n FROM private_booking_approval_deliveries WHERE reservation_id=$1',[res])).rows[0].n,1)
  const correctionId=token(),changed={...jobs[0].snapshot,emailSubject:'訂正',templateOverride:'訂正本文'}
  const correction=await compat('confirmation_email',changed,correctionId)
  assert.notEqual(correction,legacy)
  assert.equal(await compat('confirmation_email',changed,correctionId),correction)
  await db.exec('SAVEPOINT conflict')
  await assert.rejects(compat('confirmation_email',{...changed,templateOverride:'別本文'},correctionId),/CORRECTION_REQUEST_CONFLICT/)
  await db.exec('ROLLBACK TO conflict')
  await db.exec('SAVEPOINT changed')
  await assert.rejects(compat('gm_email',{...jobs[2].snapshot,eventDate:'2099-01-01'}),/APPROVAL_CHANGED/)
  await db.exec('ROLLBACK TO changed')
  for(const role of ['anon','authenticated']) {
   await db.exec('SAVEPOINT acl');await db.exec('SET LOCAL ROLE '+role)
   await assert.rejects(compat('confirmation_email',jobs[0].snapshot),e=>e.code==='42501')
   await db.exec('ROLLBACK TO acl')
  }
 } finally { await db.exec('ROLLBACK') }

 assert.equal((await db.query('SELECT is_private_approval_delivery_current($1) AS ok',[jobs[0].id])).rows[0].ok,true)
 const visible=(await db.query('SELECT get_private_booking_approval_deliveries($1) AS result',[res])).rows[0].result
 assert.equal(visible.deliveries.length,3);assert.equal(JSON.stringify(visible).includes('@'),false)
 const snapshot=await counts();const replay=await invoke(res,key)
 assert.equal((await db.query('SELECT count(*)::int n FROM private_booking_approval_deliveries WHERE request_id=$1',[key])).rows[0].n,3)
 assert.equal(replay.replayed,true);assert.equal(replay.schedule_event_id,first.schedule_event_id);assert.deepEqual(await counts(),snapshot)
 await assert.rejects(invoke(res,key,'2027-03-11','Changed'),/APPROVAL_REQUEST_CONFLICT/);assert.deepEqual(await counts(),snapshot)
 const next=await invoke(res,token());assert.notEqual(next.schedule_event_id,first.schedule_event_id)
 assert.equal((await db.query('SELECT is_cancelled FROM schedule_events WHERE id=$1',[first.schedule_event_id])).rows[0].is_cancelled,true)
 assert.equal((await db.query('SELECT is_private_approval_delivery_current($1) AS ok',[jobs[0].id])).rows[0].ok,false)
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
 // Confirmation/GM queue failure also rolls back the real approval and its survey notice.
 await db.exec(`CREATE TRIGGER fail_confirmation_queue BEFORE INSERT ON private_booking_approval_deliveries FOR EACH ROW EXECUTE FUNCTION fail_survey_queue()`)
 await assert.rejects(invoke(other,token(),'2027-03-12'),/queue fixture failure/)
 assert.deepEqual(await read(other),before);assert.deepEqual(await counts(),beforeCounts)
 await db.exec('DROP TRIGGER fail_confirmation_queue ON private_booking_approval_deliveries')
 // Disabled survey still receives an idempotent approval receipt, without a survey queue.
 await db.exec("UPDATE operating_setting_overrides SET settings='{\"survey_enabled\":false}'")
 const disabledKey=token();const disabled=await invoke(other,disabledKey,'2027-03-12');assert.equal(disabled.survey_delivery_id,undefined)
 assert.equal((await db.query('SELECT count(*)::int n FROM private_booking_approval_deliveries WHERE request_id=$1',[disabledKey])).rows[0].n,3)
 const disabledCounts=await counts();assert.equal((await invoke(other,disabledKey,'2027-03-12')).replayed,true);assert.deepEqual(await counts(),disabledCounts)
 for(const role of ['anon','authenticated']) {await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT snapshot FROM private_booking_approval_deliveries'),e=>e.code==='42501');await assert.rejects(db.query('SELECT enqueue_private_approval_deliveries($1)',[key]),e=>e.code==='42501');await db.exec('RESET ROLE')}
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
 const {testDeliveryRecovery}=await import('./test-private-delivery-recovery-fixture.mjs')
 await testDeliveryRecovery(db,{org,reservation:fresh})
 console.log('PASS approval delivery: actual approval and resolver, retry receipt, intentional reapproval, UUID conflict, atomic queue failure, disabled survey')
}

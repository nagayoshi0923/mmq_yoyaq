import fs from 'node:fs'
import assert from 'node:assert/strict'
export async function testDeliveryRecovery(db,{org,reservation}) {
 const sql=p=>fs.readFileSync(p,'utf8')
 await db.exec(`ALTER TABLE reservations ADD COLUMN cancelled_at timestamptz,ADD COLUMN cancellation_reason text;
 CREATE TABLE email_logs(id uuid PRIMARY KEY,organization_id uuid,reservation_id uuid,to_email text,subject text,body_html text,body_text text,email_type text,provider_message_id text,sent_at timestamptz,status text,error_message text);`)
 await db.exec(sql('supabase/schemas/private_booking_rejection_deliveries.sql'))
 await db.exec(sql('supabase/schemas/private_delivery_resolutions.sql'))
 await db.exec('CREATE TABLE private_booking_discord_rooms(organization_id uuid,reservation_id uuid,schedule_event_id uuid,player_invite_url text,spectator_invite_url text)')
 await db.exec(sql('supabase/rpcs/resume_private_approval_preparation.sql'))
 for(const file of ['private_approval_delivery_completion','private_survey_delivery_completion','private_rejection_delivery_completion','private_delivery_reconciliation','private_delivery_history']) await db.exec(sql(`supabase/rpcs/${file}.sql`)).catch(error=>{error.message=file+': '+error.message+' at '+error.position;throw error})
 const row=(await db.query("SELECT * FROM private_booking_approval_deliveries WHERE reservation_id=$1 AND kind='confirmation_email'",[reservation])).rows[0]
 const actor=(await db.query('SELECT auth.uid() AS id')).rows[0].id
 const transaction=async fn=>{await db.exec('BEGIN');try{await fn()}finally{await db.exec('ROLLBACK;RESET ROLE')}}
 const call=async()=>db.query("SELECT retry_private_unsent_delivery('approval',$1)",[row.id])
 await transaction(async()=>{
  await db.query("UPDATE private_booking_approval_deliveries SET status='failed' WHERE id=$1",[row.id])
  await db.query("UPDATE reservations SET customer_email='corrected@example.invalid' WHERE id=$1",[reservation])
  await db.exec('SET ROLE authenticated');await call();await db.exec('RESET ROLE')
  const current=(await db.query('SELECT * FROM private_booking_approval_deliveries WHERE id=$1',[row.id])).rows[0]
  assert.equal(current.status,'pending');assert.equal(current.snapshot.customerEmail,'corrected@example.invalid');assert.ok(current.email_log_id)
  assert.equal((await db.query('SELECT count(*)::int n FROM private_delivery_resolutions')).rows[0].n,1)
 })
 for(const status of ['pending','sending','sent','uncertain','superseded','skipped']) await transaction(async()=>{
  await db.query('UPDATE private_booking_approval_deliveries SET status=$2 WHERE id=$1',[row.id,status])
  await assert.rejects(call(),e=>e.code==='55000')
 })
 await transaction(async()=>{
  await db.query("UPDATE private_booking_approval_deliveries SET status='failed',first_attempt_at=now() WHERE id=$1",[row.id])
  await assert.rejects(call(),e=>e.code==='55000')
 })
 // Actual completion and reconciliation use the same transaction, preserving webhook status.
 const payload={to:['fixture@example.invalid'],subject:'subject',html:'<p>text</p>',text:'text'}
 const prime=async()=>{
  await db.query("UPDATE private_booking_approval_deliveries SET status='uncertain',first_attempt_at=now(),provider_payload=$2,updated_at=now() WHERE id=$1",[row.id,JSON.stringify(payload)])
  await db.query("INSERT INTO email_logs VALUES($1,$2,$3,'fixture@example.invalid','subject','<p>text</p>','text','reservation_confirmed',NULL,NULL,'queued',NULL)",[row.id,org,reservation])
  return (await db.query('SELECT updated_at FROM private_booking_approval_deliveries WHERE id=$1',[row.id])).rows[0].updated_at
 }
 const reconcile=(version,provider='provider-fixture')=>db.query("SELECT reconcile_private_delivery_receipt('approval',$1,$2,$3,$4,$5,now())",[row.id,org,actor,version,provider])
 await transaction(async()=>{
  const version=await prime();await db.exec('SET ROLE service_role');await reconcile(version);await reconcile(version);await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT status FROM private_booking_approval_deliveries WHERE id=$1',[row.id])).rows[0].status,'sent')
  assert.equal((await db.query('SELECT provider_message_id FROM email_logs WHERE id=$1',[row.id])).rows[0].provider_message_id,'provider-fixture')
  assert.equal((await db.query('SELECT count(*)::int n FROM private_delivery_resolutions')).rows[0].n,1)
 })
 await transaction(async()=>{
  const version=await prime();await db.query("UPDATE email_logs SET body_text='other' WHERE id=$1",[row.id])
  await db.exec('SAVEPOINT failure');await assert.rejects(reconcile(version),/DELIVERY_LOG_CONFLICT/);await db.exec('ROLLBACK TO failure')
  assert.equal((await db.query('SELECT status FROM private_booking_approval_deliveries WHERE id=$1',[row.id])).rows[0].status,'uncertain')
  assert.equal((await db.query('SELECT count(*)::int n FROM private_delivery_resolutions')).rows[0].n,0)
 })
 await transaction(async()=>{
  await prime();await assert.rejects(reconcile('2000-01-01'),e=>e.code==='40001')
 })
 for(const role of ['anon','authenticated']) await transaction(async()=>{
  await db.exec('SET ROLE '+role);await assert.rejects(reconcile('2000-01-01'),e=>e.code==='42501')
 })
 const history=(await db.query('SELECT get_private_booking_delivery_history($1) AS result',[reservation])).rows[0].result
 assert.ok(history.deliveries.length>=3);assert.equal(JSON.stringify(history).includes('@'),false)
 await transaction(async()=>{
  await prime()
  await db.query("UPDATE private_booking_approval_deliveries SET status='superseded' WHERE id=$1",[row.id])
  const history=(await db.query('SELECT get_private_booking_delivery_history($1) AS result',[reservation])).rows[0].result
  const stopped=history.deliveries.find(d=>d.id===row.id)
  assert.equal(stopped.can_reconcile,true)
  assert.equal(stopped.can_retry,false)
 })
 const prepareUnknown=async()=>db.query("UPDATE private_booking_approval_deliveries SET status='uncertain',preparation_attempted_at=now() WHERE id=$1",[row.id])
 const resume=async()=>db.query('SELECT resume_private_approval_preparation($1)',[row.id])
 const room=async(organization=org,event=row.schedule_event_id)=>db.query('INSERT INTO private_booking_discord_rooms VALUES($1,$2,$3,$4,$5)',[organization,reservation,event,'https://discord.gg/fixture-player','https://discord.gg/fixture-spectator'])
 await transaction(async()=>{
  await prepareUnknown();await room();await db.exec('SET ROLE authenticated');await resume();await db.exec('RESET ROLE')
  const current=(await db.query('SELECT status,preparation_attempted_at,first_attempt_at FROM private_booking_approval_deliveries WHERE id=$1',[row.id])).rows[0]
  assert.equal(current.status,'pending');assert.ok(current.preparation_attempted_at);assert.equal(current.first_attempt_at,null)
  assert.equal((await db.query("SELECT count(*)::int n FROM private_delivery_resolutions WHERE action='preparation_verified'")).rows[0].n,1)
 })
 await transaction(async()=>{await prepareUnknown();await assert.rejects(resume(),/PREPARATION_RECORD_NOT_CONFIRMED/)})
 await transaction(async()=>{await prepareUnknown();await room('00000000-0000-0000-0000-000000000099');await assert.rejects(resume(),/PREPARATION_RECORD_NOT_CONFIRMED/)})
 await transaction(async()=>{await prepareUnknown();await room();await db.query('UPDATE private_booking_approval_deliveries SET first_attempt_at=now() WHERE id=$1',[row.id]);await assert.rejects(resume(),/PREPARATION_NOT_RESUMABLE/)})
 for(const state of ['failed','uncertain']) await transaction(async()=>{
  await db.query("UPDATE private_booking_approval_deliveries SET status=$2,preparation_attempted_at=now() WHERE id=$1",[row.id,state])
  await db.query("UPDATE reservations SET status='cancelled' WHERE id=$1",[reservation])
  const history=(await db.query('SELECT get_private_booking_delivery_history($1) AS result',[reservation])).rows[0].result
  const current=history.deliveries.find(d=>d.id===row.id)
  assert.equal(current.can_retry,false);assert.equal(current.can_resume_preparation,false)
 })
 await transaction(async()=>{
  await db.query("UPDATE private_group_survey_deliveries SET status='failed' WHERE reservation_id=$1",[reservation])
  const rows=async()=>(await db.query('SELECT get_private_booking_delivery_history($1) AS result',[reservation])).rows[0].result.deliveries
  const survey=(await rows()).find(d=>d.delivery_kind==='survey');assert.ok(survey);assert.equal(survey.can_retry,true)
  await db.query("UPDATE reservations SET status='cancelled' WHERE id=$1",[reservation])
  assert.equal((await rows()).find(d=>d.id===survey.id).can_retry,false)
 })
 await transaction(async()=>{
  await db.query("UPDATE reservations SET status='cancelled',cancelled_at=now(),cancellation_reason='貸切リクエストを却下しました' WHERE id=$1",[reservation])
  await db.query("UPDATE private_groups SET status='date_adjusting' WHERE reservation_id=$1",[reservation])
  await db.query("INSERT INTO private_booking_rejection_deliveries(id,reservation_id,organization_id,cancelled_at,customer_name,scenario_title,message_body,status) SELECT gen_random_uuid(),id,organization_id,cancelled_at,'fixture','fixture','fixture','failed' FROM reservations WHERE id=$1",[reservation])
  const rejected=async()=>(await db.query('SELECT get_private_booking_delivery_history($1) AS result',[reservation])).rows[0].result.deliveries.find(d=>d.delivery_kind==='rejection')
  assert.equal((await rejected()).can_retry,true)
  await db.query("UPDATE reservations SET status='confirmed' WHERE id=$1",[reservation])
  assert.equal((await rejected()).can_retry,false)
 })
 // Same active identity in another organization cannot read or retry.
 await transaction(async()=>{
  await db.exec("CREATE OR REPLACE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-0000-0000-000000000099'::uuid$$")
  await db.exec('SAVEPOINT denial');await assert.rejects(db.query('SELECT get_private_booking_delivery_history($1)',[reservation]),e=>e.code==='42501');await db.exec('ROLLBACK TO denial')
  await assert.rejects(call(),e=>e.code==='42501')
 })
 console.log('PASS delivery recovery: unsent-only retry, authoritative contact, receipt/log atomic reconciliation, conflicts, idempotency, permissions, history privacy')
}

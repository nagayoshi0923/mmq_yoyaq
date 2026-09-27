import fs from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.org',true),'')::uuid$$;
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.admin',true),'false')='true'$$;
CREATE TABLE staff(user_id uuid,organization_id uuid,status text);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,category text,is_private_booking boolean,current_participants int,is_cancelled boolean,cancelled_at timestamptz,cancellation_reason text,updated_at timestamptz);
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,reservation_id uuid,status text);
CREATE TABLE private_group_messages(id uuid PRIMARY KEY,group_id uuid,member_id uuid,message text);
CREATE TABLE private_group_candidate_dates(id uuid PRIMARY KEY,group_id uuid,status text);
CREATE TABLE reservations(id uuid PRIMARY KEY,schedule_event_id uuid,status text,customer_id uuid,organization_id uuid,private_group_id uuid,participant_count int,cancelled_at timestamptz,cancellation_reason text,updated_at timestamptz,reservation_source text);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;`)
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const sql = path => fs.readFileSync(path, 'utf8')
await db.exec(sql('supabase/migrations/20260927042000_plain_cancellation_staff_boundary.sql'))
await db.exec(sql('supabase/migrations/20260927044000_private_rejection_boundary.sql'))
await db.exec('GRANT EXECUTE ON FUNCTION mark_private_group_rejected_after_booking_rejection(uuid) TO anon,authenticated,service_role')
const closure = sql('supabase/migrations/20260927046000_close_legacy_private_rejection.sql')
const restore = sql('supabase/rollbacks/20260927046000_close_legacy_private_rejection.sql')
await db.exec(closure)
const migration = sql('supabase/migrations/20260927045000_private_rejection_atomic.sql')
await db.exec(migration)
const withDelivery = process.env.TEST_REJECTION_DELIVERY === '1'
if(withDelivery) {
 await db.exec('ALTER TABLE reservations ADD COLUMN customer_email text, ADD COLUMN customer_name text, ADD COLUMN title text; CREATE TABLE customers(id uuid PRIMARY KEY,organization_id uuid,email text,name text); CREATE TABLE email_logs(id uuid PRIMARY KEY,organization_id uuid,reservation_id uuid,status text,error_message text,email_type text,body_text text,to_email text,provider_message_id text,sent_at timestamptz)')
 await db.exec(sql('supabase/migrations/20260927047000_private_rejection_mail_intent.sql'))
}
const reset = async () => {
 if(withDelivery) await db.exec('RESET ROLE; DELETE FROM private_booking_rejection_deliveries; DELETE FROM customers; DELETE FROM email_logs')
 await db.exec('RESET ROLE; DELETE FROM private_group_messages; DELETE FROM private_group_candidate_dates; DELETE FROM private_groups; DELETE FROM reservations; DELETE FROM schedule_events; DELETE FROM staff')
 await db.query("INSERT INTO staff VALUES($1,$2,'active'),($3,$2,'inactive')",[id(1),id(10),id(2)])
 await db.query("INSERT INTO schedule_events VALUES($1,$2,'private',true,4,false,NULL,NULL,NULL)",[id(40),id(10)])
 await db.query("INSERT INTO reservations VALUES($1,$2,'confirmed',NULL,$3,$4,4,NULL,NULL,NULL,'web_private')",[id(20),id(40),id(10),id(30)])
 await db.query("INSERT INTO private_groups VALUES($1,$2,$3,'confirmed')",[id(30),id(10),id(20)])
 await db.query("INSERT INTO private_group_candidate_dates VALUES($1,$2,'confirmed')",[id(50),id(30)])
}
const actor = async (uid=id(1),org=id(10),admin=false,role='authenticated') => {
 await db.query("SELECT set_config('test.uid',$1,false),set_config('test.org',$2,false),set_config('test.admin',$3,false)",[uid||'',org||'',String(admin)])
 await db.exec(`SET ROLE ${role}`)
}
const call = (body='却下本文') => db.query(`SELECT ${withDelivery ? 'reject_private_booking_with_delivery' : 'reject_private_booking_with_notice'}($1,$2) AS ok`,[id(20),body])
const state = async () => {
 await db.exec('RESET ROLE')
 const result={}
 if(withDelivery) result.deliveries=(await db.query('SELECT * FROM private_booking_rejection_deliveries ORDER BY id')).rows
 for(const table of ['reservations','schedule_events','private_groups','private_group_candidate_dates','private_group_messages']) result[table]=(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows
 return result
}
// 旧入口は認可されたスタッフでも直接実行不可。内部所有者経由は以降の全正常系で確認。
for (const role of ['anon','authenticated']) {
 await reset();const before=await state();await actor(id(1),id(10),false,role)
 await assert.rejects(db.query('SELECT mark_private_group_rejected_after_booking_rejection($1)',[id(20)]), e=>e.code==='42501')
 assert.deepEqual(await state(),before)
}
assert.equal((await db.query("SELECT has_function_privilege('service_role','mark_private_group_rejected_after_booking_rejection(uuid)','EXECUTE') AS ok")).rows[0].ok,true)
// 本番はPUBLICなし、検証はPUBLICありだった。双方の実ACLから閉鎖・復元を確認。
for (const publicGrant of [false,true]) {
 await db.exec('RESET ROLE; REVOKE EXECUTE ON FUNCTION mark_private_group_rejected_after_booking_rejection(uuid) FROM PUBLIC;')
 await db.exec(restore)
 if(publicGrant) await db.exec('GRANT EXECUTE ON FUNCTION mark_private_group_rejected_after_booking_rejection(uuid) TO PUBLIC')
 const before=(await db.query("SELECT proacl::text AS acl FROM pg_proc WHERE oid='mark_private_group_rejected_after_booking_rejection(uuid)'::regprocedure")).rows[0].acl
 await db.exec(closure);await db.exec(restore)
 if(publicGrant) await db.exec('GRANT EXECUTE ON FUNCTION mark_private_group_rejected_after_booking_rejection(uuid) TO PUBLIC')
 assert.equal((await db.query("SELECT proacl::text AS acl FROM pg_proc WHERE oid='mark_private_group_rejected_after_booking_rejection(uuid)'::regprocedure")).rows[0].acl,before)
 await db.exec(closure)
}
for(const args of [[null,null,false,'anon'],[null,null,false,'service_role'],[id(2),id(10),false],[id(3),id(10),false],[id(4),id(11),true]]) {
 await reset();const before=await state();await actor(...args);await assert.rejects(call());assert.deepEqual(await state(),before)
}
for(const args of [[id(1),id(10),false],[id(4),id(10),true]]) {
 await reset();await actor(...args);assert.equal((await call()).rows[0].ok,true);let after=await state()
 assert.equal(after.reservations[0].status,'cancelled');assert.equal(after.schedule_events[0].is_cancelled,true)
 assert.equal(after.private_groups[0].status,'date_adjusting');assert.equal(after.private_group_candidate_dates[0].status,'rejected')
 assert.equal(after.private_group_messages.length,1);assert.equal(JSON.parse(after.private_group_messages[0].message).body,'却下本文')
 await db.query("INSERT INTO private_group_candidate_dates VALUES($1,$2,'pending')",[id(51),id(30)])
 after=await state();await actor(...args);await call();assert.deepEqual(await state(),after)
 await actor(...args);await assert.rejects(call('異なる本文'),/REJECTION_NOTICE_CONFLICT/);assert.deepEqual(await state(),after)
}
// 取消済み予約を再承認した後は、同じ予約でも新しい却下通知を残す。
await reset();await actor();await call('本文A');await state()
await db.exec("UPDATE reservations SET status='confirmed'; UPDATE private_groups SET status='confirmed'; UPDATE schedule_events SET is_cancelled=false; UPDATE private_group_candidate_dates SET status='confirmed'")
await actor();await call('本文B');const rejectedAgain=await state()
assert.equal(rejectedAgain.private_group_messages.length,2)
if(withDelivery) assert.equal(rejectedAgain.deliveries.length,2)
assert.deepEqual(new Set(rejectedAgain.private_group_messages.map(m=>JSON.parse(m.message).body)),new Set(['本文A','本文B']))
await actor();await call('本文B');assert.deepEqual(await state(),rejectedAgain)
for(const mutation of [
 "UPDATE private_groups SET organization_id='00000000-0000-0000-0000-000000000011'",
 'UPDATE private_groups SET reservation_id=NULL', "UPDATE private_groups SET status='cancelled'", "UPDATE private_groups SET status='date_adjusting'",
 "UPDATE schedule_events SET organization_id='00000000-0000-0000-0000-000000000011'",
 "UPDATE schedule_events SET category='open',is_private_booking=false",
 "UPDATE reservations SET status='cancelled',cancellation_reason='顧客都合'",
 "INSERT INTO reservations(id,schedule_event_id,status,participant_count) VALUES('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000040','checked_in',1)",
]) {
 await reset();await db.exec(mutation);const before=await state();await actor();await assert.rejects(call());assert.deepEqual(await state(),before)
}
for (const body of [null, '', ' ', 'x'.repeat(20001)]) {
 await reset();const before=await state();await actor();await assert.rejects(call(body));assert.deepEqual(await state(),before)
}
await reset();await db.exec("UPDATE reservations SET status='cancelled',cancellation_reason='貸切リクエストを却下しました',cancelled_at='2026-09-27T00:00:00Z'; UPDATE private_groups SET status='date_adjusting'")
await db.exec("INSERT INTO private_group_messages SELECT md5(id::text || ':' || extract(epoch FROM cancelled_at)::text)::uuid,private_group_id,NULL,'別の通知' FROM reservations")
const collision=await state();await actor();await assert.rejects(call(),/REJECTION_NOTICE_CONFLICT/);assert.deepEqual(await state(),collision)
await reset();await db.exec("UPDATE schedule_events SET category='open',is_private_booking=true");await actor();await call();assert.equal((await state()).schedule_events[0].is_cancelled,true)
if(withDelivery) {
 await reset();await db.exec("UPDATE reservations SET customer_id='00000000-0000-0000-0000-000000000099',customer_email='saved@example.test',customer_name='予約時名',title='作品'; INSERT INTO customers VALUES('00000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000010','account@example.test','アカウント名')")
 await actor();await call();const result=await state()
 assert.equal(result.deliveries[0].status,'pending');
 assert.equal(result.deliveries.length,1);assert.equal(result.deliveries[0].customer_email,'saved@example.test');assert.equal(result.deliveries[0].customer_name,'予約時名')
 await actor();let statusRows=(await db.query('SELECT * FROM get_private_rejection_delivery_status($1)',[[id(20)]])).rows
 assert.equal(statusRows.length,1);assert.equal(statusRows[0].status,'pending');assert.equal('customer_email' in statusRows[0],false)
 await db.exec('RESET ROLE');await actor(id(4),id(11),true)
 assert.equal((await db.query('SELECT * FROM get_private_rejection_delivery_status($1)',[[id(20)]])).rows.length,0)
 await db.exec('RESET ROLE');await actor(id(2),id(10),false)
 assert.equal((await db.query('SELECT * FROM get_private_rejection_delivery_status($1)',[[id(20)]])).rows.length,0)
 await db.exec('RESET ROLE');await actor(null,null,false,'anon')
 await assert.rejects(db.query('SELECT * FROM get_private_rejection_delivery_status($1)',[[id(20)]]),e=>e.code==='42501')
 await db.exec('RESET ROLE')
 await db.exec("UPDATE private_booking_rejection_deliveries SET status='failed'; INSERT INTO email_logs(id,organization_id,reservation_id,status,error_message,email_type,body_text,to_email) SELECT id,organization_id,reservation_id,'queued',NULL,'reservation_cancelled',message_body,customer_email FROM private_booking_rejection_deliveries")
 await actor();assert.equal((await db.query('SELECT retry_private_rejection_delivery($1) AS ok',[id(20)])).rows[0].ok,true)
 await state();assert.equal((await db.query('SELECT status FROM email_logs')).rows[0].status,'failed')
 assert.ok((await db.query('SELECT email_log_id FROM private_booking_rejection_deliveries')).rows[0].email_log_id)
 await db.exec("UPDATE private_booking_rejection_deliveries SET status='failed',first_attempt_at=now()")
 await actor();await assert.rejects(db.query('SELECT retry_private_rejection_delivery($1)',[id(20)]),/DELIVERY_NOT_SAFE_TO_RETRY/)
 await state();await db.exec("UPDATE private_booking_rejection_deliveries SET status='pending',first_attempt_at=NULL")
 await db.exec("UPDATE reservations SET customer_email='changed@example.test'")
 await actor();await call();assert.equal((await state()).deliveries[0].customer_email,'saved@example.test')
 for(const role of ['anon','authenticated']) {
  await actor(id(1),id(10),false,role)
  await assert.rejects(db.query('SELECT * FROM private_booking_rejection_deliveries'),e=>e.code==='42501')
  await assert.rejects(db.query("UPDATE private_booking_rejection_deliveries SET status='sent'"),e=>e.code==='42501')
 }
 await db.exec('RESET ROLE')
 await reset();await actor();await db.query('SELECT reject_private_booking_with_notice($1,$2)',[id(20),'却下本文']);await call()
 const legacy=await state();assert.equal(legacy.deliveries[0].status,'uncertain');assert.equal(legacy.deliveries[0].last_error,'legacy_delivery_unconfirmed')
}
// 実取消関数を含め、通知/候補/公演の失敗で予約取消も巻き戻る。
for(const [table,event] of [...[['private_group_messages','INSERT'],['private_group_candidate_dates','UPDATE'],['schedule_events','UPDATE']], ...(withDelivery ? [['private_booking_rejection_deliveries','INSERT']] : [])]) {
 await reset();await db.exec(`CREATE OR REPLACE FUNCTION fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected failure';END$$;CREATE TRIGGER fixture_fail BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION fixture_fail()`)
 const before=await state();await actor();await assert.rejects(call(),/injected failure/);assert.deepEqual(await state(),before)
 await db.exec(`DROP TRIGGER fixture_fail ON ${table}`)
}
await reset();await db.exec('UPDATE reservations SET schedule_event_id=NULL,private_group_id=NULL');await actor();await call();assert.equal((await state()).reservations[0].status,'cancelled')
if(withDelivery) {
 const deliveryBefore=(await db.query('SELECT * FROM private_booking_rejection_deliveries')).rows
 await db.exec(sql('supabase/rollbacks/20260927047000_private_rejection_mail_intent.sql'))
 assert.deepEqual((await db.query('SELECT * FROM private_booking_rejection_deliveries')).rows,deliveryBefore)
 await db.exec(sql('supabase/migrations/20260927047000_private_rejection_mail_intent.sql'))
 await reset();await actor();await call();assert.equal((await state()).deliveries.length,1)
}
await db.exec(sql('supabase/rollbacks/20260927045000_private_rejection_atomic.sql'));assert.equal((await db.query("SELECT to_regprocedure('reject_private_booking_with_notice(uuid,text)') AS f")).rows[0].f,null)
await db.exec(migration);await reset();await actor();await call();assert.equal((await state()).private_group_messages.length,1)
await db.close();console.log('PASS: atomic rejection, authorization, current links, other reservations protection, retry and all-write rollback, restore/reapply')

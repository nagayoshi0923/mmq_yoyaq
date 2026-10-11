import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

// 外部通信なし。実テーブル定義と、本番で循環したポリシー経路を使用する。
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [org, other, actor, customerActor, event, otherEvent, master, customer, foreignCustomer] = [1,2,3,4,5,6,7,8,9].map(id)
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE stores(id uuid PRIMARY KEY);
CREATE TABLE scenario_masters(id uuid PRIMARY KEY);
CREATE TABLE private_groups(id uuid PRIMARY KEY);
CREATE TABLE coupon_usages(id uuid PRIMARY KEY);
CREATE TABLE staff(id uuid PRIMARY KEY,user_id uuid,organization_id uuid,status text);
CREATE TABLE customers(id uuid PRIMARY KEY,user_id uuid,organization_id uuid,name text,email text,phone text);
CREATE TABLE organization_scenarios(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid);
CREATE FUNCTION generate_reservation_number() RETURNS text LANGUAGE sql AS $$ SELECT gen_random_uuid()::text $$;
CREATE TABLE test_actors(id uuid,organization_id uuid,operator boolean);
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT organization_id FROM test_actors WHERE id=auth.uid() $$;
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT COALESCE((SELECT operator FROM test_actors WHERE id=auth.uid()),false) $$;
`)

const schema = name => fs.readFileSync(`supabase/schemas/${name}.sql`,'utf8').split('-- Indexes')[0]
await db.exec(schema('schedule_events').replace('reservation_id UUID REFERENCES public.reservations(id)', 'reservation_id UUID'))
await db.exec(schema('reservations'))
await db.exec(fs.readFileSync('supabase/migrations/20260928001300_serialize_participant_recalculation.sql','utf8'))
await db.exec('CREATE TRIGGER recalc AFTER INSERT OR UPDATE OR DELETE ON reservations FOR EACH ROW EXECUTE FUNCTION recalc_current_participants_trigger()')
await db.exec(`CREATE FUNCTION customer_has_org_connection(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM reservations WHERE customer_id=$1 AND organization_id=$2) $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT SELECT,INSERT ON reservations TO authenticated;
GRANT SELECT ON schedule_events,customers TO authenticated;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservations_select_self_or_admin ON reservations FOR SELECT USING (
 (is_org_admin() AND organization_id=get_user_organization_id()) OR customer_id IN (SELECT id FROM customers WHERE user_id=auth.uid()));
CREATE POLICY reservations_insert_strict ON reservations FOR INSERT WITH CHECK (
 organization_id=(SELECT organization_id FROM schedule_events WHERE id=reservations.schedule_event_id)
 AND organization_id=get_user_organization_id());
CREATE POLICY schedule_events_select_restrict ON schedule_events FOR SELECT USING (
 (is_org_admin() AND organization_id=get_user_organization_id()) OR category IN ('open','offsite')
 OR EXISTS(SELECT 1 FROM reservations r JOIN customers c ON c.id=r.customer_id WHERE r.schedule_event_id=schedule_events.id AND c.user_id=auth.uid()));
INSERT INTO organizations VALUES('${org}'),('${other}');
INSERT INTO auth.users VALUES('${actor}'),('${customerActor}');
INSERT INTO test_actors VALUES('${actor}','${org}',true),('${customerActor}','${org}',false);
INSERT INTO scenario_masters VALUES('${master}');
INSERT INTO schedule_events(id,organization_id,date,start_time,end_time,venue,scenario,scenario_master_id)
 VALUES('${event}','${org}','2099-10-11','15:30','19:00','fixture','マスタ引用作品','${master}'),
 ('${otherEvent}','${other}','2099-10-11','15:30','19:00','fixture','別組織','${master}');
INSERT INTO customers VALUES('${customer}','${customerActor}','${org}','fixture','fixture@example.invalid','000'),
 ('${foreignCustomer}',NULL,'${other}','foreign','foreign@example.invalid','111');`)
const helper = fs.readFileSync('supabase/migrations/20261001090000_reservation_actor_auth.sql','utf8')
await db.exec(helper.slice(helper.indexOf('CREATE OR REPLACE FUNCTION public.reservation_actor_is_org_operator'),helper.indexOf('DO $migration$',helper.indexOf('REVOKE ALL ON FUNCTION public.reservation_actor_is_org_operator'))))
const run = async (uid, query, role='authenticated') => {
  await db.exec('BEGIN')
  try {
    await db.exec(`SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${uid || ''}',true)`)
    const result = await db.query(query)
    await db.exec('COMMIT')
    return result
  } catch (error) { await db.exec('ROLLBACK'); throw error }
}
await assert.rejects(run(actor,`INSERT INTO reservations(organization_id,schedule_event_id,title,requested_datetime,duration) VALUES('${org}','${event}','fixture',now(),120) RETURNING id`),error=>error.code==='42P17')
console.log('PASS 本番の予約→公演→予約の循環で直接INSERTが失敗することを再現')
const policies = (await db.query('SELECT * FROM pg_policies ORDER BY tablename,policyname')).rows
const migration = fs.readFileSync('supabase/migrations/20261012130000_operator_add_participants.sql','utf8')
await db.exec(migration)
assert.deepEqual((await db.query('SELECT * FROM pg_policies ORDER BY tablename,policyname')).rows,policies)
const row = { schedule_event_id:event, organization_id:other, title:'偽装', requested_datetime:'2099-10-11T19:00:00+09:00',
 duration:210, participant_count:1, participant_names:['fixture'], payment_method:'staff',payment_status:'paid',
 reservation_source:'staff_participation', base_price:0,total_price:0,final_price:0 }
const rpc = rows => `SELECT * FROM add_manual_reservations('${JSON.stringify(rows)}'::jsonb)`
const added = (await run(actor,rpc([row]))).rows[0]
assert.equal(added.organization_id,org); assert.equal(added.scenario_master_id,master)
assert.equal(added.title,'マスタ引用作品'); assert.equal(new Date(added.requested_datetime).toISOString(),'2099-10-11T06:30:00.000Z')
assert.equal(added.payment_method,'staff'); assert.equal(added.final_price,0); assert.equal(added.created_by,actor)
assert.equal((await db.query(`SELECT current_participants FROM schedule_events WHERE id='${event}'`)).rows[0].current_participants,1)
assert.equal((await run(actor,`SELECT id FROM reservations WHERE id='${added.id}'`)).rows.length,1)
console.log('PASS 同組織のスタッフ追加・0円・マスタ参照・公演の正しい日時・読み戻し')
const walkIn=(await run(actor,rpc([{...row,reservation_source:'walk_in',customer_id:customer,payment_method:'onsite',base_price:4000,total_price:4000,final_price:4000}]))).rows[0]
assert.equal(walkIn.customer_email,'fixture@example.invalid'); assert.equal(walkIn.final_price,4000)
assert.equal((await db.query(`SELECT current_participants FROM schedule_events WHERE id='${event}'`)).rows[0].current_participants,2)
await run(actor,rpc([{...row,reservation_source:'demo_auto',participant_count:2}]))
assert.equal((await db.query(`SELECT current_participants FROM schedule_events WHERE id='${event}'`)).rows[0].current_participants,4)
console.log('PASS 手動顧客・デモの既存料金を維持し、実トリガーで人数合計を更新')
const denied = async (uid,rows,code,role) => {
 const count=(await db.query('SELECT count(*) FROM reservations')).rows[0].count
 await assert.rejects(run(uid,rpc(rows),role),error=>error.code===code)
 assert.equal((await db.query('SELECT count(*) FROM reservations')).rows[0].count,count)
}
await denied(null,[row],'42501','anon')
await denied(null,[row],'28000')
await denied(customerActor,[row],'42501')
await denied(actor,[{...row,schedule_event_id:otherEvent}],'42501')
await denied(actor,[{...row,customer_id:foreignCustomer}],'42501')
await denied(actor,[{...row,participant_count:0}],'22023')
await denied(actor,[{...row,reservation_source:'web'}],'22023')
await denied(actor,[row,{...row,schedule_event_id:otherEvent}],'42501')
await db.exec(`UPDATE schedule_events SET is_cancelled=true WHERE id='${event}'`)
await denied(actor,[row],'22023')
console.log('PASS 未認証・顧客・別組織の公演/顧客・不正人数・中止公演・バッチ途中失敗を拒否し予約は不変')
await db.exec(fs.readFileSync('supabase/rollbacks/20261012130000_operator_add_participants.sql','utf8'))
assert.equal((await db.query("SELECT to_regprocedure('add_manual_reservations(jsonb)') AS signature")).rows[0].signature,null)
await db.exec(migration)
console.log('PASS ロールバック・再適用。RLSポリシーは変更なし')
await db.close()

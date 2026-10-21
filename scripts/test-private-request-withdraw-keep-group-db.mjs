// 貸切の申込の取り下げ（グループを残す／閉じる）の DB 検証（PGlite）。
// migration 20261020140000_private_request_withdraw_keep_group と同名 rollback を読み、
// 残す: 申込は取消・グループは募集中・候補日と回答は残る・チャットに 1 行・申込し直せる
// 権限: 申込者本人かつ主催者のみ（他人・メンバー・スタッフ・未ログインは不可）
// 二重実行: 2 回目は P0054 で何も増えない
// 閉じる（従来の取消でグループが閉じる流れ）のお知らせ文面は従来どおり
import fs from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const ORG = id(21), OTHER_ORG = id(22)
const ORGANIZER = id(11), MEMBER_USER = id(12), STRANGER = id(13), STAFF_USER = id(14)
const CUSTOMER = id(1), MEMBER_CUSTOMER = id(2)
const GROUP = id(31), RES = id(51)
const MIGRATION = 'supabase/migrations/20261020140000_private_request_withdraw_keep_group.sql'
const ROLLBACK = 'supabase/rollbacks/20261020140000_private_request_withdraw_keep_group.sql'

await db.exec(`
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE TABLE customers(id uuid PRIMARY KEY,user_id uuid,email text,name text,nickname text,organization_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,status text,name text,discord_channel_id text);
CREATE TABLE private_groups(id uuid PRIMARY KEY,status text,updated_at timestamptz,organization_id uuid,reservation_id uuid,organizer_id uuid,invite_code text);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,is_organizer boolean,status text,created_at timestamptz DEFAULT now());
CREATE TABLE private_group_candidate_dates(id uuid PRIMARY KEY,group_id uuid,date date,status text);
CREATE TABLE private_group_date_responses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),candidate_date_id uuid,member_id uuid,response text);
CREATE TABLE private_group_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,member_id uuid,sender_type text,message text,created_at timestamptz DEFAULT now());
CREATE TABLE reservations(id uuid PRIMARY KEY,schedule_event_id uuid,status text,customer_id uuid,organization_id uuid,private_group_id uuid,
  participant_count int,cancelled_at timestamptz,cancellation_reason text,updated_at timestamptz,reservation_number text,title text,
  customer_name text,customer_email text,candidate_datetimes jsonb,reservation_source text);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,date date,start_time time,is_cancelled boolean);
CREATE TABLE user_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,customer_id uuid,organization_id uuid,type text,title text,message text,link text,related_reservation_id uuid,related_event_id uuid,metadata jsonb);
CREATE TABLE email_log(kind text,dedupe text,to_email text,subject text,lines text[]);
CREATE TABLE gm_availability_responses(reservation_id uuid,staff_id uuid);
CREATE TABLE discord_notification_queue(organization_id uuid,notification_type text,reference_id uuid,dedupe_key text,webhook_url text,message_payload jsonb,max_retries int,
  UNIQUE(organization_id,notification_type,dedupe_key));
CREATE TABLE organization_settings(organization_id uuid,notification_settings jsonb);
-- お知らせの部品は本物の定義の代わりに記録だけする
CREATE FUNCTION public.customer_notice_work_title(p_title text) RETURNS text LANGUAGE sql AS $$SELECT coalesce(nullif(p_title,''),'公演')$$;
CREATE FUNCTION public.customer_notice_when(p_date date, p_time time DEFAULT NULL) RETURNS text LANGUAGE sql AS $$SELECT p_date::text$$;
CREATE FUNCTION public.customer_notice_reservation_link(p_reservation public.reservations) RETURNS text LANGUAGE sql AS $$SELECT '/group/invite/x'$$;
CREATE FUNCTION public.customer_notice_user_contact(p_user uuid, OUT email text, OUT name text) LANGUAGE sql AS $$SELECT 'u@example.test'::text,'主催者'::text$$;
CREATE FUNCTION public.customer_notice_bell(p_user uuid, p_customer uuid, p_org uuid, p_type text, p_kind text,
  p_dedupe text, p_title text, p_message text, p_link text, p_reservation uuid DEFAULT NULL, p_event uuid DEFAULT NULL, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid LANGUAGE plpgsql AS $$DECLARE v uuid; BEGIN
  INSERT INTO user_notifications(user_id,customer_id,organization_id,type,title,message,link,metadata) VALUES(p_user,p_customer,p_org,p_type,p_title,p_message,p_link,jsonb_build_object('kind',p_kind)) RETURNING id INTO v; RETURN v; END$$;
CREATE FUNCTION public.customer_notice_enqueue_email(p_org uuid, p_kind text, p_dedupe text, p_email_type text,
  p_to_email text, p_to_name text, p_subject text, p_lines text[], p_link text, p_footer text DEFAULT NULL,
  p_guest boolean DEFAULT false, p_notification uuid DEFAULT NULL, p_store uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql AS $$BEGIN INSERT INTO email_log VALUES(p_kind,p_dedupe,p_to_email,p_subject,p_lines); RETURN NULL; END$$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
`)
await db.query('INSERT INTO customers(id,user_id,organization_id) VALUES ($1,$2,$5),($3,$4,$5)', [CUSTOMER, ORGANIZER, MEMBER_CUSTOMER, MEMBER_USER, ORG])
await db.query("INSERT INTO staff(user_id,organization_id,status) VALUES ($1,$2,'active')", [STAFF_USER, ORG])
await db.exec(fs.readFileSync(MIGRATION, 'utf8'))

const reset = async ({ groupStatus = 'booking_requested', resStatus = 'pending', groupOrg = ORG, groupRes = RES, eventId = null } = {}) => {
  await db.exec('RESET ROLE; DELETE FROM private_group_messages; DELETE FROM private_group_date_responses; DELETE FROM private_group_candidate_dates; DELETE FROM private_group_members; DELETE FROM reservations; DELETE FROM private_groups; DELETE FROM user_notifications; DELETE FROM email_log; DELETE FROM discord_notification_queue;')
  await db.query("INSERT INTO private_groups VALUES ($1,$2,NULL,$3,$4,$5,'abc')", [GROUP, groupStatus, groupOrg, groupRes, ORGANIZER])
  await db.query("INSERT INTO private_group_members(id,group_id,user_id,is_organizer,status) VALUES ($1,$2,$3,true,'joined'),($4,$2,$5,false,'joined')", [id(61), GROUP, ORGANIZER, id(62), MEMBER_USER])
  await db.query("INSERT INTO private_group_candidate_dates VALUES ($1,$3,'2026-11-07','active'),($2,$3,'2026-11-08','active')", [id(71), id(72), GROUP])
  await db.query("INSERT INTO private_group_date_responses(candidate_date_id,member_id,response) VALUES ($1,$2,'ok'),($1,$3,'maybe')", [id(71), id(61), id(62)])
  await db.query(`INSERT INTO reservations(id,schedule_event_id,status,customer_id,organization_id,private_group_id,participant_count,reservation_number,title,customer_name,customer_email,candidate_datetimes,reservation_source)
    VALUES ($1,$2,$3,$4,$5,$6,4,'R-1','作品A','主催者','u@example.test','{"candidates":[{"date":"2026-11-07","startTime":"13:00","endTime":"17:00"}]}','web_private')`,
    [RES, eventId, resStatus, CUSTOMER, ORG, GROUP])
}
const as = async (user, role = 'authenticated') => {
  await db.query("SELECT set_config('test.uid',$1,false)", [user || ''])
  await db.exec(`SET ROLE ${role}`)
}
const withdraw = () => db.query('SELECT public.withdraw_private_request_keep_group($1::uuid) AS ok', [RES])
const state = async () => {
  await db.exec('RESET ROLE')
  const one = async (sql, params = []) => (await db.query(sql, params)).rows
  return {
    group: (await one('SELECT status,reservation_id FROM private_groups'))[0],
    reservation: (await one('SELECT status,cancellation_reason FROM reservations WHERE id=$1', [RES]))[0],
    candidates: (await one('SELECT count(*)::int n FROM private_group_candidate_dates'))[0].n,
    responses: (await one('SELECT count(*)::int n FROM private_group_date_responses'))[0].n,
    messages: await one('SELECT member_id,message FROM private_group_messages'),
    bells: await one('SELECT user_id,title,message FROM user_notifications'),
    mails: await one('SELECT kind,lines FROM email_log'),
  }
}

// 1) 残す: 申込は取消、グループは募集中、候補日・回答は残り、チャットに 1 行、主催者にベルと控え（残した文面）
await reset(); await as(ORGANIZER)
assert.equal((await withdraw()).rows[0].ok, true)
let s = await state()
assert.deepEqual(s.group, { status: 'gathering', reservation_id: RES })
assert.deepEqual(s.reservation, { status: 'cancelled', cancellation_reason: 'お客様による貸切申込の取り下げ' })
assert.equal(s.candidates, 2); assert.equal(s.responses, 2)
assert.equal(s.messages.length, 1)
assert.equal(s.messages[0].member_id, id(61))
assert.deepEqual(JSON.parse(s.messages[0].message), { type: 'system', action: 'booking_withdrawn', reservationId: RES, title: '申込を取り下げました。候補日を直してもう一度申し込めます' })
assert.equal(s.bells.length, 1)
assert.equal(s.bells[0].user_id, ORGANIZER)
assert.match(s.bells[0].message, /グループはそのままです。候補日を直してもう一度申し込めます。/)
assert.equal(s.mails.length, 1)
assert.ok(s.mails[0].lines.includes('グループはそのまま残っています。候補日を直して、もう一度申し込めます。'))
assert.ok(!s.mails[0].lines.some(l => l?.includes('グループは閉じられ')))

// 2) 店舗への取り下げ通知: 残した場合は 1 行足す
await db.query("INSERT INTO staff(id,user_id,organization_id,status,name,discord_channel_id) VALUES ($1,$2,$3,'active','GM1','123456789012345678')", [id(81), id(15), ORG])
await db.query('INSERT INTO gm_availability_responses VALUES ($1,$2)', [RES, id(81)])
await db.query('SELECT public.enqueue_private_request_withdrawal($1)', [RES])
let queue = (await db.query('SELECT message_payload FROM discord_notification_queue')).rows
assert.equal(queue.length, 1)
assert.match(queue[0].message_payload.content, /グループは残っています（お客様が候補日を直して申し込み直す場合があります）。/)

// 3) 二重実行: 2 回目は P0054、何も増えない
await as(ORGANIZER)
await assert.rejects(withdraw(), e => e.code === 'P0054')
s = await state(); assert.equal(s.messages.length, 1); assert.equal(s.bells.length, 1); assert.equal(s.group.status, 'gathering')

// 4) 権限: メンバー・他人・スタッフ・未ログイン・anon は不可（何も変わらない）
for (const [user, role, code] of [[MEMBER_USER, 'authenticated', 'P0009'], [STRANGER, 'authenticated', 'P0009'], [STAFF_USER, 'authenticated', 'P0009'], [null, 'authenticated', 'P0009'], [null, 'anon', '42501']]) {
  await reset(); await as(user, role)
  await assert.rejects(withdraw(), e => e.code === code, `${user}/${role}`)
  s = await state()
  assert.equal(s.reservation.status, 'pending'); assert.equal(s.group.status, 'booking_requested'); assert.equal(s.messages.length, 0)
}
// 申込者だが主催者ではない（主催者の引き継ぎ後など）
await reset(); await db.query('UPDATE private_groups SET organizer_id=$1', [MEMBER_USER]); await as(ORGANIZER)
await assert.rejects(withdraw(), e => e.code === 'P0009')
assert.equal((await state()).reservation.status, 'pending')

// 5) 状態の食い違い: 返事待ちでない・確定後・紐づき違い・別組織は理由付きで止まる
for (const [opts, code] of [
  [{ resStatus: 'confirmed', groupStatus: 'confirmed' }, 'P0055'],
  [{ eventId: id(41) }, 'P0055'],
  [{ groupStatus: 'gathering' }, 'P0055'],
  [{ groupRes: id(52) }, 'P0051'],
  [{ groupOrg: OTHER_ORG }, 'P0050'],
]) {
  await reset(opts); await as(ORGANIZER)
  await assert.rejects(withdraw(), e => e.code === code, JSON.stringify(opts))
  s = await state(); assert.equal(s.messages.length, 0); assert.equal(s.reservation.status, opts.resStatus ?? 'pending')
}

// 6) チャットへの書き込みに失敗したら申込もグループも元のまま
await db.exec("CREATE FUNCTION fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture notice failure'; END$$; CREATE TRIGGER fail_notice BEFORE INSERT ON private_group_messages FOR EACH ROW EXECUTE FUNCTION fail_notice();")
await reset(); await as(ORGANIZER)
await assert.rejects(withdraw(), /fixture notice failure/)
s = await state(); assert.equal(s.reservation.status, 'pending'); assert.equal(s.group.status, 'booking_requested'); assert.equal(s.bells.length, 0)
await db.exec('DROP TRIGGER fail_notice ON private_group_messages')

// 7) 閉じる（従来の取消: 予約を先に取り消し、そのあとグループを閉じる）のお知らせは従来の文面
await reset(); await db.exec('RESET ROLE')
await db.query("UPDATE reservations SET status='cancelled',cancelled_at=now(),cancellation_reason='お客様による貸切申込の取り下げ' WHERE id=$1", [RES])
await db.exec("UPDATE private_groups SET status='cancelled'")
s = await state()
assert.equal(s.bells.length, 1)
assert.doesNotMatch(s.bells[0].message, /グループはそのまま/)
assert.ok(s.mails[0].lines.includes('グループは閉じられ、メンバーの皆さまにもお知らせしました。'))
await db.query('SELECT public.enqueue_private_request_withdrawal($1)', [RES])
queue = (await db.query('SELECT message_payload FROM discord_notification_queue')).rows
assert.equal(queue.length, 1); assert.doesNotMatch(queue[0].message_payload.content, /グループは残っています/)

// 8) 巻き戻し: 関数が消え、閉じる流れの文面は従来どおり。もう一度当てても動く
await db.exec(fs.readFileSync(ROLLBACK, 'utf8'))
assert.equal((await db.query("SELECT count(*)::int n FROM pg_proc WHERE proname='withdraw_private_request_keep_group'")).rows[0].n, 0)
await reset(); await db.query("UPDATE reservations SET status='cancelled',cancelled_at=now(),cancellation_reason='お客様による貸切申込の取り下げ' WHERE id=$1", [RES])
s = await state(); assert.ok(s.mails[0].lines.includes('グループは閉じられ、メンバーの皆さまにもお知らせしました。'))
await db.exec(fs.readFileSync(MIGRATION, 'utf8'))
await reset(); await as(ORGANIZER); assert.equal((await withdraw()).rows[0].ok, true)
assert.equal((await state()).group.status, 'gathering')

console.log('[private-request-withdraw-keep-group-db] OK')

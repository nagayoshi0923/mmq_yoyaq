// 店舗の「個別にお知らせ」（配役されたキャラクターの資料 URL＝HO の URL）を、宛先の本人へメール（とベル）でも届けること
// （20261117130000_private_individual_notice_email）。実際の migration の関数本体と、送信待ちに積む部品（20261009140000）を PGlite に流す。
//   ・宛先の本人にだけ、資料 URL・あなたの配役入りのメールが積まれる。会員にはベルも。ゲストには PIN の案内
//   ・チャットへのお知らせはこれまでどおり書かれる／宛先の無い人はチャットだけ
//   ・スタッフ以外は呼べない（メールも積まれない）
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const ORG = id(1), SM = id(2), GROUP = id(3), RES = id(4), EVENT = id(5), STORE = id(6)
const U_ORG = id(10), U_MEM = id(11)
const M_ORG = id(20), M_MEM = id(21), M_GUEST = id(22), M_LEFT = id(23), M_NOMAIL = id(24)

await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key, email text);
CREATE TABLE test_actor(role text); INSERT INTO test_actor VALUES('staff');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000099'::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated' $$;
CREATE FUNCTION public.private_group_actor_role(uuid) RETURNS text LANGUAGE sql AS $$ SELECT role FROM test_actor $$;
CREATE TABLE staff(id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, name text, status text);
CREATE TABLE global_settings(organization_id uuid, individual_notice_default_body text);
CREATE TABLE organizations(id uuid primary key);
CREATE TABLE organization_settings(organization_id uuid, reply_to_email text);
CREATE TABLE email_settings(organization_id uuid, store_id uuid, company_name text, company_email text);
CREATE TABLE customers(id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, name text, nickname text, email text, created_at timestamptz default now());
CREATE TABLE user_notifications(id uuid primary key default gen_random_uuid(), user_id uuid, customer_id uuid, organization_id uuid, type text,
 title text, message text, link text, related_reservation_id uuid, related_event_id uuid, metadata jsonb);
CREATE TABLE scenario_masters(id uuid primary key, title text);
CREATE TABLE organization_scenarios_with_master(organization_id uuid, scenario_master_id uuid, characters jsonb, org_scenario_id uuid, individual_notice_template text);
CREATE TABLE stores(id uuid primary key, organization_id uuid, name text);
CREATE TABLE schedule_events(id uuid primary key, date date, start_time time, store_id uuid);
CREATE TABLE reservations(id uuid primary key, schedule_event_id uuid, status text, reservation_number text, cancellation_reason text, organization_id uuid);
CREATE TABLE private_groups(id uuid primary key, organization_id uuid, scenario_master_id uuid, organizer_id uuid, invite_code text,
 status text, reservation_id uuid, character_assignments jsonb);
CREATE TABLE private_group_members(id uuid primary key, group_id uuid, user_id uuid, is_organizer boolean default false, status text,
 guest_name text, guest_email text, created_at timestamptz default now());
CREATE TABLE private_group_members_pii(member_id uuid primary key, guest_name text, guest_email text);
CREATE TABLE private_group_candidate_dates(group_id uuid, status text, withdrawn_at timestamptz);
CREATE TABLE private_group_messages(id uuid primary key default gen_random_uuid(), group_id uuid, member_id uuid, message text, created_at timestamptz not null default now());
CREATE FUNCTION public.customer_notice_when_long(p_date date, p_time time DEFAULT NULL) RETURNS text LANGUAGE sql AS $$ SELECT p_date::text||coalesce(' '||p_time::text,'') $$;
CREATE FUNCTION public.customer_notice_when(p_date date, p_time time DEFAULT NULL) RETURNS text LANGUAGE sql AS $$ SELECT p_date::text $$;
CREATE FUNCTION public.customer_store_name(p_store_id uuid, p_date date DEFAULT NULL, p_fallback text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$ SELECT p_fallback $$;
CREATE FUNCTION public.get_private_group_survey_settings(uuid, uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
`)

// 送信待ちの表・部品は本物（20261009140000）をそのまま使う
const phase4 = fs.readFileSync('supabase/migrations/20261009140000_mypage_phase4_notifications.sql', 'utf8')
const pick = (src, re) => { const m = src.match(re); assert.ok(m, `抜き出せない: ${re}`); return m[0] }
await db.exec(pick(phase4, /CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_dedupe_key_idx[\s\S]*?;/))
await db.exec(pick(phase4, /CREATE TABLE IF NOT EXISTS public\.customer_notice_emails \([\s\S]*?\n\);/))
await db.exec(pick(phase4, /CREATE OR REPLACE FUNCTION public\.customer_notice_bell\([\s\S]*?END \$function\$;/))
await db.exec(pick(phase4, /CREATE OR REPLACE FUNCTION public\.customer_notice_user_contact\([\s\S]*?\n\$\$;/))
await db.exec(pick(phase4, /CREATE OR REPLACE FUNCTION public\.customer_notice_enqueue_email\([\s\S]*?END \$function\$;/))
await db.exec(pick(phase4, /CREATE OR REPLACE FUNCTION public\.customer_notice_group_members\([\s\S]*?END \$function\$;/))

const migration = fs.readFileSync('supabase/migrations/20261117130000_private_individual_notice_email.sql', 'utf8')
await db.exec(pick(migration, /CREATE OR REPLACE FUNCTION public\.private_group_send_individual_notice\([\s\S]*?END \$\$;/))

await db.exec(`
INSERT INTO organizations VALUES('${ORG}');
INSERT INTO email_settings VALUES('${ORG}', NULL, 'テスト店', 'shop@example.com');
INSERT INTO auth.users VALUES('${U_ORG}','organizer@example.com'),('${U_MEM}','member@example.com');
INSERT INTO customers(user_id,organization_id,name) VALUES('${U_ORG}','${ORG}','主催 太郎'),('${U_MEM}','${ORG}','会員 花子');
INSERT INTO scenario_masters VALUES('${SM}','テスト作品');
INSERT INTO organization_scenarios_with_master VALUES('${ORG}','${SM}','[{"id":"c1","name":"探偵","url":"https://drive.example.com/ho-tantei","survey_description":"事前に資料をお読みください。"},{"id":"c2","name":"執事"},{"id":"c3","name":"令嬢"},{"id":"c4","name":"医師"},{"id":"c5","name":"庭師"}]');
INSERT INTO stores VALUES('${STORE}','${ORG}','大宮店');
INSERT INTO schedule_events VALUES('${EVENT}','2026-12-20','13:00','${STORE}');
INSERT INTO reservations VALUES('${RES}','${EVENT}','confirmed','R-1',NULL,'${ORG}');
INSERT INTO private_groups VALUES('${GROUP}','${ORG}','${SM}','${U_ORG}','INV1','confirmed','${RES}',NULL);
INSERT INTO private_group_members(id,group_id,user_id,is_organizer,status,created_at) VALUES
 ('${M_ORG}','${GROUP}','${U_ORG}',true,'joined','2026-11-01'),
 ('${M_MEM}','${GROUP}','${U_MEM}',false,'joined','2026-11-02');
INSERT INTO private_group_members(id,group_id,user_id,status,guest_name,created_at) VALUES
 ('${M_GUEST}','${GROUP}',NULL,'joined','ゲスト','2026-11-03'),
 ('${M_LEFT}','${GROUP}',NULL,'left','抜けた人','2026-11-04'),
 ('${M_NOMAIL}','${GROUP}',NULL,'joined','宛先なし','2026-11-05');
INSERT INTO private_group_members_pii VALUES('${M_GUEST}','ゲスト 次郎','guest@example.com'),('${M_LEFT}','抜けた人','left@example.com');
INSERT INTO staff(user_id,organization_id,name) VALUES('00000000-0000-0000-0000-000000000099','${ORG}','店長');
`)

const send = (memberId, characterId, message = '') =>
  db.query(`SELECT public.private_group_send_individual_notice($1,$2,$3,$4,false) AS r`, [GROUP, memberId, message, characterId])
const mails = async () => (await db.query(`SELECT to_email, to_name, subject, body_text FROM customer_notice_emails WHERE kind='private_individual_notice' ORDER BY created_at`)).rows
const bells = async () => (await db.query(`SELECT user_id, title FROM user_notifications WHERE metadata->>'kind'='private_individual_notice'`)).rows
const chats = async () => (await db.query(`SELECT message FROM private_group_messages WHERE message LIKE '%individual_notice%'`)).rows

// 会員へ: 探偵の資料 URL を添付
await send(M_MEM, 'c1', '配役が決まりました。')
let m = await mails()
assert.equal(m.length, 1)
assert.equal(m[0].to_email, 'member@example.com', '宛先の本人だけ')
assert.match(m[0].subject, /^【店舗からのお知らせ】テスト作品 - 2026-12-20 13:00:00 \| テスト店$/)
assert.match(m[0].body_text, /^会員 花子 様/)
assert.match(m[0].body_text, /あなたの配役: 探偵/)
assert.match(m[0].body_text, /配役が決まりました。/)
assert.match(m[0].body_text, /事前に資料をお読みください。/)
assert.match(m[0].body_text, /【探偵の資料】\nhttps:\/\/drive\.example\.com\/ho-tantei/)
assert.match(m[0].body_text, /会場: 大宮店/)
assert.doesNotMatch(m[0].body_text, /4桁のPIN/)
assert.deepEqual((await bells()).map(b => b.user_id), [U_MEM], '会員にはベル')
assert.equal((await chats()).length, 1, 'チャットにも書かれる')

// ゲストへ: PIN の案内つき
await send(M_GUEST, 'c1')
m = await mails()
assert.equal(m.length, 2)
assert.equal(m[1].to_email, 'guest@example.com')
assert.match(m[1].body_text, /^ゲスト 次郎 様/)
assert.match(m[1].body_text, /4桁のPIN/)

// 宛先の無い人: チャットには書くがメールは積まない
await send(M_NOMAIL, null, 'お知らせです')
assert.equal((await mails()).length, 2)
assert.equal((await chats()).length, 3)

// 同じ内容をもう一度送る → お知らせ 1 件ごとに届く（スタッフが送り直した分も届く）
await send(M_MEM, 'c1', '配役が決まりました。')
assert.equal((await mails()).length, 3)

// スタッフ以外は呼べない
await db.exec(`UPDATE test_actor SET role='organizer'`)
await assert.rejects(send(M_MEM, 'c1', '偽の案内'), /スタッフ権限が必要です/)
assert.equal((await mails()).length, 3)

console.log('OK private individual notice email: 5 checks')

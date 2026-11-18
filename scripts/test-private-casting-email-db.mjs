// 事前配役の確定をメール（とベル）でも届けること（20261117120000_private_casting_confirmed_email）。
// 実際の migration の関数本体と、送信待ちに積む部品（20261009140000）を PGlite に流して確かめる。
//   ・配役が付いた参加中メンバー全員（会員・ゲスト）に、本人の配役入りのメールが積まれる。会員にはベルも
//   ・同じ配役での確定し直しでは積み直さない／配役が変わったら積み直す（A → B → A と戻したときも）
//   ・グループに保存された配役と違うお知らせ（形だけ真似た書き込み）では積まない
//   ・抜けたメンバー・宛先の無いメンバーには積まない／閉じたグループでは積まない
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
CREATE TABLE organizations(id uuid primary key);
CREATE TABLE organization_settings(organization_id uuid, reply_to_email text);
CREATE TABLE email_settings(organization_id uuid, store_id uuid, company_name text, company_email text);
CREATE TABLE customers(id uuid primary key default gen_random_uuid(), user_id uuid, organization_id uuid, name text, nickname text, email text, created_at timestamptz default now());
CREATE TABLE user_notifications(id uuid primary key default gen_random_uuid(), user_id uuid, customer_id uuid, organization_id uuid, type text,
 title text, message text, link text, related_reservation_id uuid, related_event_id uuid, metadata jsonb);
CREATE TABLE scenario_masters(id uuid primary key, title text);
CREATE TABLE organization_scenarios_with_master(organization_id uuid, scenario_master_id uuid, characters jsonb);
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

const migration = fs.readFileSync('supabase/migrations/20261117120000_private_casting_confirmed_email.sql', 'utf8')
await db.exec(pick(migration, /CREATE OR REPLACE FUNCTION public\.customer_notice_on_group_message\(\)[\s\S]*?END \$function\$\n;/))
await db.exec(`CREATE CONSTRAINT TRIGGER customer_notice_on_group_message AFTER INSERT ON public.private_group_messages
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.message ~ '^\\s*\\{') EXECUTE FUNCTION public.customer_notice_on_group_message();`)

await db.exec(`
INSERT INTO organizations VALUES('${ORG}');
INSERT INTO email_settings VALUES('${ORG}', NULL, 'テスト店', 'shop@example.com');
INSERT INTO auth.users VALUES('${U_ORG}','organizer@example.com'),('${U_MEM}','member@example.com');
INSERT INTO customers(user_id,organization_id,name) VALUES('${U_ORG}','${ORG}','主催 太郎'),('${U_MEM}','${ORG}','会員 花子');
INSERT INTO scenario_masters VALUES('${SM}','テスト作品');
INSERT INTO organization_scenarios_with_master VALUES('${ORG}','${SM}','[{"id":"c1","name":"探偵"},{"id":"c2","name":"執事"},{"id":"c3","name":"令嬢"},{"id":"c4","name":"医師"},{"id":"c5","name":"庭師"}]');
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
`)

// private_group_confirm_characters と同じ順（配役を保存 → チャットへお知らせ）で 1 トランザクション
async function confirm(assign, opts = {}) {
  const a = JSON.stringify(assign)
  const msgAssign = JSON.stringify(opts.messageAssignments ?? assign)
  await db.exec(`BEGIN;
   UPDATE private_groups SET character_assignments='${a}'::jsonb WHERE id='${GROUP}';
   INSERT INTO private_group_messages(group_id,member_id,message) VALUES('${GROUP}',NULL,
    jsonb_build_object('type','system','action','character_assignment','title','キャラクター配役が確定しました',
     'body',E'主催 → 探偵\\n会員 → 執事','assignments','${msgAssign}'::jsonb)::text);
   COMMIT;`)
}
const mails = async () => (await db.query(`SELECT to_email, to_name, subject, body_text, dedupe_key FROM customer_notice_emails WHERE kind='private_casting' ORDER BY created_at, to_email`)).rows
const bells = async () => (await db.query(`SELECT user_id, title, message, link FROM user_notifications WHERE metadata->>'kind'='private_casting' ORDER BY user_id`)).rows

const first = { [M_ORG]: 'c1', [M_MEM]: 'c2', [M_GUEST]: 'c3', [M_LEFT]: 'c4', [M_NOMAIL]: 'c5' }
await confirm(first)
let m = await mails()
assert.deepEqual(m.map(r => r.to_email).sort(), ['guest@example.com', 'member@example.com', 'organizer@example.com'], '参加中で宛先のある 3 人だけ（抜けた人・宛先なしは積まない）')
const guestMail = m.find(r => r.to_email === 'guest@example.com')
assert.match(guestMail.subject, /^【配役のお知らせ】テスト作品 - 2026-12-20 13:00:00 \| テスト店$/)
assert.match(guestMail.body_text, /^ゲスト 次郎 様/)
assert.match(guestMail.body_text, /■ あなたの配役\n令嬢\n/)
assert.match(guestMail.body_text, /会場: 大宮店/)
assert.match(guestMail.body_text, /■ 参加者の配役\n主催 → 探偵\n会員 → 執事/)
assert.match(guestMail.body_text, /\{\{SITE_URL\}\}\/group\/invite\/INV1\?tab=overview/)
assert.match(guestMail.body_text, /4桁のPIN/, 'ゲストには PIN の案内')
const memberMail = m.find(r => r.to_email === 'member@example.com')
assert.match(memberMail.body_text, /^会員 花子 様/)
assert.match(memberMail.body_text, /■ あなたの配役\n執事\n/)
assert.doesNotMatch(memberMail.body_text, /4桁のPIN/)
let b = await bells()
assert.equal(b.length, 2, '会員 2 人にベル')
assert.ok(b.some(r => r.user_id === U_MEM && r.message.includes('あなたの配役は「執事」')))

// 同じ配役で確定し直す → 積み直さない
await confirm(first)
assert.equal((await mails()).length, 3, '同じ配役では送り直さない')
assert.equal((await bells()).length, 2)

// 配役を変えて確定し直す → 変わった配役で送り直す
const second = { ...first, [M_ORG]: 'c2', [M_MEM]: 'c1' }
await confirm(second)
m = await mails()
assert.equal(m.length, 6, '配役が変わったら全員へ送り直す')
assert.ok(m.slice(3).some(r => r.to_email === 'member@example.com' && /■ あなたの配役\n探偵\n/.test(r.body_text)))

// 最初の配役に戻す（A → B → A）→ 直前と違うので送り直す
await confirm(first)
m = await mails()
assert.equal(m.length, 9, '前の配役に戻したときも送り直す')
assert.ok(m.slice(6).some(r => r.to_email === 'member@example.com' && /■ あなたの配役\n執事\n/.test(r.body_text)))
await confirm(first)
assert.equal((await mails()).length, 9, '直後に同じ配役で確定し直しても送らない')

// グループに保存された配役と違うお知らせ → 積まない
await confirm(second, { messageAssignments: { [M_ORG]: 'c5' } })
assert.equal((await mails()).length, 9, '形だけ真似たお知らせでは送らない')

// 閉じたグループ → 積まない
await db.exec(`UPDATE private_groups SET status='cancelled' WHERE id='${GROUP}'`)
await confirm({ ...first, [M_ORG]: 'c3', [M_GUEST]: 'c1' })
assert.equal((await mails()).length, 9, '閉じたグループでは送らない')

// ほかのお知らせ（日程確定など）の分岐は変えていない: 対象外の action では何も積まない
await db.exec(`UPDATE private_groups SET status='confirmed' WHERE id='${GROUP}'`)
await db.exec(`INSERT INTO private_group_messages(group_id,member_id,message) VALUES('${GROUP}',NULL,'{"type":"system","action":"something_else"}')`)
assert.equal((await mails()).length, 9)

console.log('OK private casting email: 8 checks')

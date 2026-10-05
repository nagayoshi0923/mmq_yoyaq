// 公演前アンケートのリマインド: 対象の絞り込み・種類ごとの積み方・二重に積まない・回答済みは送らない・再試行・試し送り・サーバー専用・正規ソース一致・rollback
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400e3).toISOString().slice(0, 10)
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE scenario_masters(id uuid PRIMARY KEY, title text);
CREATE TABLE stores(id uuid PRIMARY KEY, name text);
CREATE TABLE schedule_events(id uuid PRIMARY KEY, organization_id uuid, store_id uuid, date date, start_time time);
CREATE TABLE reservations(id uuid PRIMARY KEY, organization_id uuid, status text, schedule_event_id uuid);
CREATE TABLE private_groups(id uuid PRIMARY KEY, organization_id uuid, status text, reservation_id uuid, scenario_master_id uuid, invite_code text);
CREATE TABLE private_group_members(id uuid PRIMARY KEY, group_id uuid, user_id uuid, status text);
CREATE TABLE private_group_members_pii(member_id uuid PRIMARY KEY, guest_name text, guest_email text);
CREATE TABLE customers(id uuid PRIMARY KEY, user_id uuid, name text, nickname text);
CREATE TABLE private_group_survey_responses(group_id uuid, member_id uuid, responses jsonb);
CREATE TABLE email_settings(organization_id uuid, store_id uuid, company_name text, company_email text);
CREATE TABLE organization_settings(organization_id uuid, reply_to_email text);
CREATE TABLE fixture_survey_settings(group_id uuid PRIMARY KEY, settings jsonb);
CREATE FUNCTION get_private_group_survey_settings(uuid, uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT settings FROM fixture_survey_settings WHERE group_id=$2 $$;`)
const org = id(1)
await db.query('INSERT INTO organizations VALUES($1)', [org])
await db.query("INSERT INTO scenario_masters VALUES($1,'架空の作品')", [id(2)])
await db.query("INSERT INTO stores VALUES($1,'架空店')", [id(3)])
await db.query("INSERT INTO email_settings VALUES($1,$2,'クインズワルツ')", [org, id(3)])
await db.query("INSERT INTO organization_settings VALUES($1,'reply@example.invalid')", [org])
// グループ: 10=締切7日後 11=締切明日 12=締切済み 13=アンケート無効 14=外部回答先 15=公演済み 16=日程未確定
const groups = [[10, 7, true, '', 10, 'confirmed'], [11, 1, true, '', 10, 'confirmed'], [12, -1, true, '', 10, 'confirmed'], [13, 7, false, '', 10, 'confirmed'], [14, 7, true, 'https://forms.example/x', 10, 'confirmed'], [15, 7, true, '', 0, 'confirmed'], [16, 7, true, '', 10, 'gathering']]
for (const [g, dl, en, url, perfIn, st] of groups) {
  await db.query('INSERT INTO schedule_events VALUES($1,$2,$3,$4,$5)', [id(100 + g), org, id(3), addDays(today, perfIn), '10:00'])
  await db.query("INSERT INTO reservations VALUES($1,$2,'confirmed',$3)", [id(200 + g), org, id(100 + g)])
  await db.query('INSERT INTO private_groups VALUES($1,$2,$3,$4,$5,$6)', [id(g), org, st, id(200 + g), id(2), `CODE${g}`])
  await db.query('INSERT INTO fixture_survey_settings VALUES($1,$2)', [id(g), { survey_enabled: en, survey_url: url, survey_deadline_at: `${addDays(today, dl)}T23:59:59.999+09:00` }])
}
// メンバー: 各グループにゲスト（未回答）。10 にはさらに会員（未回答）・回答済み・退出
for (const [g] of groups) { await db.query("INSERT INTO private_group_members VALUES($1,$2,NULL,'joined')", [id(300 + g), id(g)]); await db.query("INSERT INTO private_group_members_pii VALUES($1,'架空ゲスト',$2)", [id(300 + g), `g${g}@example.invalid`]) }
await db.query("INSERT INTO auth.users VALUES($1,'member@example.invalid')", [id(900)])
await db.query("INSERT INTO customers VALUES($1,$2,'架空 会員','かいいん')", [id(901), id(900)])
await db.query("INSERT INTO private_group_members VALUES($1,$2,$3,'joined'),($4,$2,NULL,'joined'),($5,$2,NULL,'declined')", [id(401), id(10), id(900), id(402), id(403)])
await db.query("INSERT INTO private_group_members_pii VALUES($1,'回答済み','done@example.invalid'),($2,'退出','gone@example.invalid')", [id(402), id(403)])
await db.query("INSERT INTO private_group_survey_responses VALUES($1,$2,'{}')", [id(10), id(402)])
const migration = fs.readFileSync('supabase/migrations/20261006110000_private_group_survey_reminders.sql', 'utf8')
const rollback = fs.readFileSync('supabase/rollbacks/20261006110000_private_group_survey_reminders.sql', 'utf8')
const rpc = fs.readFileSync('supabase/rpcs/private_group_survey_reminders.sql', 'utf8')
assert.equal(rpc.replace(/^--[^\n]*\n/, ''), migration.slice(migration.indexOf('-- 送る対象')).replace(/CREATE FUNCTION/g, 'CREATE OR REPLACE FUNCTION'), 'rpcs/ definition drifted from the migration')
await db.exec(migration)
const q = async (sql, args = []) => (await db.query(sql, args)).rows
const one = async (sql, args = []) => (await q(sql, args))[0]
// 対象: 10 のゲスト・会員、11 のゲスト（締切済み・無効・外部・公演済み・未確定・回答済み・退出は除く）
assert.deepEqual((await q('SELECT member_id FROM private_group_survey_reminder_targets() ORDER BY member_id')).map(r => r.member_id), [id(310), id(311), id(401)])
assert.equal((await one("SELECT enqueue_private_group_survey_reminders('deadline_7d') n")).n, 2)
assert.equal((await one("SELECT enqueue_private_group_survey_reminders('deadline_1d') n")).n, 1)
assert.equal((await one("SELECT enqueue_private_group_survey_reminders('manual') n")).n, 3)
assert.equal((await one("SELECT enqueue_private_group_survey_reminders('manual') n")).n, 0)
await assert.rejects(db.query("SELECT enqueue_private_group_survey_reminders('preview')"), /種類/)
// 取り出し: 宛先・宛名・署名がそろう。会員は登録の氏名とログインのアドレス
const claimed = await q('SELECT * FROM claim_private_group_survey_reminders(50) ORDER BY to_email, kind')
assert.equal(claimed.length, 6)
const member = claimed.find(r => r.to_email === 'member@example.invalid')
assert.equal(member.to_name, '架空 会員'); assert.equal(member.company_name, 'クインズワルツ'); assert.equal(member.reply_to, 'reply@example.invalid'); assert.equal(member.scenario_title, '架空の作品'); assert.equal(member.venue, '架空店'); assert.equal(member.invite_code, 'CODE10')
assert.equal(claimed.find(r => r.to_email === 'g11@example.invalid').to_name, '架空ゲスト')
assert.equal((await q('SELECT * FROM claim_private_group_survey_reminders(50)')).length, 0, '送信中のものは二重に取り出さない')
// 結果: 成功は sent、一時的な失敗は後で再試行、恒久的な失敗は failed
await db.query('SELECT finish_private_group_survey_reminder($1,true,$2)', [claimed[0].id, 'msg'])
await db.query("SELECT finish_private_group_survey_reminder($1,false,NULL,'503',NULL,true)", [claimed[1].id])
await db.query("SELECT finish_private_group_survey_reminder($1,false,NULL,'bad address',NULL,false)", [claimed[2].id])
assert.deepEqual((await q('SELECT status FROM private_group_survey_reminders WHERE id = ANY($1) ORDER BY array_position($1, id)', [[claimed[0].id, claimed[1].id, claimed[2].id]])).map(r => r.status), ['sent', 'pending', 'failed'])
assert.ok((await one('SELECT next_attempt_at > now() later FROM private_group_survey_reminders WHERE id=$1', [claimed[1].id])).later)
// 送る前に回答したら送らない
await db.query("UPDATE private_group_survey_reminders SET next_attempt_at=now()-interval '1 minute' WHERE id=$1", [claimed[1].id])
await db.query("INSERT INTO private_group_survey_responses SELECT group_id, member_id, '{}' FROM private_group_survey_reminders WHERE id=$1", [claimed[1].id])
assert.equal((await q('SELECT * FROM claim_private_group_survey_reminders(50)')).length, 0)
assert.equal((await one('SELECT status, last_error FROM private_group_survey_reminders WHERE id=$1', [claimed[1].id])).status, 'skipped')
// 試し送り: 対象の 1 人分を指定の宛先へ（対象外は断る）
const previewId = (await one('SELECT enqueue_private_group_survey_reminder_preview($1,$2) id', [id(401), 'owner@example.invalid'])).id
assert.equal((await one('SELECT to_email FROM claim_private_group_survey_reminders(50) WHERE id=$1', [previewId])).to_email, 'owner@example.invalid')
await assert.rejects(db.query('SELECT enqueue_private_group_survey_reminder_preview($1,$2)', [id(402), 'owner@example.invalid']), /対象ではありません/)
await assert.rejects(db.query('SELECT enqueue_private_group_survey_reminder_preview($1,$2)', [id(401), 'not-an-email']), /宛先/)
// サーバー専用・画面から読めない
for (const role of ['anon', 'authenticated']) {
  await db.exec(`SET ROLE ${role}`)
  await assert.rejects(db.query("SELECT enqueue_private_group_survey_reminders('manual')"), /permission denied/)
  await assert.rejects(db.query('SELECT * FROM claim_private_group_survey_reminders(1)'), /permission denied/)
  await assert.rejects(db.query('SELECT * FROM private_group_survey_reminders'), /permission denied/)
  await db.exec('RESET ROLE')
}
assert.equal((await one("SELECT relrowsecurity r FROM pg_class WHERE relname='private_group_survey_reminders'")).r, true)
await db.exec(rollback); assert.equal((await one("SELECT to_regclass('private_group_survey_reminders') r")).r, null)
await db.exec(migration); assert.equal((await one("SELECT enqueue_private_group_survey_reminders('manual') n")).n, 2)
await db.close(); console.log('PASS survey reminders: targets; 7d/1d/manual enqueue once; claim with names/signature; no double claim; sent/retry/failed; skip if answered; preview; server only; rpcs source matches; rollback/reapply.')

// ゲストの PIN 再発行: 正しい招待コード＋参加時のメールでだけ新しい PIN を作る・古い PIN は無効・回数制限・ロック解除・サーバー専用・正規ソース一致・rollback
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
const db = new PGlite({ extensions: { pgcrypto } })
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE scenario_masters(id uuid PRIMARY KEY,title text);
CREATE TABLE private_groups(id uuid PRIMARY KEY,invite_code text,scenario_master_id uuid);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,status text);
CREATE TABLE private_group_members_pii(member_id uuid PRIMARY KEY REFERENCES private_group_members(id),guest_name text,guest_email text,access_pin text,access_pin_hash text,failed_attempts integer NOT NULL DEFAULT 0,locked_until timestamptz,updated_at timestamptz);
INSERT INTO scenario_masters VALUES('${id(50)}','架空の作品');
INSERT INTO private_groups VALUES('${id(1)}','CODE1','${id(50)}'),('${id(9)}','CODE9',NULL);
INSERT INTO private_group_members VALUES('${id(2)}','${id(1)}',NULL,'joined'),('${id(3)}','${id(1)}',NULL,'declined'),('${id(4)}','${id(1)}','${id(10)}','joined'),('${id(5)}','${id(9)}',NULL,'joined');
INSERT INTO private_group_members_pii(member_id,guest_name,guest_email) VALUES('${id(2)}','架空ゲスト','test@example.invalid'),('${id(3)}','退出','gone@example.invalid'),('${id(4)}','会員','user@example.invalid'),('${id(5)}','別グループ','test@example.invalid');`)
await db.exec(fs.readFileSync('supabase/migrations/20260927001000_guest_pin_attempt_limit.sql','utf8'))
const migration = fs.readFileSync('supabase/migrations/20261006100000_private_group_guest_pin_reset.sql','utf8')
const rollback = fs.readFileSync('supabase/rollbacks/20261006100000_private_group_guest_pin_reset.sql','utf8')
const rpc = fs.readFileSync('supabase/rpcs/reset_private_group_guest_pin.sql','utf8')
assert.ok(rpc.includes(migration.slice(migration.indexOf('CREATE FUNCTION public.reset_private_group_guest_pin')).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')),'rpcs/ definition drifted from the migration')
await db.exec(migration)
const as = async (role, sql, args=[]) => { await db.exec(`SET ROLE ${role}`); try { return (await db.query(sql,args)).rows } finally { await db.exec('RESET ROLE') } }
const reset = (code='CODE1', email='test@example.invalid') => as('service_role','SELECT * FROM reset_private_group_guest_pin($1,$2)',[code,email])
const auth = (pin, email='test@example.invalid', group=id(1)) => as('anon','SELECT * FROM authenticate_guest_by_pin_v2($1,$2,$3)',[group,email,pin])
await db.exec(`GRANT USAGE ON SCHEMA extensions TO service_role, anon;`)
await as('anon','SELECT save_guest_access_pin($1,$2)',[id(2),'1234'])
// 正しい招待コード＋参加時のメール（大文字・空白は無視）で新しい PIN を作る
const [r1] = await reset('CODE1',' TEST@example.invalid ')
assert.equal(r1.member_id,id(2)); assert.match(r1.pin,/^[1-9][0-9]{3}$/); assert.equal(r1.scenario_title,'架空の作品'); assert.equal(r1.invite_code,'CODE1'); assert.equal(r1.guest_email,'test@example.invalid')
assert.equal((await auth(r1.pin))[0]?.member_id,id(2))
if (r1.pin !== '1234') assert.deepEqual(await auth('1234'),[])
// 別グループの同じアドレスは、そのグループの招待コードでだけ
assert.equal((await reset('CODE9'))[0].member_id,id(5))
// 当てはまらないもの: 違う招待コード・登録の無いアドレス・会員・退出済み・形式違い
for (const [c,e] of [['NOPE','test@example.invalid'],['CODE1','missing@example.invalid'],['CODE1','user@example.invalid'],['CODE1','gone@example.invalid'],['CODE1','not-an-email'],[null,'test@example.invalid']]) assert.deepEqual(await reset(c,e),[])
// ロック中でも再発行すると解除される
await db.query("UPDATE private_group_members_pii SET failed_attempts=10, locked_until=now()+interval '15 minutes' WHERE member_id=$1",[id(2)])
const [r2] = await reset(); assert.equal((await auth(r2.pin))[0]?.member_id,id(2))
// 1 時間に 3 回まで（ここまで 2 回）
assert.equal((await reset()).length,1); assert.deepEqual(await reset(),[])
await db.query("UPDATE private_group_guest_pin_resets SET created_at=now()-interval '2 hours'")
assert.equal((await reset()).length,1)
// サーバー専用・記録は画面から読めない
await assert.rejects(as('anon','SELECT * FROM reset_private_group_guest_pin($1,$2)',['CODE1','test@example.invalid']),/permission denied/)
await assert.rejects(as('authenticated','SELECT * FROM reset_private_group_guest_pin($1,$2)',['CODE1','test@example.invalid']),/permission denied/)
assert.equal((await db.query("SELECT has_table_privilege('anon','private_group_guest_pin_resets','SELECT') a")).rows[0].a,false)
assert.equal((await db.query("SELECT relrowsecurity r FROM pg_class WHERE relname='private_group_guest_pin_resets'")).rows[0].r,true)
// 平文の PIN は残さない
assert.equal((await db.query('SELECT count(*)::int n FROM private_group_members_pii WHERE access_pin IS NOT NULL')).rows[0].n,0)
await db.exec(rollback); assert.equal((await db.query("SELECT to_regclass('private_group_guest_pin_resets') r")).rows[0].r,null)
await db.exec(migration); assert.equal((await reset()).length,1)
await db.close(); console.log('PASS guest pin reset: invite code + joined guest email only; new pin works and old fails; unlock; 3/hour; server only; no plain pin; rpcs source matches; rollback/reapply.')

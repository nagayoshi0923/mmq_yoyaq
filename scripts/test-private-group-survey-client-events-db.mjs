// 事前配役アンケートの画面の状態の記録: 本人だけが書ける・種類と大きさの制限・1日の上限・画面からは読めない・正規ソース一致・rollback
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,status text);
CREATE SCHEMA extensions; CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql AS $$ SELECT sha256(convert_to($1,'UTF8')) $$;
CREATE TABLE private_group_guest_sessions(token_hash text,member_id uuid,expires_at timestamptz);`)
await db.query('INSERT INTO private_groups VALUES($1,$2),($3,$2)',[id(100),id(10),id(200)])
// 101: ログイン参加者(user 1)  102: ゲスト  103: 別グループのゲスト  104: 退出したゲスト
for(const [n,g,u,st] of [[101,100,1,'joined'],[102,100,null,'joined'],[103,200,null,'joined'],[104,100,null,'declined']]) await db.query('INSERT INTO private_group_members VALUES($1,$2,$3,$4)',[id(n),id(g),u?id(u):null,st])
const tok='a'.repeat(64), other='b'.repeat(64)
await db.query("INSERT INTO private_group_guest_sessions VALUES(encode(sha256(convert_to($1,'UTF8')),'hex'),$2,now()+interval '1 day'),(encode(sha256(convert_to($3,'UTF8')),'hex'),$4,now()+interval '1 day')",[tok,id(102),other,id(103)])
const guestSql=fs.readFileSync('supabase/migrations/20260927006000_private_group_member_sessions.sql','utf8')
await db.exec(guestSql.slice(guestSql.indexOf('CREATE FUNCTION public.require_private_group_member('),guestSql.indexOf('CREATE FUNCTION public.join_private_group(')))
const migration=fs.readFileSync('supabase/migrations/20261005120000_private_group_survey_client_events.sql','utf8')
const rollback=fs.readFileSync('supabase/rollbacks/20261005120000_private_group_survey_client_events.sql','utf8')
const rpc=fs.readFileSync('supabase/rpcs/record_private_group_survey_event.sql','utf8')
assert.ok(rpc.includes(migration.slice(migration.indexOf('CREATE FUNCTION public.record_private_group_survey_event')).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION')),'rpcs/ definition drifted from the migration')
await db.exec(migration)
async function rec(actor,group,member,token,event='open',detail={}){await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):'']);await db.query('SELECT record_private_group_survey_event($1,$2,$3,$4,$5)',[id(group),id(member),token,event,detail])}
const count=async()=>(await db.query('SELECT count(*)::int n FROM private_group_survey_client_events')).rows[0].n
await rec(1,100,101,null,'open',{ua:'x'})
await rec(null,100,102,tok,'layout',{h:0})
assert.equal(await count(),2)
// 他人・印なし・別グループの印・退出済み・グループ違い
for(const [actor,g,m,t] of [[2,100,101,null],[null,100,102,null],[null,100,102,other],[null,100,104,tok],[null,200,102,tok]]) await assert.rejects(rec(actor,g,m,t),e=>e.code==='42501')
await assert.rejects(rec(1,100,101,null,'delete_all'),e=>e.code==='22023')
await assert.rejects(rec(1,100,101,null,'open',{big:'x'.repeat(5000)}),e=>e.code==='22023')
assert.equal(await count(),2)
// 1日の上限: 300件で黙って止める
await db.query("INSERT INTO private_group_survey_client_events(group_id,member_id,event) SELECT $1,$2,'open' FROM generate_series(1,298)",[id(100),id(101)])
await rec(1,100,101,null); assert.equal(await count(),301); await rec(1,100,101,null); assert.equal(await count(),301)
// 60日より古い記録は書き込み時に消す
await db.query("UPDATE private_group_survey_client_events SET created_at=now()-interval '61 days' WHERE member_id=$1",[id(101)])
await rec(null,100,102,tok); assert.equal(await count(),2)
assert.equal((await db.query("SELECT has_table_privilege('anon','private_group_survey_client_events','SELECT') a")).rows[0].a,false)
assert.equal((await db.query("SELECT has_table_privilege('authenticated','private_group_survey_client_events','SELECT') a")).rows[0].a,false)
assert.equal((await db.query("SELECT relrowsecurity r FROM pg_class WHERE relname='private_group_survey_client_events'")).rows[0].r,true)
assert.equal((await db.query("SELECT has_function_privilege('anon','record_private_group_survey_event(uuid,uuid,text,text,jsonb)','EXECUTE') a")).rows[0].a,true)
await db.exec(rollback); assert.equal((await db.query("SELECT to_regclass('private_group_survey_client_events') r")).rows[0].r,null)
await db.exec(migration); await rec(1,100,101,null); assert.equal(await count(),1)
await db.close(); console.log('PASS survey client events: member/guest token only; foreign/no token/declined denied; kinds/size limits; daily cap; 60-day cleanup; not readable from screens; rpcs source matches; rollback/reapply.')

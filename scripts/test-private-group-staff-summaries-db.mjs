// 貸切予約管理の一覧用の読み込み（#835）: 閲覧できる人・返す項目・件数上限・正規ソースとの一致・rollback
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE users(id uuid PRIMARY KEY,role text,organization_id uuid);
CREATE TABLE staff(user_id uuid,organization_id uuid,status text);
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid,invite_code text);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,status text);
CREATE TABLE private_group_candidate_dates(id uuid PRIMARY KEY,group_id uuid,date date,time_slot text,start_time text,end_time text,order_num int,status text,withdrawn_at timestamptz);`)
// 1:お客様 3:組織10のスタッフ 4:組織20のスタッフ 5:組織10の退職スタッフ 6:組織10の管理者 7:ライセンス管理者
for(const [n,role,org] of [[1,'customer',null],[3,'staff',10],[4,'staff',20],[5,'staff',10],[6,'admin',10],[7,'license_admin',20]]) await db.query('INSERT INTO users VALUES($1,$2,$3)',[id(n),role,org?id(org):null])
for(const [u,o,status] of [[3,10,'active'],[4,20,'active'],[5,10,'resigned'],[6,10,'active']]) await db.query('INSERT INTO staff VALUES($1,$2,$3)',[id(u),id(o),status])
await db.query('INSERT INTO private_groups VALUES($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)',[id(100),id(10),id(500),'AAA',id(101),id(10),null,'BBB',id(200),id(20),id(501),'CCC'])
for(const [n,g,status] of [[1,100,'joined'],[2,100,'joined'],[3,100,'declined'],[4,101,'pending'],[5,200,'joined']]) await db.query('INSERT INTO private_group_members VALUES($1,$2,$3)',[id(n),id(g),status])
for(const [n,g,date,order] of [[11,100,'2026-11-02',2],[12,100,'2026-11-01',1],[13,200,'2026-11-03',1]]) await db.query("INSERT INTO private_group_candidate_dates(id,group_id,date,time_slot,start_time,end_time,order_num,status) VALUES($1,$2,$3,'午後','13:00','16:00',$4,'pending')",[id(n),id(g),date,order])
const migration=fs.readFileSync('supabase/migrations/20261005100000_private_group_staff_booking_summaries.sql','utf8')
const rollback=fs.readFileSync('supabase/rollbacks/20261005100000_private_group_staff_booking_summaries.sql','utf8')
const latest=fs.readFileSync('supabase/migrations/20261008030000_private_group_withdrawn_staff_summaries.sql','utf8')
const latestRollback=fs.readFileSync('supabase/rollbacks/20261008030000_private_group_withdrawn_staff_summaries.sql','utf8')
const rpc=fs.readFileSync('supabase/rpcs/private_group_read.sql','utf8')
assert.ok(rpc.includes(latest.slice(latest.indexOf('CREATE OR REPLACE FUNCTION'))),'rpcs/ definition drifted from the migration')
await db.exec(migration);await db.exec(latest)
await db.query("INSERT INTO private_group_candidate_dates VALUES($1,$2,'2026-11-04','午後','13:00','16:00',3,'rejected',now())",[id(14),id(100)])
async function read(actor,org=10,groups=[100,101,200]){
  await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):''])
  return (await db.query('SELECT private_group_read_staff_booking_summaries($1,$2::uuid[]) AS r',[org?id(org):null,groups.map(id)])).rows[0].r
}
for(const actor of [3,6,7]){
  const rows=await read(actor)
  // 他組織のグループ（200）は指定しても返さない
  assert.deepEqual(rows.map(r=>r.id),[id(100),id(101)])
  assert.deepEqual(rows[0],{id:id(100),scenario_master_id:id(500),invite_code:'AAA',joined_member_count:2,candidate_dates:[
    {group_id:id(100),date:'2026-11-01',time_slot:'午後',start_time:'13:00',end_time:'16:00',status:'pending'},
    {group_id:id(100),date:'2026-11-02',time_slot:'午後',start_time:'13:00',end_time:'16:00',status:'pending'}]})
  assert.deepEqual(rows[1],{id:id(101),scenario_master_id:null,invite_code:'BBB',joined_member_count:0,candidate_dates:[]})
}
for(const actor of [null,1,4,5,999]) await assert.rejects(read(actor),e=>e.code==='42501')
await assert.rejects(read(6,null),e=>e.code==='22023')
await assert.rejects(read(6,10,Array.from({length:1001},(_,i)=>1000+i)),e=>e.code==='22023')
assert.equal((await db.query("SELECT has_function_privilege('anon','private_group_read_staff_booking_summaries(uuid,uuid[])','EXECUTE') AS a")).rows[0].a,false)
assert.equal((await db.query("SELECT has_function_privilege('authenticated','private_group_read_staff_booking_summaries(uuid,uuid[])','EXECUTE') AS a")).rows[0].a,true)
await db.exec(latestRollback);assert.equal((await read(6))[0].candidate_dates.length,3)
await db.exec(latest);assert.equal((await read(6))[0].candidate_dates.length,2)
await db.exec(rollback)
assert.equal((await db.query("SELECT count(*)::int n FROM pg_proc WHERE proname='private_group_read_staff_booking_summaries'")).rows[0].n,0)
await db.exec(migration);await db.exec(latest);assert.equal((await read(6)).length,2)
await db.close();console.log('PASS private group staff summaries: staff/admin/license read own org only; customer/foreign/retired/unknown/NULL denied; limits; rpcs source matches; rollback/reapply.')

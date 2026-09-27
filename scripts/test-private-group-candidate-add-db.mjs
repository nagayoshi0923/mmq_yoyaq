import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const fixtureSql = []
const rawExec = db.exec.bind(db)
const rawQuery = db.query.bind(db)
const sqlLiteral = value => value == null ? 'NULL' : Array.isArray(value) ? `ARRAY[${value.map(sqlLiteral).join(',')}]::uuid[]` : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`
db.exec = async sql => { fixtureSql.push(sql); return rawExec(sql) }
db.query = async (sql, params = []) => {
 fixtureSql.push(sql.replace(/\$(\d+)/g, (_, n) => sqlLiteral(params[Number(n)-1])) + ';')
 return rawQuery(sql, params)
}
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE users(id uuid,role text,organization_id uuid);
CREATE TABLE staff(user_id uuid,status text);
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,organizer_id uuid,scenario_master_id uuid,scenario_id uuid,status text,reservation_id uuid,preferred_store_ids uuid[]);
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,status text);
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,status text);
CREATE TABLE organization_scenarios_with_master(id uuid,organization_id uuid,scenario_master_id uuid,duration integer,weekend_duration integer,available_stores text[],private_booking_time_slots text[],title text);
CREATE TABLE organization_settings(organization_id uuid,custom_holidays jsonb);
CREATE TABLE stores(id uuid PRIMARY KEY,organization_id uuid,status text,ownership_type text,is_temporary boolean);
CREATE TABLE business_hours_settings(store_id uuid,organization_id uuid,opening_hours jsonb,holidays text[],special_closed_days jsonb,special_open_days jsonb);
CREATE TABLE private_group_candidate_dates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,date date,time_slot text CHECK(time_slot IN ('午前','午後','夜間')),start_time text,end_time text,order_num integer,status text DEFAULT 'active');
CREATE TABLE private_group_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid,member_id uuid,message text);
CREATE TABLE schedule_blocked_slots(organization_id uuid,store_id text,date date,time_slot text);
CREATE TABLE schedule_events(id uuid,organization_id uuid,store_id uuid,date date,start_time time,end_time time,is_cancelled boolean);
CREATE TABLE organizations(id uuid,slug text);
CREATE TABLE global_settings(organization_id uuid,private_booking_deadline_days integer);
CREATE TABLE organization_scenarios(id uuid,organization_id uuid,scenario_master_id uuid,private_booking_deadline_days integer,org_status text,extra_preparation_time integer);
CREATE TABLE scenarios(id uuid,organization_id uuid,scenario_master_id uuid);
CREATE TABLE email_settings(id uuid,organization_id uuid,store_id uuid);
CREATE TABLE reservation_settings(organization_id uuid,store_id uuid);
CREATE TABLE performance_schedule_settings(organization_id uuid,store_id uuid,default_duration integer);
CREATE TABLE operating_setting_overrides(organization_id uuid,store_id uuid,organization_scenario_id uuid,schedule_event_id uuid,settings jsonb);
ALTER TABLE schedule_events ADD COLUMN organization_scenario_id uuid,ADD COLUMN scenario_master_id uuid,ADD COLUMN scenario_id uuid;`)
for (const file of ['get_effective_private_booking_deadline_days','get_operating_setting_default','resolve_operating_setting','resolve_preparation_minutes']) {
 await db.exec(fs.readFileSync(`supabase/rpcs/${file}.sql`,'utf8'))
}
const deadline=fs.readFileSync('supabase/migrations/20260924181000_enforce_private_booking_deadline.sql','utf8')
await db.exec(deadline.slice(0,deadline.indexOf('CREATE OR REPLACE FUNCTION public.enforce_private_reservation_deadline')))
const holiday=fs.readFileSync('supabase/rpcs/calculate_booking_participation_fee.sql','utf8')
await db.exec(holiday.slice(0,holiday.indexOf('CREATE OR REPLACE FUNCTION public.calculate_booking_participation_fee')))
await db.query('INSERT INTO organizations VALUES($1,\'fixture\')',[id(10)])
await db.query('INSERT INTO global_settings VALUES($1,7)',[id(10)])
await db.query("INSERT INTO organization_scenarios VALUES($1,$2,$3,NULL,'available',NULL)",[id(21),id(10),id(20)])
const role = fs.readFileSync('supabase/migrations/20260927006100_private_group_write_boundary.sql','utf8')
await db.exec(role.slice(role.indexOf('CREATE FUNCTION public.private_group_actor_role'),role.indexOf('CREATE FUNCTION public.require_private_group_manager')))
const migration = fs.readFileSync('supabase/migrations/20260927048000_private_group_candidate_add_atomic.sql','utf8')
await db.exec(migration)
await db.exec(fs.readFileSync('supabase/migrations/20260927048100_private_candidate_weekday_slots.sql','utf8'))
await db.query("INSERT INTO private_groups VALUES($1,$2,$3,$4,NULL,'gathering',NULL,$5)",[id(100),id(10),id(1),id(20),[id(30)]])
await db.query("INSERT INTO organization_scenarios_with_master VALUES($1,$2,$3,180,240,'{}','{}','fixture')",[id(21),id(10),id(20)])
await db.query("INSERT INTO stores VALUES($1,$2,'active','direct',false)",[id(30),id(10)])
for(const [actor,org,status] of [[2,10,'active'],[3,99,'active'],[4,10,'resigned']]){
 await db.query("INSERT INTO users VALUES($1,'staff',$2)",[id(actor),id(org)])
 await db.query('INSERT INTO staff VALUES($1,$2)',[id(actor),status])
}
if (process.argv.includes('--export-fixture')) {
 const destination = process.argv[process.argv.indexOf('--export-fixture') + 1]
 fs.writeFileSync(destination, fixtureSql.join('\n'))
 await db.close()
 process.exit(0)
}
const base = {date:'2030-01-08',time_slot:'afternoon',start_time:'13:00',end_time:'16:00'}
let request=1000
async function add(actor=1,candidates=[base],options={}){
 await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):''])
 return (await db.query('SELECT private_group_add_candidate_dates($1,$2,$3,$4,$5) AS result',[id(100),id(options.request??++request),id(options.scenario??20),options.stores??[id(30)],JSON.stringify(candidates)])).rows[0].result
}
async function rollback(run){await db.exec('BEGIN');try{await run()}finally{await db.exec('ROLLBACK')}}
const counts=async()=> (await db.query('SELECT (SELECT count(*) FROM private_group_candidate_dates)::int AS candidates,(SELECT count(*) FROM private_group_messages)::int AS messages,(SELECT count(*) FROM private_group_candidate_add_requests)::int AS receipts')).rows[0]
// 平日の午前/午後は、同じ店舗の夕方開始と準備時間から決める。
await assert.rejects(add(1,[{...base,time_slot:'morning',start_time:'10:00',end_time:'13:00'}]),e=>e.code==='22023')
await rollback(async()=>{
 await db.exec('UPDATE organization_scenarios_with_master SET duration=360')
 await assert.rejects(add(1,[{...base,end_time:'19:00'}]),e=>e.code==='22023')
})
await rollback(async()=>{
 await db.exec('UPDATE organization_scenarios_with_master SET duration=360')
 assert.equal((await add(1,[{...base,time_slot:'morning',start_time:'10:00',end_time:'16:00'}])).success,true)
})
await rollback(async()=>{
 await db.exec('UPDATE organization_scenarios_with_master SET duration=360')
 await db.query("INSERT INTO operating_setting_overrides VALUES($1,NULL,$2,NULL,'{\"preparation_minutes\":0}')",[id(10),id(21)])
 assert.equal((await add(1,[{...base,end_time:'19:00'}])).success,true)
})
await rollback(async()=>{
 await db.query('INSERT INTO business_hours_settings VALUES($1,$2,$3,NULL,NULL,NULL)',[id(30),id(10),JSON.stringify({tuesday:{is_open:true,slot_start_times:{morning:'10:00',afternoon:'15:00',evening:'18:00'}}})])
 await assert.rejects(add(1,[{...base,start_time:'15:00',end_time:'18:00'}]),e=>e.code==='22023')
})
await rollback(async()=>{
 await db.query("INSERT INTO stores VALUES($1,$2,'active','direct',false)",[id(31),id(10)])
 await db.query('UPDATE private_groups SET preferred_store_ids=$1',[[id(30),id(31)]])
 for(const store of [30,31]) await db.query('INSERT INTO business_hours_settings VALUES($1,$2,$3,NULL,NULL,NULL)',[id(store),id(10),JSON.stringify({tuesday:{is_open:true,open_time:'10:00',close_time:'23:00',slot_start_times:{morning:'10:00',afternoon:store===30?'15:00':'13:00',evening:store===30?'18:00':'19:00'}}})])
 const result = await add(1,[{...base,time_slot:'morning',start_time:'10:00',end_time:'13:00'},base],{stores:[id(30),id(31)]})
 assert.equal(result.candidate_ids.length,2)
})
for(const actor of [null,3,4,999])await assert.rejects(add(actor),e=>e.code==='42501')
for(const state of ['booking_requested','confirmed','cancelled'])await rollback(async()=>{
 await db.query('UPDATE private_groups SET status=$1',[state]); await assert.rejects(add(),e=>e.code==='22023')
})
await assert.rejects(add(1,[]),e=>e.code==='22023')
await assert.rejects(add(1,[base],{stores:[id(31)]}),e=>e.code==='40001')
await assert.rejects(add(1,[base],{scenario:22}),e=>e.code==='40001')
await assert.rejects(add(1,[{...base,date:'2000-01-01'}]),e=>e.code==='P0045')
await assert.rejects(add(1,[{...base,end_time:'17:00'}]),e=>e.code==='40001')
await assert.rejects(add(1,[base,base]),e=>e.code==='23505')
assert.deepEqual(await counts(),{candidates:0,messages:0,receipts:0})
await rollback(async()=>{
 await db.query('INSERT INTO reservations VALUES($1,$2,\'pending\')',[id(50),id(10)])
 await db.query('UPDATE private_groups SET reservation_id=$1',[id(50)])
 await assert.rejects(add(),e=>e.code==='22023')
})
await rollback(async()=>{
 await db.query("INSERT INTO schedule_blocked_slots VALUES($1,$2,'2030-01-08','afternoon')",[id(10),id(30)])
 await assert.rejects(add(),e=>e.code==='22023')
})
await rollback(async()=>{
 await db.query("INSERT INTO schedule_events(id,organization_id,store_id,date,start_time,end_time,is_cancelled) VALUES($1,$2,$3,'2030-01-08','16:30','19:00',false)",[id(60),id(10),id(30)])

 await assert.rejects(add(),e=>e.code==='22023')
})
await rollback(async()=>{
 await db.query("INSERT INTO business_hours_settings VALUES($1,$2,$3,NULL,NULL,NULL)",[id(30),id(10),JSON.stringify({tuesday:{is_open:false}})])
 await assert.rejects(add(),e=>e.code==='22023')
})
// 組織共通7日を継承。シナリオの0は当日可として保持する。
const today = (await db.query("SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date)::text AS d")).rows[0].d
await rollback(async()=>{
 await db.exec('UPDATE organization_scenarios_with_master SET weekend_duration=NULL')
 await assert.rejects(add(1,[{...base,date:today,time_slot:'evening',start_time:'19:00',end_time:'22:00'}]),e=>e.code==='P0045')
})
await rollback(async()=>{
 await db.exec('UPDATE organization_scenarios SET private_booking_deadline_days=0; UPDATE organization_scenarios_with_master SET weekend_duration=NULL')
 assert.equal((await add(1,[{...base,date:today,time_slot:'evening',start_time:'19:00',end_time:'22:00'}])).success,true)
})
// 土曜日・祝日・組織独自休日は4時間を使い、古い3時間表示は拒否。
for(const date of ['2030-01-05','2030-01-01'])await rollback(async()=>{
 assert.equal((await add(1,[{...base,date,start_time:'14:00',end_time:'18:00'}])).success,true)
})
await rollback(async()=>{
 await db.query('INSERT INTO organization_settings VALUES($1,$2)',[id(10),JSON.stringify([base.date])])
 await assert.rejects(add(),e=>e.code==='40001')
})
await rollback(async()=>{
 await db.query('INSERT INTO organization_settings VALUES($1,$2)',[id(10),JSON.stringify([base.date])])
 assert.equal((await add(1,[{...base,start_time:'14:00',end_time:'18:00'}])).success,true)
})
// 取消済予約だけは候補追加を再開できる。
await rollback(async()=>{
 await db.query("INSERT INTO reservations VALUES($1,$2,'cancelled')",[id(50),id(10)])
 await db.query('UPDATE private_groups SET reservation_id=$1',[id(50)])
 assert.equal((await add()).success,true)
})
// 公演単位の準備時間0で、既定60分では拒否する隙間も使用できる。
await rollback(async()=>{
 await db.query("INSERT INTO schedule_events(id,organization_id,store_id,date,start_time,end_time,is_cancelled) VALUES($1,$2,$3,'2030-01-08','16:30','19:00',false)",[id(60),id(10),id(30)])
 await db.query("INSERT INTO operating_setting_overrides VALUES($1,NULL,NULL,$2,'{\"preparation_minutes\":0}')",[id(10),id(60)])
 assert.equal((await add()).success,true)
})
// 前日跨ぎの公演と今回作品側の準備時間。
await rollback(async()=>{
 await db.query("INSERT INTO schedule_events(id,organization_id,store_id,date,start_time,end_time,is_cancelled) VALUES($1,$2,$3,'2030-01-07','23:00','12:30',false)",[id(60),id(10),id(30)])
 await assert.rejects(add(),e=>e.code==='22023')
})
await rollback(async()=>{
 await db.query("INSERT INTO schedule_events(id,organization_id,store_id,date,start_time,end_time,is_cancelled) VALUES($1,$2,$3,'2030-01-07','23:00','12:30',false)",[id(60),id(10),id(30)])
 await db.query("INSERT INTO operating_setting_overrides VALUES($1,NULL,$2,NULL,'{\"preparation_minutes\":0}')",[id(10),id(21)])
 assert.equal((await add()).success,true)
})
await rollback(async()=>{
 await db.exec("UPDATE organization_scenarios_with_master SET private_booking_time_slots=ARRAY['夜公演']")
 await assert.rejects(add(),e=>e.code==='22023')
})
// 希望店の1つが休業でも別店舗に営業枠と空きの両方があれば可。
await rollback(async()=>{
 await db.query("INSERT INTO stores VALUES($1,$2,'active','direct',false)",[id(31),id(10)])
 await db.query('UPDATE private_groups SET preferred_store_ids=$1',[[id(30),id(31)]])
 for(const store of [30,31])await db.query('INSERT INTO business_hours_settings VALUES($1,$2,$3,NULL,NULL,NULL)',[id(store),id(10),JSON.stringify({tuesday:{is_open:store===31}})])
 assert.equal((await add(1,[base],{stores:[id(31),id(30)]})).success,true)
})
// 営業枠は店A、空きは店B、という混ぜ合わせは不可。
await rollback(async()=>{
 await db.query("INSERT INTO stores VALUES($1,$2,'active','direct',false)",[id(31),id(10)])
 await db.query('UPDATE private_groups SET preferred_store_ids=$1',[[id(30),id(31)]])
 for(const store of [30,31])await db.query('INSERT INTO business_hours_settings VALUES($1,$2,$3,NULL,NULL,NULL)',[id(store),id(10),JSON.stringify({tuesday:{is_open:store===30}})])
 await db.query("INSERT INTO schedule_events(id,organization_id,store_id,date,start_time,end_time,is_cancelled) VALUES($1,$2,$3,'2030-01-08','13:00','16:00',false)",[id(60),id(10),id(30)])
 await assert.rejects(add(1,[base],{stores:[id(30),id(31)]}),e=>e.code==='22023')
})
await db.exec(`CREATE FUNCTION fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'notice failure';END$$;
CREATE TRIGGER fail_notice BEFORE INSERT ON private_group_messages FOR EACH ROW EXECUTE FUNCTION fail_notice();`)
await assert.rejects(add(),/notice failure/)
assert.deepEqual(await counts(),{candidates:0,messages:0,receipts:0})
await db.exec('DROP TRIGGER fail_notice ON private_group_messages')
const first=await add(1,[base],{request:2000})
assert.equal(first.success,true);assert.equal(first.replayed,false)
assert.deepEqual(await counts(),{candidates:1,messages:1,receipts:1})
const retry=await add(1,[base],{request:2000})
assert.equal(retry.replayed,true);assert.deepEqual(retry.candidate_ids,first.candidate_ids)
await assert.rejects(add(1,[{...base,date:'2030-01-09'}],{request:2000}),e=>e.code==='22023')
await assert.rejects(add(2,[base],{request:2000}),e=>e.code==='22023')
await assert.rejects(add(),e=>e.code==='23505')
await db.exec("UPDATE private_groups SET status='confirmed'")
assert.equal((await add(1,[base],{request:2000})).replayed,true)
await db.exec("UPDATE private_groups SET status='gathering'")
await add(2,[{...base,date:'2030-01-09'}])
assert.deepEqual((await db.query('SELECT order_num FROM private_group_candidate_dates ORDER BY order_num')).rows.map(x=>x.order_num),[1,2])
assert.deepEqual(await counts(),{candidates:2,messages:2,receipts:2})
await db.exec('SET ROLE authenticated')
await assert.rejects(db.query('SELECT * FROM private_group_candidate_add_requests'),e=>e.code==='42501')
await db.exec('RESET ROLE')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927048100_private_candidate_weekday_slots.sql','utf8'))
assert.deepEqual(await counts(),{candidates:2,messages:2,receipts:2})
await rollback(async()=>{
 assert.equal((await add(1,[{...base,date:'2030-01-10',time_slot:'morning',start_time:'10:00',end_time:'13:00'}])).success,true)
})
await db.exec(fs.readFileSync('supabase/migrations/20260927048100_private_candidate_weekday_slots.sql','utf8'))
await assert.rejects(add(1,[{...base,date:'2030-01-10',time_slot:'morning',start_time:'10:00',end_time:'13:00'}]),e=>e.code==='22023')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927048000_private_group_candidate_add_atomic.sql','utf8'))
assert.deepEqual(await counts(),{candidates:2,messages:2,receipts:2})
await db.exec(migration)
await db.exec(fs.readFileSync('supabase/migrations/20260927048100_private_candidate_weekday_slots.sql','utf8'))
assert.equal((await add(1,[base],{request:2000})).replayed,true)
await db.close()
console.log('候補追加DB: 認可、状態、締切、営業時間、準備時間、重複、通知失敗rollback、再送、順序 PASS（実際の締切継承・祝日・準備時間resolver・候補日trigger使用）')

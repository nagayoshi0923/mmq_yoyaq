import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const sql = fs.readFileSync('supabase/rpcs/get_org_customers_with_stats_v2.sql','utf8')
const fields = sql.match(/RETURNS TABLE\((.*?)\)\n/s)[1].split(', reservation_count')[0]
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE customers(${fields});
 CREATE TABLE reservations(id uuid,customer_id uuid,organization_id uuid,total_price int,final_price int,discount_amount int,requested_datetime timestamptz,status text,coupon_usage_id uuid);
 CREATE TABLE private_groups(id uuid,organization_id uuid); CREATE TABLE private_group_members(group_id uuid,user_id uuid);
 CREATE TABLE coupon_campaigns(id uuid,organization_id uuid); CREATE TABLE coupon_usages(customer_coupon_id uuid,reservation_id uuid,id uuid,discount_amount int);
 CREATE TABLE customer_coupons(id uuid,campaign_id uuid,customer_id uuid,organization_id uuid,status text,uses_remaining int,expires_at timestamptz,rules_snapshot jsonb);`)
await db.exec(fs.readFileSync('supabase/rpcs/get_org_customers.sql','utf8'))
await db.exec(sql)
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
for(let n=1;n<=6;n++) await db.query('INSERT INTO customers(id,organization_id,name,created_at) VALUES($1,$2,$3,now())',[id(n),id(n===6?20:10),String(n)])
for(const [n,c,org,total,final,discount,status] of [
 [101,1,10,1000,800,200,'confirmed'],[102,1,10,2000,1700,300,'completed'],
 [103,1,10,9999,9999,0,'cancelled'],[104,1,20,8888,8888,0,'completed'],
 [105,2,10,1000,0,1000,'gm_confirmed'],[106,3,10,1000,0,0,'confirmed'],
 [107,4,10,1000,null,0,'confirmed'],[108,6,10,500,500,0,'completed'],
]) await db.query('INSERT INTO reservations(id,customer_id,organization_id,total_price,final_price,discount_amount,requested_datetime,status) VALUES($1,$2,$3,$4,$5,$6,now(),$7)',[id(n),id(c),id(org),total,final,discount,status])

await db.exec(fs.readFileSync('supabase/rpcs/search_org_customers.sql','utf8'))
for(let i=0;i<60;i++) {
 await db.query('INSERT INTO customers(id,organization_id,name,created_at) VALUES($1,$2,$3,$4)',[id(1000+i),id(10),'search-'+String(i).padStart(2,'0'),'2026-09-01T00:00:00Z'])
 await db.query("INSERT INTO reservations(id,customer_id,organization_id,total_price,final_price,discount_amount,requested_datetime,status) VALUES($1,$2,$3,$4,$4,0,$5,'completed')",[id(2000+i),id(1000+i),id(10),i*100,i===59?'2026-09-26T15:00:00Z':'2026-09-27T15:00:00Z'])
}
const search=async(sort='reservation_amount',dir='desc',offset=0,minAmount=null,from=null,to=null,text='search-')=>(await db.query('SELECT search_org_customers($1,$2,10,$3,$4,$5,NULL,NULL,$6,NULL,$7,$8) result',[id(10),text,offset,sort,dir,minAmount,from,to])).rows[0].result
let r=await search()
assert.equal(r.totalCount,60)
assert.deepEqual(r.customers.map(c=>c.reservation_amount),[5900,5800,5700,5600,5500,5400,5300,5200,5100,5000])
r=await search('reservation_amount','desc',10)
assert.equal(r.customers[0].reservation_amount,4900,'sorting happens before pagination')
r=await search('reservation_amount','asc',0,5500)
assert.equal(r.totalCount,5);assert.equal(r.customers[0].reservation_amount,5500)
r=await search('reservation_amount','desc',100)
assert.equal(r.totalCount,60);assert.deepEqual(r.customers,[],'empty page retains true filtered total')
await db.query("INSERT INTO reservations(id,customer_id,organization_id,total_price,final_price,discount_amount,requested_datetime,status) VALUES($1,$2,$3,500,500,0,'2030-01-01','confirmed')",[id(4000),id(1059),id(10)])
r=await search('name','asc',0,null,'2026-09-27','2026-09-27')
assert.equal(r.totalCount,1);assert.equal(r.customers[0].name,'search-59','inclusive JST date range, not UTC')
r=await search('name','asc',0,null,null,null,'%')
assert.equal(r.totalCount,0,'search wildcard is literal')
r=await search('reservation_amount','desc',0,null,null,null,null)
assert.ok(r.customers.every(c=>c.reservation_amount!==null),'unknown amounts sort after known values')
await db.query('INSERT INTO coupon_campaigns VALUES($1,$2)',[id(3000),id(10)])
await db.query("INSERT INTO customer_coupons(id,campaign_id,customer_id,organization_id,status,uses_remaining) VALUES($1,$2,$3,$4,'active',2)",[id(3001),id(3000),id(1000),id(10)])
const filtered=async(minReservations,minVisits,coupons)=>(await db.query("SELECT search_org_customers($1,NULL,100,0,'created_at','desc',$2,$3,NULL,$4,NULL,NULL) result",[id(10),minReservations,minVisits,coupons])).rows[0].result
r=await filtered(2,null,null);assert.equal(r.totalCount,2);assert.ok(r.customers.every(c=>[id(1),id(1059)].includes(c.id)))
r=await filtered(null,1,null);assert.equal(r.totalCount,62);assert.ok(r.customers.every(c=>c.visit_count>=1))
r=await filtered(null,null,true);assert.equal(r.totalCount,1);assert.equal(r.customers[0].id,id(1000))
r=await filtered(null,null,false);assert.equal(r.totalCount,65);assert.ok(r.customers.every(c=>c.remaining_coupons===0))
for(const key of ['name','email','phone','reservation_count','remaining_coupons','visit_count','reservation_amount','last_visit']) {
 for(const dir of ['asc','desc']) {
  r=await search(key,dir,0,null,null,null,null)
  let nullSeen=false
  for(let i=0;i<r.customers.length;i++) {
   const v=r.customers[i][key]
   if(v===null) nullSeen=true
   else { assert.equal(nullSeen,false,'NULLS LAST in both directions');if(i && r.customers[i-1][key]!==null) assert.ok(dir==='asc'?r.customers[i-1][key]<=v:r.customers[i-1][key]>=v,`${key} ${dir}`) }
  }
 }
}
for(const role of ['anon','authenticated']) assert.equal((await db.query("SELECT has_function_privilege($1,'search_org_customers(uuid,text,integer,integer,text,text,integer,integer,bigint,boolean,date,date)','EXECUTE') ok",[role])).rows[0].ok,false)
await db.exec(fs.readFileSync('supabase/rollbacks/20260927150000_customer_search.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rpcs/search_org_customers.sql','utf8'))
assert.equal((await search()).totalCount,60)
await db.exec(fs.readFileSync('supabase/rollbacks/20260927150100_customer_last_visit.sql','utf8'))
assert.equal((await search('name','asc',0,null,'2026-09-27','2026-09-27')).totalCount,0)
await db.exec(fs.readFileSync('supabase/migrations/20260927150100_customer_last_visit.sql','utf8'))
assert.equal((await search('name','asc',0,null,'2026-09-27','2026-09-27')).totalCount,1)
await db.close()
console.log('PASS customer search: all-page sort, filters/count, empty page, JST bounds, literal search, unknown amount, tenant and ACL')

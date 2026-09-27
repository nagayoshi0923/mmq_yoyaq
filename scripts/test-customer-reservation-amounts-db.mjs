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
const rows=(await db.query('SELECT id,total_paid,reservation_amount FROM get_org_customers_with_stats_v2($1)',[id(10)])).rows
const value=n=>rows.find(r=>r.id===id(n))
assert.equal(Number(value(1).reservation_amount),2500,'discounted value excludes cancelled/foreign bookings')
assert.equal(Number(value(1).total_paid),3000,'old clients retain their previous projection')
assert.equal(Number(value(2).reservation_amount),0,'documented full discount is a real zero')
assert.equal(value(3).reservation_amount,null,'legacy zero cannot silently become free')
assert.equal(value(4).reservation_amount,null,'missing final amount is not inferred')
assert.equal(Number(value(5).reservation_amount),0,'no qualifying reservations is a known zero')
assert.equal(Number(value(6).reservation_amount),500,'customer affiliation does not hide another organization visit')
// The booking-time 200 discount is already represented by final_price=800.
await db.query('INSERT INTO customer_coupons(id,organization_id) VALUES($1,$2),($3,$4)',[id(201),id(10),id(202),id(20)])
await db.query('INSERT INTO coupon_usages VALUES($1,$2,$3,200),($1,$2,$4,100),($5,$2,$6,900)',[id(201),id(101),id(301),id(302),id(202),id(303)])
await db.query('UPDATE reservations SET coupon_usage_id=$1 WHERE id=$2',[id(301),id(101)])
const amount=async()=>Number((await db.query('SELECT reservation_amount FROM get_org_customers_with_stats_v2($1) WHERE id=$2',[id(10),id(1)])).rows[0].reservation_amount)
assert.equal(await amount(),2400,'later usage is deducted once; booking usage and foreign usages are excluded')
await db.query('INSERT INTO coupon_usages VALUES($1,$2,$3,700)',[id(201),id(101),id(304)])
assert.equal(await amount(),1700,'post-booking discounts can make one reservation exactly zero')
await db.query('DELETE FROM coupon_usages WHERE id=$1',[id(304)])
assert.equal(await amount(),2400,'reverted post-booking usage is no longer deducted')
await db.query('INSERT INTO coupon_usages VALUES($1,$2,$3,900)',[id(201),id(101),id(304)])
assert.equal((await db.query('SELECT reservation_amount FROM get_org_customers_with_stats_v2($1) WHERE id=$2',[id(10),id(1)])).rows[0].reservation_amount,null,'over-discounted records require confirmation')
await db.query('DELETE FROM coupon_usages WHERE id=$1',[id(304)])
await db.query('INSERT INTO reservations(id,customer_id,organization_id,total_price,final_price,discount_amount,requested_datetime,status) VALUES($1,$2,$3,1000,0,0,now(),\'confirmed\')',[id(109),id(1),id(10)])
assert.equal((await db.query('SELECT reservation_amount FROM get_org_customers_with_stats_v2($1) WHERE id=$2',[id(10),id(1)])).rows[0].reservation_amount,null,'an incomplete subtotal is never shown as complete')
for(const role of ['anon','authenticated']) assert.equal((await db.query("SELECT has_function_privilege($1,'get_org_customers_with_stats_v2(uuid,text,integer,integer)','EXECUTE') AS ok",[role])).rows[0].ok,false)
await db.exec(fs.readFileSync('supabase/rollbacks/20260927140000_customer_reservation_amounts.sql','utf8'))
await db.exec(sql)
assert.equal((await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n,9)
await db.close()
console.log('PASS customer amounts: discounts, genuine zero, ambiguous legacy/null, no partial totals, cancelled/foreign exclusion, cross-org visits, ACL and rollback')

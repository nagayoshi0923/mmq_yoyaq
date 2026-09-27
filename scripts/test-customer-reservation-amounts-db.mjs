import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const sql = fs.readFileSync('supabase/rpcs/get_org_customers_with_stats_v2.sql','utf8')
const fields = sql.match(/RETURNS TABLE\((.*?)\)\n/s)[1].split(', reservation_count')[0]
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE customers(${fields});
 CREATE TABLE reservations(id uuid,customer_id uuid,organization_id uuid,total_price int,final_price int,discount_amount int,requested_datetime timestamptz,status text);
 CREATE TABLE private_groups(id uuid,organization_id uuid); CREATE TABLE private_group_members(group_id uuid,user_id uuid);
 CREATE TABLE coupon_campaigns(id uuid,organization_id uuid); CREATE TABLE coupon_usages(customer_coupon_id uuid,reservation_id uuid,discount_amount int);
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
]) await db.query('INSERT INTO reservations VALUES($1,$2,$3,$4,$5,$6,now(),$7)',[id(n),id(c),id(org),total,final,discount,status])
// booking-time coupons already reflected in final_price/discount_amount
await db.query('INSERT INTO coupon_usages(customer_coupon_id,reservation_id,discount_amount) VALUES($1,$2,$3)',[id(1),id(101),200])
await db.query('INSERT INTO coupon_usages(customer_coupon_id,reservation_id,discount_amount) VALUES($1,$2,$3)',[id(2),id(102),300])
const rows=(await db.query('SELECT id,total_paid,reservation_amount FROM get_org_customers_with_stats_v2($1)',[id(10)])).rows
const value=n=>rows.find(r=>r.id===id(n))
assert.equal(Number(value(1).reservation_amount),2500,'discounted value excludes cancelled/foreign bookings')
assert.equal(Number(value(1).total_paid),3000,'old clients retain their previous projection')
assert.equal(Number(value(2).reservation_amount),0,'documented full discount is a real zero')
assert.equal(value(3).reservation_amount,null,'legacy zero cannot silently become free')
assert.equal(value(4).reservation_amount,null,'missing final amount is not inferred')
assert.equal(Number(value(5).reservation_amount),0,'no qualifying reservations is a known zero')
assert.equal(Number(value(6).reservation_amount),500,'customer affiliation does not hide another organization visit')
await db.query('INSERT INTO reservations VALUES($1,$2,$3,1000,0,0,now(),\'confirmed\')',[id(109),id(1),id(10)])
assert.equal((await db.query('SELECT reservation_amount FROM get_org_customers_with_stats_v2($1) WHERE id=$2',[id(10),id(1)])).rows[0].reservation_amount,null,'an incomplete subtotal is never shown as complete')

// post-reservation coupon on a clean booking: final_price stays, coupon_usages adds discount
await db.query('INSERT INTO customers(id,organization_id,name,created_at) VALUES($1,$2,$3,now())',[id(7),id(10),'7'])
await db.query('INSERT INTO reservations VALUES($1,$2,$3,5000,5000,0,now(),\'confirmed\')',[id(110),id(7),id(10)])
assert.equal(Number((await db.query('SELECT reservation_amount FROM get_org_customers_with_stats_v2($1) WHERE id=$2',[id(10),id(7)])).rows[0].reservation_amount),5000,'pre-coupon amount')
await db.query('INSERT INTO coupon_usages(customer_coupon_id,reservation_id,discount_amount) VALUES($1,$2,$3)',[id(3),id(110),1000])
assert.equal(Number((await db.query('SELECT reservation_amount FROM get_org_customers_with_stats_v2($1) WHERE id=$2',[id(10),id(7)])).rows[0].reservation_amount),4000,'post-reservation coupon reduces amount')

// booking-time coupon + post-reservation coupon: only the extra usage is subtracted again
await db.query('INSERT INTO customers(id,organization_id,name,created_at) VALUES($1,$2,$3,now())',[id(8),id(10),'8'])
await db.query('INSERT INTO reservations VALUES($1,$2,$3,5000,4000,1000,now(),\'confirmed\')',[id(111),id(8),id(10)])
await db.query('INSERT INTO coupon_usages(customer_coupon_id,reservation_id,discount_amount) VALUES($1,$2,$3)',[id(4),id(111),1000])
assert.equal(Number((await db.query('SELECT reservation_amount FROM get_org_customers_with_stats_v2($1) WHERE id=$2',[id(10),id(8)])).rows[0].reservation_amount),4000,'booking coupon is not double-counted')
await db.query('INSERT INTO coupon_usages(customer_coupon_id,reservation_id,discount_amount) VALUES($1,$2,$3)',[id(5),id(111),500])
assert.equal(Number((await db.query('SELECT reservation_amount FROM get_org_customers_with_stats_v2($1) WHERE id=$2',[id(10),id(8)])).rows[0].reservation_amount),3500,'only post-reservation extra is deducted')

for(const role of ['anon','authenticated']) assert.equal((await db.query("SELECT has_function_privilege($1,'get_org_customers_with_stats_v2(uuid,text,integer,integer)','EXECUTE') AS ok",[role])).rows[0].ok,false)
await db.exec(fs.readFileSync('supabase/rollbacks/20260927141000_customer_post_reservation_coupon_amounts.sql','utf8'))
assert.equal(Number((await db.query('SELECT reservation_amount FROM get_org_customers_with_stats_v2($1) WHERE id=$2',[id(10),id(7)])).rows[0].reservation_amount),5000,'rollback stops reflecting post-reservation coupons')
await db.exec(sql)
assert.equal(Number((await db.query('SELECT reservation_amount FROM get_org_customers_with_stats_v2($1) WHERE id=$2',[id(10),id(7)])).rows[0].reservation_amount),4000,'reapply restores post-reservation reflection')
assert.equal((await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n,11)
await db.close()
console.log('PASS customer amounts: discounts, post-reservation coupons, no double-count, genuine zero, ambiguous legacy/null, no partial totals, cancelled/foreign exclusion, cross-org visits, ACL and rollback')

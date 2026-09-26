import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const name='20260927023000_customer_contact_scope.sql'
const rollback=fs.readFileSync('supabase/rollbacks/'+name,'utf8')
const migration=fs.readFileSync('supabase/migrations/'+name,'utf8')
const customerFields=rollback.match(/RETURNS TABLE\((.*?)\)\n/s)[1].split(', reservation_count')[0]
await db.exec(`CREATE TABLE customers (${customerFields});
 CREATE TABLE private_groups(id uuid,organization_id uuid);
 CREATE TABLE private_group_members(group_id uuid,user_id uuid);
 CREATE TABLE reservations(id uuid,customer_id uuid,organization_id uuid,total_price integer,requested_datetime timestamptz,status text);
 CREATE TABLE coupon_campaigns(id uuid,organization_id uuid,max_uses_per_customer integer);
 CREATE TABLE customer_coupons(id uuid,campaign_id uuid,customer_id uuid,organization_id uuid,uses_remaining integer,expires_at timestamptz,status text,rules_snapshot jsonb);
 CREATE TABLE coupon_usages(customer_coupon_id uuid,reservation_id uuid);`)

await db.exec(fs.readFileSync('supabase/rpcs/get_org_customers.sql','utf8'))
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
for(const [n,org,user] of [[1,10,null],[2,20,null],[3,null,103],[4,20,null],[5,20,105],[6,null,106]]) {
 await db.query('INSERT INTO customers(id,organization_id,user_id,name,created_at) VALUES($1,$2,$3,$4,now())',[id(n),org?id(org):null,user?id(user):null,'fixture'+n])
}
await db.query("INSERT INTO reservations VALUES($1,$2,$3,1000,now(),'confirmed'),($4,$2,$5,9000,now(),'confirmed')",[id(30),id(2),id(10),id(31),id(20)])
await db.query('INSERT INTO private_groups VALUES($1,$2)',[id(40),id(10)])
for(const user of [103,105]) await db.query('INSERT INTO private_group_members VALUES($1,$2)',[id(40),id(user)])
const visible=async fn=>(await db.query(`SELECT id FROM ${fn}($1) ORDER BY id`,[id(10)])).rows.map(r=>r.id)
await db.exec(rollback)
assert.deepEqual(await visible('get_org_customers_with_stats'),[id(1),id(3)])
await db.exec(migration)
assert.deepEqual(await visible('get_org_customers_with_stats'),await visible('get_org_customers'))
assert.deepEqual(await visible('get_org_customers_with_stats'),[id(1),id(2),id(3),id(5)])
const totals=(await db.query('SELECT total_paid,reservation_count FROM get_org_customers_with_stats($1) WHERE id=$2',[id(10),id(2)])).rows[0]
assert.equal(Number(totals.total_paid),1000);assert.equal(Number(totals.reservation_count),1)
assert.equal((await db.query('SELECT * FROM get_org_customers_with_stats($1,$2)',[id(10),'fixture4'])).rows.length,0)
assert.equal((await db.query('SELECT * FROM get_org_customers_with_stats($1,$2)',[id(10),'fixture2'])).rows.length,1)
assert.equal((await db.query('SELECT * FROM get_org_customers_with_stats($1,$2)',[id(10),'%'])).rows.length,0)
await db.exec(rollback);assert.deepEqual(await visible('get_org_customers_with_stats'),[id(1),id(3)])
await db.exec(migration);assert.deepEqual(await visible('get_org_customers_with_stats'),[id(1),id(2),id(3),id(5)])
await db.close()
console.log('PASS customer contact scope: own, reservation, private member, foreign/no contact, scoped totals, search, rollback/reapply')

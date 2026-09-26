import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const name='20260927019000_customer_coupon_stats.sql'
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
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.query('INSERT INTO customers(id,organization_id,name,created_at) VALUES($1,$2,$3,now())',[id(1),id(10),'fixture'])
await db.query('INSERT INTO reservations VALUES($1,$2,$3,1000,now(),\'completed\'),($4,$2,$5,9999,now(),\'confirmed\')',[id(2),id(1),id(10),id(3),id(20)])
await db.query('INSERT INTO coupon_campaigns VALUES($1,$2,1),($3,$4,999)',[id(30),id(10),id(31),id(20)])
for(const [n,org,camp,status,remaining,expiry,rules] of [
 [40,10,30,'active',3,null,{}],
 [41,10,30,'active',2,'2000-01-01',{}],
 [42,10,30,'revoked',7,null,{}],
 [43,10,30,'fully_used',0,null,{}],
 [44,10,30,'active',5,null,{usage_valid_from:'2999-01-01'}],
 [45,10,30,'active',6,null,{usage_valid_until:'2000-01-01'}],
 [46,20,31,'active',999,null,{}],
 [47,10,31,'active',888,null,{}],
])await db.query('INSERT INTO customer_coupons VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),id(camp),id(1),id(org),remaining,expiry,status,JSON.stringify(rules)])
await db.query('INSERT INTO coupon_usages VALUES($1,$2),($1,$2),($3,$2),($1,$4),($5,$2)',[id(40),id(2),id(43),id(3),id(46)])
await db.exec(rollback)
const result=async()=> (await db.query('SELECT total_coupons,used_coupons,remaining_coupons,total_paid FROM get_org_customers_with_stats($1)',[id(10)])).rows[0]
assert.notEqual(Number((await result()).remaining_coupons),3)
await db.exec(migration)
assert.deepEqual(Object.values(await result()).map(Number),[6,3,3,1000])
await db.exec('BEGIN')
await db.query("UPDATE customer_coupons SET expires_at=now(),rules_snapshot=jsonb_build_object('usage_valid_from',now(),'usage_valid_until',now()) WHERE id=$1",[id(40)])
assert.equal(Number((await result()).remaining_coupons),3)
await db.exec('ROLLBACK')
await db.query('UPDATE coupon_campaigns SET max_uses_per_customer=500 WHERE id=$1',[id(30)])
assert.deepEqual(Object.values(await result()).map(Number),[6,3,3,1000])
await db.exec(rollback)
assert.notEqual(Number((await result()).remaining_coupons),3)
await db.exec(migration)
assert.deepEqual(Object.values(await result()).map(Number),[6,3,3,1000])
await db.close()
console.log('PASS customer coupon stats: tenant, expiry, start, states, real usages, no join inflation, definitions unchanged, rollback/reapply')

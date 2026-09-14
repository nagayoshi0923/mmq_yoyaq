// Isolated PostgreSQL reproduction: no network, customers, or notifications.
import fs from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::UUID';
CREATE FUNCTION get_user_organization_id() RETURNS UUID LANGUAGE SQL AS 'SELECT NULL::UUID';
CREATE FUNCTION is_org_admin() RETURNS BOOLEAN LANGUAGE SQL AS 'SELECT TRUE';
CREATE TABLE staff(user_id UUID, organization_id UUID, status TEXT);
CREATE TABLE organization_settings(organization_id UUID, custom_holidays JSONB);
CREATE TABLE scenario_masters(id UUID PRIMARY KEY, official_duration INT, title TEXT);
CREATE TABLE organization_scenarios(id UUID PRIMARY KEY, scenario_master_id UUID, participation_fee INT, participation_costs JSONB, duration INT, override_title TEXT);
CREATE TABLE schedule_events(id UUID PRIMARY KEY, organization_id UUID, scenario_id UUID, organization_scenario_id UUID, store_id UUID, date DATE, start_time TIME, max_participants INT, capacity INT, is_cancelled BOOLEAN);
CREATE TABLE reservations(id UUID DEFAULT gen_random_uuid(), schedule_event_id UUID, scenario_id UUID, store_id UUID, customer_id UUID, customer_name TEXT, customer_email TEXT, customer_phone TEXT, requested_datetime TIMESTAMP, duration INT, participant_count INT, participant_names TEXT[], base_price INT, options_price INT, total_price INT, discount_amount INT, final_price INT, unit_price INT, payment_method TEXT, payment_status TEXT, status TEXT, customer_notes TEXT, reservation_number TEXT, created_by UUID, organization_id UUID, title TEXT);
`)
const org = '10000000-0000-0000-0000-000000000001'
const scenario = '20000000-0000-0000-0000-000000000001'
const event = '30000000-0000-0000-0000-000000000001'
const costs = [{time_slot:'normal',amount:4500,type:'fixed'}, {time_slot:'weekend',amount:5000,type:'fixed'}, {time_slot:'gmtest',amount:3500,type:'fixed'}]
await db.query('INSERT INTO scenario_masters VALUES ($1,180,$2)', [scenario,'Pricing regression fixture'])
await db.query('INSERT INTO organization_scenarios VALUES ($1,$1,4500,$2,180,NULL)',[scenario,JSON.stringify(costs)])
await db.query("INSERT INTO schedule_events VALUES ($1,$2,NULL,$3,NULL,'2026-09-12','14:00',100,100,FALSE)",[event,org,scenario])
await db.query('INSERT INTO organization_settings VALUES ($1,$2)', [org,JSON.stringify(['2026-09-15'])])
const oldMigration=fs.readFileSync('supabase/migrations/20260828000000_fix_current_participants_checked_in_regression.sql','utf8')
const start=oldMigration.indexOf('CREATE OR REPLACE FUNCTION public.create_reservation_with_lock_v2(')
await db.exec(oldMigration.slice(start,oldMigration.indexOf('$$;',start)+3))
async function book() {
  const {rows}=await db.query("SELECT create_reservation_with_lock_v2($1,2,NULL,'Fixture','fixture@example.invalid','00000000000') AS id",[event])
  return (await db.query('SELECT unit_price,final_price FROM reservations WHERE id=$1',[rows[0].id])).rows[0]
}
assert.deepEqual(await book(),{unit_price:4500,final_price:9000})
await db.exec(fs.readFileSync('supabase/migrations/20260914120000_fix_weekend_booking_pricing.sql','utf8'))
assert.deepEqual(await book(),{unit_price:5000,final_price:10000})
assert.equal((await db.query('SELECT count(*)::int n FROM reservations WHERE unit_price=4500')).rows[0].n,1)
for (const [date,expected] of [['2026-09-13',5000],['2026-09-14',4500],['2026-09-15',5000],['2026-09-21',5000],['2026-09-22',5000]]) {
  await db.query('UPDATE schedule_events SET date=$1 WHERE id=$2',[date,event])
  assert.deepEqual(await book(),{unit_price:expected,final_price:expected*2},date)
}
// Another organization's custom holiday must not apply.
await db.query('UPDATE schedule_events SET organization_id=$1,date=$2 WHERE id=$3',['10000000-0000-0000-0000-000000000002','2026-09-15',event])
assert.equal((await book()).unit_price,4500)
async function price(entries,date='2026-09-12') {
 return (await db.query("SELECT calculate_booking_participation_fee(4500,$1,$2,'14:00',FALSE) AS fee",[JSON.stringify(entries),date])).rows[0].fee
}
assert.equal(await price([{time_slot:'weekend',amount:10,type:'percentage'}]),4950)
assert.equal(await price([{time_slot:'weekend',amount:0,type:'fixed'}]),0)
assert.equal(await price([{time_slot:'weekend',amount:5000,status:'unused'}]),4500)
assert.equal(await price([{time_slot:'afternoon',amount:4700},{time_slot:'通常',amount:4200}]),4700)
assert.equal(await price([{time_slot:'normal',amount:4300}],'2026-09-14'),4300)
assert.equal(await price([{time_slot:'holiday',amount:4900}],'2026-09-21'),4900)
assert.equal(await price([{time_slot:'holiday',amount:4900}],'2026-09-12'),4500)
assert.equal(await price([{time_slot:'weekend',amount:5000,startDate:'2099-01-01'}]),4500)
assert.equal(await price([{time_slot:'weekend',amount:5000,endDate:'2000-01-01'}]),4500)
assert.equal(await price([{time_slot:'weekend',amount:5000,status:'ready',startDate:'2000-01-01'}]),5000)
console.log('PASS: old RPC undercharges Saturday; new RPC uses weekend, Sunday, national/custom holidays; weekday, legacy time slots, percentage, zero, disabled entries, tenant holidays, totals, and existing-price preservation verified')
await db.close()

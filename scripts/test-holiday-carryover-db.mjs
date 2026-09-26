import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const migration = fs.readFileSync('supabase/migrations/20260914140000_fix_substitute_holiday_carryover.sql','utf8')
const rollback = fs.readFileSync('supabase/rollbacks/20260914140000_fix_substitute_holiday_carryover.sql','utf8')
const holiday = async date => (await db.query('SELECT public.is_booking_calendar_holiday($1::date) AS value',[date])).rows[0].value
await db.exec(fs.readFileSync('supabase/rpcs/calculate_booking_participation_fee.sql','utf8'))
await db.exec(rollback)
assert.equal(await holiday('2026-05-06'),false)
await db.exec(migration)
// Official 2026 calendar: https://eco.mtk.nao.ac.jp/koyomi/yoko/2026/rekiyou261.html
for (const date of ['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23']) assert.equal(await holiday(date),true,date)
for (const date of ['2026-05-07','2026-05-08','2026-09-24']) assert.equal(await holiday(date),false,date)
assert.equal(await holiday(null),false)
const costs=JSON.stringify([{time_slot:'normal',amount:4500},{time_slot:'weekend',amount:5000}])
const fee=async date=>(await db.query("SELECT public.calculate_booking_participation_fee(4500,$1::jsonb,$2::date,'15:00',false,'2026-01-01') AS fee",[costs,date])).rows[0].fee
assert.equal(await fee('2026-05-06'),5000)
assert.equal(await fee('2026-05-07'),4500)
await db.exec(rollback)
assert.equal(await holiday('2026-05-06'),false)
await db.exec(migration)
assert.equal(await fee('2026-05-06'),5000)
console.log('PASS official 2026 holidays, carryover pricing, ordinary days, rollback/reapply')
await db.close()

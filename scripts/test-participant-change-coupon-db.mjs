// 人数変更で予約時のクーポン割引が消えないこと（participant_change_keeps_coupon_v1）。
// 実際の migration の関数本体を PGlite に流し、定額・割合・最低利用金額・併用・旧利用を確かめる。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const ORG = id(1), USER = id(2), CUSTOMER = id(3), EVENT = id(10)
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${USER}'::uuid $$;
CREATE FUNCTION public.reservation_actor_is_org_operator(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.can_use_coupon_reservation(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.coupon_discount_for_event(uuid,uuid,integer,uuid,uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
CREATE FUNCTION public.coupon_discount_for_event_internal(uuid,uuid,integer,uuid,uuid,uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
CREATE TABLE organizations(id uuid primary key); INSERT INTO organizations VALUES('${ORG}');
CREATE TABLE customers(id uuid primary key,user_id uuid);
CREATE TABLE schedule_events(id uuid primary key,max_participants integer,capacity integer);
CREATE TABLE reservations(id uuid primary key,schedule_event_id uuid,participant_count integer,customer_id uuid,organization_id uuid,
 unit_price integer,base_price integer,total_price integer,discount_amount integer,final_price integer,status text default 'confirmed',
 cancellation_policy_deadline_hours integer default 24,updated_at timestamptz);
CREATE TABLE private_groups(id uuid primary key,reservation_id uuid,organization_id uuid,per_person_price integer,status text);
CREATE TABLE private_group_members(id uuid primary key,group_id uuid,user_id uuid,status text,coupon_id uuid,payment_amount integer);
`)
const legacy = fs.readFileSync('supabase/migrations/20260214000001_coupon_system.sql', 'utf8')
for (const name of ['coupon_campaigns', 'customer_coupons', 'coupon_usages']) {
  const match = legacy.match(new RegExp(`CREATE TABLE IF NOT EXISTS public.${name} \\([\\s\\S]*?\\n\\);`)); assert.ok(match); await db.exec(match[0])
}
await db.exec(`ALTER TABLE coupon_campaigns ADD COLUMN display_name text, ADD COLUMN min_order_amount integer, ADD COLUMN combinable boolean DEFAULT true,
 ADD COLUMN usage_valid_from timestamptz, ADD COLUMN usage_valid_until timestamptz, ADD COLUMN allowed_weekdays integer[], ADD COLUMN allowed_time_slots text[],
 ADD COLUMN customer_terms text, ADD COLUMN murder_mystery_only boolean DEFAULT false, ADD COLUMN target_store_ids uuid[], ADD COLUMN same_scenario_once boolean DEFAULT true;
 ALTER TABLE customer_coupons ADD COLUMN rules_snapshot jsonb;`)
const unify = fs.readFileSync('supabase/migrations/20260926100000_unify_coupon_rules.sql', 'utf8')
await db.exec(unify.match(/CREATE OR REPLACE FUNCTION public\.coupon_campaign_rules[\s\S]*?\n\$\$;/)[0])
const review = fs.readFileSync('supabase/migrations/20261007110002_customer_review_coupon_conditions.sql', 'utf8')
for (const name of ['coupon_usage_billing_applied', 'private_group_coupon_uses']) {
  await db.exec(review.match(new RegExp(`CREATE TABLE public\\.${name} \\([\\s\\S]*?\\n\\);`))[0])
}
const migration = fs.readFileSync('supabase/migrations/20261012120000_participant_change_keeps_coupon.sql', 'utf8')
await db.exec(migration)
// 予約時と同じ形で使用履歴を作ってから、本番と同じトリガーを付ける
await db.exec(`INSERT INTO customers VALUES('${CUSTOMER}','${USER}'); INSERT INTO schedule_events VALUES('${EVENT}',1000,1000);`)

let seq = 100
async function booking({ count = 4, unit = 3000, coupons = [], manualDiscount = 0, legacy = null }) {
  const reservation = id(seq++)
  const total = unit * count
  await db.query('INSERT INTO reservations(id,schedule_event_id,participant_count,customer_id,organization_id,unit_price,base_price,total_price,discount_amount,final_price) VALUES($1,$2,$3,$4,$5,$6,$7,$7,0,$7)',
    [reservation, EVENT, count, CUSTOMER, ORG, unit, total])
  let used = 0
  const usages = []
  for (const [i, c] of coupons.entries()) {
    const campaign = id(seq++), coupon = id(seq++), usage = id(seq++)
    await db.query(`INSERT INTO coupon_campaigns(id,organization_id,name,discount_type,discount_amount,min_order_amount) VALUES($1,$2,$3,$4,$5,$6)`,
      [campaign, ORG, c.name ?? '架空クーポン', c.type, c.amount, c.min ?? null])
    await db.query(`INSERT INTO customer_coupons(id,campaign_id,customer_id,organization_id,uses_remaining,rules_snapshot)
      SELECT $1,$2,$3,$4,0,public.coupon_campaign_rules(cc) FROM coupon_campaigns cc WHERE cc.id=$2`, [coupon, campaign, CUSTOMER, ORG])
    const raw = c.type === 'fixed' ? c.amount : Math.round(total * c.amount / 100)
    const amount = Math.min(raw, total - used)
    used += amount
    await db.query('INSERT INTO coupon_usages(id,customer_coupon_id,reservation_id,discount_amount,used_at) VALUES($1,$2,$3,$4,now()+$5::interval)', [usage, coupon, reservation, amount, `${i} second`])
    if (!legacy) await db.query('INSERT INTO coupon_usage_billing_applied VALUES($1,$2)', [usage, amount])
    usages.push(usage)
  }
  if (legacy !== 'unapplied') await db.query('UPDATE reservations SET discount_amount=$2::int+$3::int, final_price=total_price-$2::int-$3::int WHERE id=$1', [reservation, used, manualDiscount])
  return { reservation, usages }
}
const change = (reservation, count) => db.query('SELECT update_reservation_participants($1,$2,$3) AS ok', [reservation, count, CUSTOMER])
const row = async reservation => (await db.query('SELECT participant_count,total_price,discount_amount,final_price FROM reservations WHERE id=$1', [reservation])).rows[0]
const usage = async u => (await db.query('SELECT cu.discount_amount, ba.applied_amount FROM coupon_usages cu LEFT JOIN coupon_usage_billing_applied ba ON ba.usage_id=cu.id WHERE cu.id=$1', [u])).rows[0]
const rejects = async (fn, pattern) => {
  let error; try { await fn() } catch (e) { error = e }
  assert.ok(error, 'should reject'); assert.equal(error.code, 'P0056', error.message); assert.match(error.message, pattern); return error.message
}

await db.exec(`CREATE TRIGGER enforce_coupon_performance_scope BEFORE INSERT OR UPDATE ON public.coupon_usages FOR EACH ROW EXECUTE FUNCTION enforce_coupon_performance_scope();`)
// 割引の無い予約は従来どおり単価×人数
{
  const { reservation } = await booking({ count: 2 })
  await change(reservation, 3)
  assert.deepEqual(await row(reservation), { participant_count: 3, total_price: 9000, discount_amount: 0, final_price: 9000 })
}
// 定額: 増やしても減らしても同じ額を引く
{
  const { reservation, usages: [u] } = await booking({ count: 4, coupons: [{ type: 'fixed', amount: 1000 }] })
  assert.deepEqual(await row(reservation), { participant_count: 4, total_price: 12000, discount_amount: 1000, final_price: 11000 })
  await change(reservation, 6)
  assert.deepEqual(await row(reservation), { participant_count: 6, total_price: 18000, discount_amount: 1000, final_price: 17000 })
  await change(reservation, 2)
  assert.deepEqual(await row(reservation), { participant_count: 2, total_price: 6000, discount_amount: 1000, final_price: 5000 })
  assert.deepEqual(await usage(u), { discount_amount: 1000, applied_amount: 1000 })
}
// 定額が合計を超える場合は合計まで（予約時と同じ上限）
{
  const { reservation, usages: [u] } = await booking({ count: 3, unit: 1000, coupons: [{ type: 'fixed', amount: 2500 }] })
  await change(reservation, 2)
  assert.deepEqual(await row(reservation), { participant_count: 2, total_price: 2000, discount_amount: 2000, final_price: 0 })
  assert.deepEqual(await usage(u), { discount_amount: 2000, applied_amount: 2000 })
  await change(reservation, 4)
  assert.deepEqual(await row(reservation), { participant_count: 4, total_price: 4000, discount_amount: 2500, final_price: 1500 })
}
// 割合: 新しい合計に対する割合（四捨五入）。使用履歴と請求反映の記録も同じ額に付け直す
{
  const { reservation, usages: [u] } = await booking({ count: 4, unit: 3333, coupons: [{ type: 'percentage', amount: 10 }] })
  assert.deepEqual(await row(reservation), { participant_count: 4, total_price: 13332, discount_amount: 1333, final_price: 11999 })
  await change(reservation, 5)
  assert.deepEqual(await row(reservation), { participant_count: 5, total_price: 16665, discount_amount: 1667, final_price: 14998 })
  assert.deepEqual(await usage(u), { discount_amount: 1667, applied_amount: 1667 })
  await change(reservation, 3)
  assert.deepEqual(await row(reservation), { participant_count: 3, total_price: 9999, discount_amount: 1000, final_price: 8999 })
  assert.deepEqual(await usage(u), { discount_amount: 1000, applied_amount: 1000 })
}
// 最低利用金額を下回る人数は割引を外さずに止める。予約は何も変わらない
{
  const { reservation, usages: [u] } = await booking({ count: 4, coupons: [{ name: '4名様以上割', type: 'fixed', amount: 2000, min: 12000 }] })
  await change(reservation, 5)
  assert.deepEqual(await row(reservation), { participant_count: 5, total_price: 15000, discount_amount: 2000, final_price: 13000 })
  const message = await rejects(() => change(reservation, 3), /4名様以上割/)
  assert.match(message, /合計¥12,000以上/)
  assert.match(message, /3名に変更すると合計が¥9,000/)
  assert.deepEqual(await row(reservation), { participant_count: 5, total_price: 15000, discount_amount: 2000, final_price: 13000 })
  assert.deepEqual(await usage(u), { discount_amount: 2000, applied_amount: 2000 })
  await change(reservation, 4)
  assert.deepEqual(await row(reservation), { participant_count: 4, total_price: 12000, discount_amount: 2000, final_price: 10000 })
}
// 併用: 予約時の順に、残りの合計を超えないよう付け直す。割引が残らない人数は止める
{
  const { reservation, usages: [a, b] } = await booking({ count: 4, unit: 1000, coupons: [{ type: 'fixed', amount: 3000 }, { name: '併用券', type: 'fixed', amount: 500 }] })
  assert.deepEqual(await row(reservation), { participant_count: 4, total_price: 4000, discount_amount: 3500, final_price: 500 })
  await rejects(() => change(reservation, 3), /併用券.*割引が適用できなくなる/)
  await change(reservation, 6)
  assert.deepEqual(await row(reservation), { participant_count: 6, total_price: 6000, discount_amount: 3500, final_price: 2500 })
  assert.deepEqual([await usage(a), await usage(b)], [{ discount_amount: 3000, applied_amount: 3000 }, { discount_amount: 500, applied_amount: 500 }])
}
// クーポン以外の割引（店舗の手入力など）はそのまま残す
{
  const { reservation } = await booking({ count: 2, coupons: [{ type: 'percentage', amount: 50 }], manualDiscount: 300 })
  assert.deepEqual(await row(reservation), { participant_count: 2, total_price: 6000, discount_amount: 3300, final_price: 2700 })
  await change(reservation, 4)
  assert.deepEqual(await row(reservation), { participant_count: 4, total_price: 12000, discount_amount: 6300, final_price: 5700 })
}
// 反映記録の無い旧利用（本番の既存データ）でも、予約に割引が入っていれば同じ条件で付け直す
{
  const { reservation, usages: [u] } = await booking({ count: 4, coupons: [{ type: 'percentage', amount: 10 }], legacy: 'reflected' })
  const before = (await usage(u)).discount_amount
  await db.query('UPDATE reservations SET discount_amount=$2::int, final_price=total_price-$2::int WHERE id=$1', [reservation, before])
  await change(reservation, 5)
  assert.deepEqual(await row(reservation), { participant_count: 5, total_price: 15000, discount_amount: 1500, final_price: 13500 })
  assert.deepEqual(await usage(u), { discount_amount: 1500, applied_amount: null })
}
// 請求へ反映していない旧利用（予約に割引が無い）は付け直さず、割引額も作らない
{
  const { reservation, usages: [u] } = await booking({ count: 2, coupons: [{ type: 'percentage', amount: 50 }], legacy: 'unapplied' })
  const before = await usage(u)
  await change(reservation, 3)
  assert.deepEqual(await row(reservation), { participant_count: 3, total_price: 9000, discount_amount: 0, final_price: 9000 })
  assert.deepEqual(await usage(u), before)
  assert.equal(before.applied_amount, null)
}
// 使用履歴の割引額は、人数変更RPCの外からは引き続き変えられない
{
  const { usages: [u] } = await booking({ count: 2, coupons: [{ type: 'fixed', amount: 500 }] })
  let error; try { await db.query('UPDATE coupon_usages SET discount_amount=discount_amount+1 WHERE id=$1', [u]) } catch (e) { error = e }
  assert.equal(error?.code, 'P0028')
  await db.query("SELECT set_config('mmq.coupon_usage_reprice',$1,false)", [id(999)])
  error = undefined; try { await db.query('UPDATE coupon_usages SET discount_amount=discount_amount+1 WHERE id=$1', [u]) } catch (e) { error = e }
  assert.equal(error?.code, 'P0028', 'another usage id does not unlock this usage')
}
console.log('participant change keeps coupon discount: ok')

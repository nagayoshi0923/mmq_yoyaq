import fs from 'node:fs'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.org',true),'')::uuid$$;
CREATE FUNCTION is_org_admin() RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.admin',true),'false')='true'$$;
CREATE TABLE customers(id uuid PRIMARY KEY,user_id uuid);
CREATE TABLE staff(user_id uuid,organization_id uuid,status text);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,current_participants int,is_cancelled boolean,updated_at timestamptz);
CREATE TABLE private_groups(id uuid PRIMARY KEY,status text,updated_at timestamptz);
CREATE TABLE reservations(id uuid PRIMARY KEY,schedule_event_id uuid,status text,customer_id uuid,organization_id uuid,private_group_id uuid,participant_count int,cancelled_at timestamptz,cancellation_reason text,updated_at timestamptz);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
`)
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.query('INSERT INTO customers VALUES ($1,$2),($3,$4)',[id(1),id(11),id(2),id(12)])
await db.query("INSERT INTO staff VALUES ($1,$2,'active'),($3,$2,'inactive'),($4,$5,'active')",[id(13),id(21),id(14),id(15),id(22)])
const reset = async () => {
  await db.exec('RESET ROLE; DELETE FROM reservations; DELETE FROM schedule_events; DELETE FROM private_groups;')
  await db.query("INSERT INTO private_groups VALUES ($1,'confirmed',NULL)",[id(31)])
  await db.query('INSERT INTO schedule_events VALUES ($1,2,false,NULL)',[id(41)])
  await db.query("INSERT INTO reservations VALUES ($1,$2,'confirmed',$3,$4,$5,2,NULL,NULL,NULL)",[id(51),id(41),id(2),id(21),id(31)])
}
const actor = async (user,org=id(21),admin=false,role='authenticated') => {
  await db.query("SELECT set_config('test.uid',$1,false),set_config('test.org',$2,false),set_config('test.admin',$3,false)",[user||'',org||'',String(admin)])
  await db.exec(`SET ROLE ${role}`)
}
const call = name => db.query(`SELECT ${name}($1::uuid,$2::uuid,$3::text) AS ok`,[id(51),id(1),'fixture'])
const names=['cancel_reservation_with_lock','cancel_reservation_and_group_with_lock']
// Exact pre-fix production definitions. Reproduce the ownership substitution only in isolated memory.
await db.exec(fs.readFileSync('supabase/rollbacks/20260927038000_cancellation_owner_binding.sql','utf8'))
for (const name of names) {
  await reset(); await actor(id(11)); assert.equal((await call(name)).rows[0].ok,true)
}
await db.exec('RESET ROLE')
await db.exec(fs.readFileSync('supabase/migrations/20260927038000_cancellation_owner_binding.sql','utf8'))
for (const name of names) {
  for (const [user,org,admin,role] of [[id(11),id(21),false,'authenticated'],[id(14),id(21),false,'authenticated'],[id(15),id(22),false,'authenticated'],[id(16),id(22),true,'authenticated'],[null,null,false,'anon']]) {
    await reset(); await actor(user,org,admin,role)
    await assert.rejects(call(name),e=>e.code==='P0009')
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT status FROM reservations')).rows[0].status,'confirmed')
    assert.equal((await db.query('SELECT status FROM private_groups')).rows[0].status,'confirmed')
    assert.equal((await db.query('SELECT current_participants FROM schedule_events')).rows[0].current_participants,2)
  }
  // Genuine owner remains authorized even if the compatibility customer argument is stale.
  for (const [user,admin] of [[id(12),false],[id(13),false],[id(16),true]]) {
    await reset(); await actor(user,id(21),admin); assert.equal((await call(name)).rows[0].ok,true)
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT status FROM reservations')).rows[0].status,'cancelled')
    assert.equal((await db.query('SELECT status FROM private_groups')).rows[0].status,name.includes('and_group')?'cancelled':'confirmed')
  }
}
console.log('PASS: both real cancellation RPCs reject substituted ownership, inactive/cross-org staff/admin and anon; actual owner/active staff/admin retain access; denial changes no reservation/group/capacity')
await db.close()

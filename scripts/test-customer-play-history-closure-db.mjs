import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE users(id uuid PRIMARY KEY,role text,organization_id uuid);
CREATE TABLE staff(id uuid DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,status text);
CREATE TABLE customers(id uuid PRIMARY KEY,user_id uuid,organization_id uuid);
CREATE TABLE contacts(customer_id uuid,organization_id uuid);
CREATE FUNCTION customer_has_org_connection(c uuid,o uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM contacts WHERE customer_id=c AND organization_id=o) $$;
CREATE TABLE scenario_masters(id uuid PRIMARY KEY);
CREATE TABLE manual_play_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid REFERENCES customers,scenario_id uuid,scenario_title text,scenario_master_id uuid REFERENCES scenario_masters,played_at date,venue text,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE customer_played_overrides(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid REFERENCES customers,scenario_master_id uuid REFERENCES scenario_masters,reason text,created_by uuid,created_at timestamptz DEFAULT now(),UNIQUE(customer_id,scenario_master_id));`)
for(const [n,role,org] of [[1,'customer',null],[2,'staff',10],[3,'admin',10],[4,'staff',20],[5,'staff',10],[6,'license_admin',20],[7,'customer',null]]) await db.query('INSERT INTO users VALUES($1,$2,$3)',[id(n),role,org?id(org):null])
for(const [u,o,status] of [[2,10,'active'],[4,20,'active'],[5,10,'resigned']]) await db.query('INSERT INTO staff(user_id,organization_id,status) VALUES($1,$2,$3)',[id(u),id(o),status])
for(const [n,u,o] of [[100,1,null],[101,null,10],[102,null,20],[103,7,null]]) await db.query('INSERT INTO customers VALUES($1,$2,$3)',[id(n),u?id(u):null,o?id(o):null])
await db.query('INSERT INTO scenario_masters VALUES($1)',[id(200)])
await db.query('INSERT INTO contacts VALUES($1,$2),($3,$2)',[id(100),id(10),id(102)])
const migration=fs.readFileSync('supabase/migrations/20260927024000_customer_play_history_access.sql','utf8')
const rollback=fs.readFileSync('supabase/rollbacks/20260927024000_customer_play_history_access.sql','utf8')
await db.exec(migration)
async function act(actor,c,action='snapshot',payload={}) {
 await db.query("SELECT set_config('test.actor',$1,false)",[actor?id(actor):''])
 return (await db.query('SELECT customer_play_history_action($1,$2,$3) AS result',[id(c),action,JSON.stringify(payload)])).rows[0].result
}
const manual={scenario_title:'Fixture',scenario_master_id:id(200),played_at:'2026-09-01'}
for(const [actor,c] of [[null,100],[7,100],[4,100],[5,100],[999,100],[2,103]]) await assert.rejects(act(actor,c),e=>e.code==='42501')
assert.deepEqual(await act(1,100),{manual:[],overrides:[]})
const saved=await act(2,100,'add_manual',{...manual,customer_id:id(103)})
assert.equal(saved.customer_id,id(100))
assert.equal((await act(1,100)).manual.length,1)
assert.equal((await act(1,100,'update_manual_date',{id:saved.id,played_at:'2026-09-02'})).updated,true)
assert.equal((await act(3,101,'update_manual_date',{id:saved.id,played_at:'2026-09-03'})).updated,false)
assert.equal((await act(1,100)).manual[0].played_at,'2026-09-02')
await act(3,101,'add_manual',manual) // admin without a staff row
assert.equal((await act(2,102)).manual.length,0) // contact read is allowed
await assert.rejects(act(2,102,'add_manual',manual),e=>e.code==='42501')
await act(6,102,'add_manual',manual)
await act(6,102,'add_override',{scenario_master_id:id(200)})
await assert.rejects(act(2,102,null,{scenario_master_id:id(200)}),e=>e.code==='22023')
assert.equal((await act(6,102)).overrides.length,1)
await assert.rejects(act(2,102,'remove_override',{scenario_master_id:id(200)}),e=>e.code==='42501')
await assert.rejects(act(2,100,'add_manual',{scenario_title:'  '}),e=>e.code==='22023')
await act(1,100,'add_override',{scenario_master_id:id(200),created_by:id(999)})
await act(1,100,'add_override',{scenario_master_id:id(200)})
const snapshot=await act(2,100)
assert.equal(snapshot.overrides.length,1);assert.equal(snapshot.overrides[0].created_by,id(1))
assert.equal((await act(1,100,'remove_override',{scenario_master_id:id(200)})).removed,true)
assert.equal((await act(1,100,'remove_override',{scenario_master_id:id(200)})).removed,false)
assert.equal((await act(2,101,'delete_manual',{id:saved.id})).removed,false)
assert.equal((await act(1,100,'delete_manual',{id:saved.id})).removed,true)
await db.query("INSERT INTO manual_play_history(customer_id,scenario_title) SELECT $1,'limit' FROM generate_series(1,2000)",[id(100)])
assert.equal((await act(1,100)).manual.length,2000)
await assert.rejects(act(1,100,'add_manual',manual),e=>e.code==='23514')
assert.equal((await db.query("SELECT has_function_privilege('anon','customer_play_history_action(uuid,text,jsonb)','EXECUTE') AS allowed")).rows[0].allowed,false)
const before=(await db.query('SELECT count(*)::int AS n FROM manual_play_history')).rows[0].n
await db.exec(rollback);await db.exec(migration)
assert.equal((await db.query('SELECT count(*)::int AS n FROM manual_play_history')).rows[0].n,before)

await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON manual_play_history TO authenticated; GRANT SELECT,INSERT,DELETE ON customer_played_overrides TO authenticated;')
const closure=fs.readFileSync('supabase/migrations/20260927025000_close_played_history_direct_access.sql','utf8')
const reopen=fs.readFileSync('supabase/rollbacks/20260927025000_close_played_history_direct_access.sql','utf8')
await db.exec(closure)
await db.exec(fs.readFileSync('supabase/migrations/20260927027000_customer_play_history_snapshot_mincols.sql','utf8'))
await db.exec('SET ROLE authenticated')
const owned=await act(1,100)
assert.equal(owned.manual.length,2000)
for(const table of ['manual_play_history','customer_played_overrides']) {
 await assert.rejects(db.query(`SELECT * FROM ${table} LIMIT 1`),e=>e.code==='42501')
 await assert.rejects(db.query(`DELETE FROM ${table} WHERE false`),e=>e.code==='42501')
}
assert.equal((await act(2,100)).manual.length,2000)
await assert.rejects(act(4,100),e=>e.code==='42501')
assert.equal((await act(1,100,'delete_manual',{id:owned.manual[0].id})).removed,true)
const next=await act(1,100,'add_manual',manual)
assert.equal((await act(1,100,'update_manual_date',{id:next.id,played_at:'2026-09-03'})).updated,true)
await act(1,100,'add_override',{scenario_master_id:id(200)})
assert.equal((await act(1,100,'remove_override',{scenario_master_id:id(200)})).removed,true)
await db.exec('RESET ROLE')
await db.exec(reopen)
assert.equal((await db.query("SELECT has_table_privilege('authenticated','manual_play_history','SELECT') AS allowed")).rows[0].allowed,true)
assert.equal((await db.query("SELECT has_table_privilege('authenticated','customer_played_overrides','UPDATE') AS allowed")).rows[0].allowed,false)
await db.exec(closure)
assert.equal((await db.query("SELECT has_table_privilege('authenticated','manual_play_history','SELECT') AS allowed")).rows[0].allowed,false)
console.log('PASS phase2: raw access denied; actual authenticated RPC read/write/delete/date/override works; exact rollback/reapply')

await db.close()
console.log('PASS played history: owner/contact/foreign/retired/admin/license/unknown roles, scopes, idempotency, 2000 limit, grants, rollback/reapply')

function audit(dir) {
 for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
  const path=dir+'/'+entry.name
  if(entry.isDirectory())audit(path)
  else if(/\.tsx?$/.test(path))assert.doesNotMatch(fs.readFileSync(path,'utf8'),/\.from\s*\(\s*['"`](manual_play_history|customer_played_overrides)['"`]/,`Direct played-history access remains in ${path}`)
 }
}
audit('src')
console.log('PASS no direct browser access to played-history tables')

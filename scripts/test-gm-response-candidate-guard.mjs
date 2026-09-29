import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const org='00000000-0000-0000-0000-000000000001', booking='00000000-0000-0000-0000-000000000002', staff='00000000-0000-0000-0000-000000000003'
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE TABLE organizations(id uuid PRIMARY KEY);INSERT INTO organizations VALUES('${org}');
CREATE TABLE staff(id uuid PRIMARY KEY,organization_id uuid,name text,discord_user_id text,status text,UNIQUE(id,organization_id));
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,candidate_datetimes jsonb,UNIQUE(id,organization_id));
INSERT INTO staff VALUES('${staff}','${org}','GM','discord','active');
INSERT INTO reservations VALUES('${booking}','${org}','{"candidates":[{"date":"2027-01-01","order":1},{"date":"2027-02-01","order":2}]}');`)
await db.exec(fs.readFileSync('supabase/schemas/gm_availability_responses.sql','utf8'))
const name='20260929190000_gm_response_candidate_guard.sql', migration=fs.readFileSync('supabase/migrations/'+name,'utf8')
assert.equal(migration,fs.readFileSync('supabase/rpcs/save_gm_response_atomic.sql','utf8'));await db.exec(migration)
const candidates=[{date:'2027-01-01',order:1},{date:'2027-02-01',order:2}]
const save=async(expected, list=candidates,indices=[0,1], organization=org)=> (await db.query('SELECT save_gm_response_atomic($1,$2,$3,$4,$5,$6) AS result',[organization,booking,staff,JSON.stringify(list),expected===null?null:JSON.stringify(expected),JSON.stringify({available_candidates:indices,response_status:indices.length?'available':'all_unavailable',notes:'saved'})])).rows[0].result
const baseline=r=>({id:r.id,updated_at:r.updated_at})
const first=await save(null);assert.deepEqual(first.available_candidates,[0,1])
await assert.rejects(save(null),e=>e.code==='40001')
await db.query('UPDATE reservations SET candidate_datetimes=$1',[JSON.stringify({candidates:[...candidates].reverse()})])
await assert.rejects(save(baseline(first)),e=>e.code==='40001')
assert.deepEqual((await db.query('SELECT available_candidates FROM gm_availability_responses')).rows[0].available_candidates,[0,1])
console.log('PASS reordered candidates and stale create reject without changes')
const second=await save(baseline(first),[...candidates].reverse(),[1]);assert.deepEqual(second.available_candidates,[1])
await assert.rejects(save(baseline(first),[...candidates].reverse()),e=>e.code==='40001')
console.log('PASS stale response rejects lost updates')
for (const bad of [[-1],[2],[0,0],[0.5]]) await assert.rejects(save(baseline(second),[...candidates].reverse(),bad),e=>e.code==='22023')
await assert.rejects(save(baseline(second),[...candidates].reverse(),[0],'00000000-0000-0000-0000-000000000099'),e=>e.code==='42501')
await db.exec(`UPDATE staff SET status='inactive'`);await assert.rejects(save(baseline(second),[...candidates].reverse()),e=>e.code==='42501');await db.exec(`UPDATE staff SET status='active'`)
console.log('PASS index validation, org boundary and inactive staff')
const third=await save(baseline(second),[...candidates].reverse(),[]);assert.equal(third.response_status,'all_unavailable')
const acl=(await db.query("SELECT has_function_privilege('authenticated','save_gm_response_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE') AS auth,has_function_privilege('anon','save_gm_response_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE') AS anon")).rows[0];assert.equal(acl.auth,false);assert.equal(acl.anon,false)
await db.exec(fs.readFileSync('supabase/rollbacks/'+name,'utf8'));await db.exec(migration);assert.deepEqual((await db.query('SELECT notes FROM gm_availability_responses')).rows,[{notes:'saved'}])
console.log('PASS all unavailable, permissions, rollback/reapply preserves response data')
await db.close()

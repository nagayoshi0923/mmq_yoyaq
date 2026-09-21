import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const org='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002'
const master='20000000-0000-0000-0000-000000000001',secondMaster='20000000-0000-0000-0000-000000000002'
const os='30000000-0000-0000-0000-000000000001',foreignOs='30000000-0000-0000-0000-000000000002'
const from='40000000-0000-0000-0000-000000000001',to='40000000-0000-0000-0000-000000000002',foreignStore='40000000-0000-0000-0000-000000000003'
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE scenario_masters(id uuid PRIMARY KEY);
CREATE TABLE organization_scenarios(id uuid PRIMARY KEY,organization_id uuid,scenario_master_id uuid REFERENCES scenario_masters(id) ON DELETE CASCADE,UNIQUE(organization_id,scenario_master_id));
CREATE TABLE stores(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE scenario_kit_locations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,org_scenario_id uuid REFERENCES organization_scenarios(id) ON DELETE CASCADE,scenario_master_id uuid,kit_number int NOT NULL,store_id uuid NOT NULL,condition text DEFAULT 'good',condition_notes text,is_fixed boolean DEFAULT false,updated_at timestamptz DEFAULT now(),UNIQUE(organization_id,org_scenario_id,kit_number));
CREATE TABLE kit_transfer_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,org_scenario_id uuid REFERENCES organization_scenarios(id) ON DELETE CASCADE,scenario_master_id uuid NOT NULL CONSTRAINT kit_transfer_events_scenario_master_id_fkey REFERENCES scenario_masters(id) ON DELETE SET NULL,kit_number int NOT NULL,from_store_id uuid NOT NULL,to_store_id uuid NOT NULL,transfer_date date NOT NULL,status text NOT NULL DEFAULT 'pending');
INSERT INTO scenario_masters VALUES('${master}'),('${secondMaster}');
INSERT INTO organization_scenarios VALUES('${os}','${org}','${master}'),('${foreignOs}','${other}','${master}');
INSERT INTO stores VALUES('${from}','${org}'),('${to}','${org}'),('${foreignStore}','${other}');`)
await db.exec(fs.readFileSync('supabase/tests/fixtures/kit_transfer_location_legacy.sql','utf8'))
await db.exec('CREATE TRIGGER trigger_sync_kit_location_on_transfer_complete AFTER INSERT OR UPDATE ON kit_transfer_events FOR EACH ROW EXECUTE FUNCTION sync_kit_location_on_transfer_complete()')
const create=async(overrides={})=>{
 const row={organization_id:org,org_scenario_id:os,scenario_master_id:null,kit_number:1,from_store_id:from,to_store_id:to,transfer_date:'2026-09-21',status:'pending',...overrides}
 const keys=Object.keys(row)
 return db.query(`INSERT INTO kit_transfer_events(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(row))
}
await assert.rejects(create())
await assert.rejects(create({scenario_master_id:master,status:'completed'}))
console.log('PASS legacy create and completion failures reproduced')
await db.exec(fs.readFileSync('supabase/migrations/20260921124000_repair_kit_transfer_identity.sql','utf8'))
const plan=(await create()).rows[0]
assert.equal(plan.scenario_master_id,master)
assert.equal((await db.query('SELECT count(*)::int n FROM scenario_kit_locations')).rows[0].n,0)
await db.query("UPDATE kit_transfer_events SET status='completed' WHERE id=$1",[plan.id])
let location=(await db.query('SELECT * FROM scenario_kit_locations')).rows[0]
assert.equal(location.org_scenario_id,os);assert.equal(location.scenario_master_id,master);assert.equal(location.store_id,to)
await db.query("UPDATE scenario_kit_locations SET condition='damaged',condition_notes='keep',is_fixed=true WHERE id=$1",[location.id])
await db.query("UPDATE kit_transfer_events SET status='completed' WHERE id=$1",[plan.id])
assert.equal((await db.query('SELECT count(*)::int n FROM scenario_kit_locations')).rows[0].n,1)
await create({from_store_id:to,to_store_id:from,status:'completed'})
location=(await db.query('SELECT * FROM scenario_kit_locations')).rows[0]
assert.equal(location.store_id,from);assert.equal(location.condition,'damaged');assert.equal(location.condition_notes,'keep');assert.equal(location.is_fixed,true)
const legacy=(await create({org_scenario_id:null,scenario_master_id:master,kit_number:2})).rows[0]
assert.equal(legacy.org_scenario_id,os)
console.log('PASS current and legacy IDs normalize, completion upserts once, physical condition metadata preserved')
const count=async()=>(await db.query('SELECT count(*)::int n FROM kit_transfer_events')).rows[0].n
const before=await count()
for(const invalid of [{org_scenario_id:foreignOs},{from_store_id:foreignStore},{to_store_id:foreignStore},{scenario_master_id:secondMaster},{kit_number:0},{from_store_id:null}]) await assert.rejects(create(invalid))
assert.equal(await count(),before)
await assert.rejects(db.query('DELETE FROM scenario_masters WHERE id=$1',[master]))
assert.equal(await count(),before)
console.log('PASS foreign organization references, mismatched master, invalid number/stores and referenced master deletion rejected')
await db.exec(`CREATE FUNCTION fail_location() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'injected';END$$;CREATE TRIGGER fail_location BEFORE INSERT OR UPDATE ON scenario_kit_locations FOR EACH ROW EXECUTE FUNCTION fail_location();`)
await assert.rejects(db.query("UPDATE kit_transfer_events SET status='completed' WHERE id=$1",[legacy.id]))
assert.equal((await db.query('SELECT status FROM kit_transfer_events WHERE id=$1',[legacy.id])).rows[0].status,'pending')
await db.exec('DROP TRIGGER fail_location ON scenario_kit_locations')
console.log('PASS location failure rolls back completion status')
await db.exec(fs.readFileSync('supabase/rollbacks/20260921124000_repair_kit_transfer_identity.sql','utf8'))
assert.equal(await count(),before)
console.log('PASS rollback restores functions/constraint without deleting records')
await db.close()

import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const name = '20260927022000_store_public_column_boundary.sql'
const migration=fs.readFileSync('supabase/migrations/'+name,'utf8')
const rollback=fs.readFileSync('supabase/rollbacks/'+name,'utf8')
const publicColumns=['id','organization_id','name','short_name','address','access_info','opening_date','status','ownership_type','capacity','rooms','color','is_temporary','temporary_date','temporary_dates','temporary_venue_names','display_order','region','kit_group_id','created_at','updated_at']
const privateColumns=['fixed_costs','franchise_fee','franchise_fee_type','franchise_fee_percent','transport_allowance','venue_cost_per_performance','manager_name','phone_number','email','notes','kit_fixed']
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE stores(${[...publicColumns,...privateColumns].map(x=>x+' text').join(',')}); GRANT SELECT ON stores TO anon,authenticated,service_role; INSERT INTO stores(id,name,notes) VALUES('store','Public store','Private notes'); CREATE VIEW stores_public AS SELECT id,name FROM stores; GRANT SELECT ON stores_public TO anon,authenticated;`)
await db.exec(migration)
for(const role of ['anon','authenticated']) {
 await db.exec('SET ROLE '+role)
 assert.equal((await db.query('SELECT id,name FROM stores')).rows[0].name,'Public store')
 assert.equal((await db.query('SELECT * FROM stores_public')).rows.length,1)
 for(const field of [...privateColumns,'*']) await assert.rejects(db.query('SELECT '+field+' FROM stores'),/permission denied/)
 await assert.rejects(db.query("SELECT id FROM stores WHERE notes='Private notes'"),/permission denied/)
 await db.exec('RESET ROLE')
}
await db.exec('SET ROLE service_role')
assert.equal((await db.query('SELECT notes FROM stores')).rows[0].notes,'Private notes')
await db.exec('RESET ROLE')
await db.exec(rollback)
await db.exec('SET ROLE anon')
assert.equal((await db.query('SELECT notes FROM stores')).rows[0].notes,'Private notes')
await db.exec('RESET ROLE')
await db.exec(migration)
assert.equal((await db.query('SELECT notes FROM stores')).rows[0].notes,'Private notes')
// 監査は公開列を参照するポリシーを通し、非公開列への依存だけを検出する。
await db.exec(`CREATE TABLE audit_host(id text); ALTER TABLE audit_host ENABLE ROW LEVEL SECURITY; GRANT SELECT(id) ON audit_host TO anon;
CREATE POLICY safe ON audit_host FOR SELECT TO anon USING(EXISTS(SELECT 1 FROM stores WHERE stores.id=audit_host.id));
CREATE POLICY unsafe ON audit_host FOR SELECT TO anon USING(EXISTS(SELECT 1 FROM stores WHERE stores.notes=audit_host.id));
CREATE POLICY auth_only ON audit_host FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM stores WHERE stores.notes=audit_host.id));`)
const audit=fs.readFileSync('scripts/audit-anon-rls-grants.sql','utf8')
assert.deepEqual((await db.query(audit)).rows,[{host_table:'audit_host',polname:'unsafe',refs_anon_blocked:'stores.notes'}])
await db.exec('DROP POLICY unsafe ON audit_host')
assert.deepEqual((await db.query(audit)).rows,[])
await db.exec(`CREATE POLICY whole_row ON audit_host FOR SELECT TO anon USING(EXISTS(SELECT 1 FROM stores s WHERE to_jsonb(s)->>'notes'=audit_host.id));`)
assert.deepEqual((await db.query(audit)).rows,[{host_table:'audit_host',polname:'whole_row',refs_anon_blocked:'stores'}])
await db.exec('DROP POLICY whole_row ON audit_host')
assert.deepEqual((await db.query(audit)).rows,[])
await db.close()
console.log('PASS stores public projection / private fields and predicates denied / service role preserved / rollback and reapply')

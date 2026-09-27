import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const id = n => `00000000-0000-4000-a000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${id(10)}'::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'authenticated'::text$$;
CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE FUNCTION get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT '${id(1)}'::uuid$$;
CREATE TABLE staff(id uuid PRIMARY KEY,organization_id uuid,name text,role text[],status text,email text,user_id uuid,special_scenarios text[]);
CREATE TABLE audit_logs(user_id uuid,organization_id uuid,action text,resource_type text,resource_id uuid,old_values jsonb,new_values jsonb);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_admin_only ON audit_logs FOR SELECT USING ((auth.role()='service_role') OR (is_admin() AND organization_id=get_user_organization_id()));
GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT ON audit_logs TO authenticated;`)
const rollback=fs.readFileSync('supabase/rollbacks/20260928001100_staff_audit_history_scope.sql','utf8')
const migration=fs.readFileSync('supabase/migrations/20260928001100_staff_audit_history_scope.sql','utf8')
await db.exec(rollback)
const definition = async () => (await db.query("SELECT prosrc,prosecdef,proconfig FROM pg_proc WHERE proname='audit_staff_changes'")).rows
const original = await definition()
await db.exec(migration)
await db.exec(`CREATE TRIGGER trigger_audit_staff AFTER INSERT OR UPDATE OR DELETE ON staff FOR EACH ROW EXECUTE FUNCTION audit_staff_changes();
INSERT INTO staff(id,organization_id,name,role,status) VALUES('${id(21)}','${id(1)}','before',ARRAY['gm'],'active'),('${id(22)}','${id(2)}','other',ARRAY['gm'],'active');
UPDATE staff SET name='after' WHERE id='${id(21)}';
UPDATE staff SET status='resigned' WHERE id='${id(21)}';
UPDATE staff SET status='active' WHERE id='${id(21)}';
UPDATE staff SET special_scenarios=ARRAY['derived'] WHERE id='${id(21)}';`)
const logs=(await db.query('SELECT * FROM audit_logs ORDER BY action')).rows
assert.equal(logs.length,5,'only creation, rename, resignation and rehire produce logs')
assert.ok(logs.every(x=>x.organization_id!==null))
const rename=logs.find(x=>x.old_values?.name==='before')
assert.equal(rename.new_values.name,'after');assert.equal(rename.organization_id,id(1))
assert.ok(logs.some(x=>x.old_values?.status==='active'&&x.new_values?.status==='resigned'))
assert.ok(logs.some(x=>x.old_values?.status==='resigned'&&x.new_values?.status==='active'))
await db.exec('SET ROLE authenticated')
assert.equal((await db.query('SELECT * FROM audit_logs')).rows.length,4,'organization admin cannot see other organization history')
await db.exec('RESET ROLE')
await db.exec(`DELETE FROM staff WHERE id='${id(21)}'`)
const deleted=(await db.query("SELECT * FROM audit_logs WHERE action='DELETE'")).rows[0]
assert.equal(deleted.organization_id,id(1));assert.equal(deleted.old_values.name,'after')
await db.exec(rollback);assert.deepEqual(await definition(),original)
await db.exec(migration)
await db.close()
console.log('PASS staff audit: rename, resignation, rehire, derived-cache no-op, organization visibility, delete, exact rollback/reapply')

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const id=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_auth_admin;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
CREATE TYPE public.app_role AS ENUM ('admin','staff','customer','license_admin');
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE users(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations,role public.app_role NOT NULL,updated_at timestamptz);
CREATE TABLE staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations,name text,role text[] DEFAULT '{}',status text DEFAULT 'active',user_id uuid UNIQUE REFERENCES users,email text);
CREATE FUNCTION update_user_role_on_staff_unlink() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.user_id IS NOT NULL AND NEW.user_id IS NULL THEN UPDATE users SET role='customer' WHERE id=OLD.user_id AND role<>'admin'; END IF; RETURN NEW; END $$;
CREATE TRIGGER staff_unlink_trigger AFTER UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_user_role_on_staff_unlink();
INSERT INTO organizations VALUES('${id(1)}'),('${id(2)}');
INSERT INTO users(id,organization_id,role) VALUES('${id(10)}','${id(1)}','admin'),('${id(11)}',NULL,'customer'),('${id(12)}','${id(1)}','customer'),('${id(13)}','${id(2)}','customer'),('${id(14)}','${id(1)}','license_admin'),('${id(15)}','${id(1)}','staff');
GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
GRANT ALL ON staff,users,organizations TO authenticated,service_role;`)
const migration=fs.readFileSync('supabase/migrations/20260927002000_staff_account_lifecycle.sql','utf8')
const followUp=fs.readFileSync('supabase/migrations/20260927003000_staff_lifecycle_resigned_org.sql','utf8')
await db.exec(migration)
await db.exec(followUp)
const role=async n=>(await db.query('SELECT role FROM users WHERE id=$1',[id(n)])).rows[0].role
const orgOf=async n=>(await db.query('SELECT organization_id FROM users WHERE id=$1',[id(n)])).rows[0].organization_id
const staff=async n=>(await db.query('SELECT * FROM staff WHERE id=$1',[id(n)])).rows[0]
const runAs=async(actor,sql,args=[])=>{
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[id(actor)])
 await db.exec('SET ROLE authenticated')
 try{return await db.query(sql,args)}finally{await db.exec('RESET ROLE');await db.exec("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false)")}
}
const link=async(actor,s,u,email=null)=>{
 await db.exec("SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',false)")
 try{return await db.query('SELECT admin_link_staff_account($1,$2,$3,$4)',[id(actor),id(s),u===null?null:id(u),email])}
 finally{await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','',false)")}
}
await runAs(10,"INSERT INTO staff(id,organization_id,user_id,role) VALUES($1,$2,$3,ARRAY['gm'])",[id(21),id(1),id(11)])
assert.equal(await role(11),'staff')
assert.equal(await orgOf(11),id(1))
await assert.rejects(()=>runAs(11,"UPDATE staff SET role=ARRAY['admin'] WHERE id=$1",[id(21)]),/管理者権限/)
await assert.rejects(()=>runAs(11,"UPDATE staff SET status='inactive' WHERE id=$1",[id(21)]),/管理者権限/)
await runAs(11,"UPDATE staff SET name='本人プロフィール' WHERE id=$1",[id(21)])
await assert.rejects(()=>runAs(10,"UPDATE staff SET user_id=$1 WHERE id=$2",[id(13),id(21)]),/他組織/)
await assert.rejects(()=>runAs(10,"UPDATE staff SET organization_id=$1 WHERE id=$2",[id(2),id(21)]),/別の組織/)
await runAs(10,"UPDATE staff SET role=ARRAY['admin'] WHERE id=$1",[id(21)])
assert.equal(await role(11),'admin')
await runAs(10,"UPDATE staff SET role=ARRAY['gm'] WHERE id=$1",[id(21)])
assert.equal(await role(11),'staff','explicit removal of admin must revoke admin access')
await runAs(10,"UPDATE staff SET status='inactive' WHERE id=$1",[id(21)])
assert.equal(await role(11),'customer')
assert.equal(await orgOf(11),null,'inactive clears organization membership')
await assert.rejects(()=>db.query("UPDATE users SET role='staff' WHERE id=$1",[id(11)]),/スタッフの役割/)
await runAs(10,"UPDATE staff SET status='on-leave' WHERE id=$1",[id(21)])
assert.equal(await role(11),'staff','leave is not termination')
assert.equal(await orgOf(11),id(1),'resume restores organization from staff')
await runAs(10,"UPDATE staff SET status='resigned' WHERE id=$1",[id(21)])
assert.equal(await role(11),'customer','resigned revokes business access')
assert.equal(await orgOf(11),null,'resigned clears organization membership')
await assert.rejects(()=>db.query("UPDATE users SET role='staff' WHERE id=$1",[id(11)]),/スタッフの役割/)
await runAs(10,"UPDATE staff SET status='active' WHERE id=$1",[id(21)])
assert.equal(await role(11),'staff')
assert.equal(await orgOf(11),id(1))
await runAs(10,"UPDATE staff SET user_id=$1 WHERE id=$2",[id(12),id(21)])
assert.equal(await role(11),'customer');assert.equal(await orgOf(11),null,'unlink clears organization membership')
assert.equal(await role(12),'staff');assert.equal(await orgOf(12),id(1))
await runAs(10,"INSERT INTO staff(id,organization_id,role,email) VALUES($1,$2,ARRAY['gm'],'original@example.invalid')",[id(22),id(1)])
await assert.rejects(()=>runAs(10,"UPDATE staff SET user_id=$1 WHERE id=$2",[id(12),id(22)]),/unique/)
await assert.rejects(()=>runAs(11,'SELECT admin_link_staff_account($1,$2,$3,NULL)',[id(10),id(22),id(12)]),/permission denied/)
await assert.rejects(()=>link(11,22,12),/管理者権限/)
await link(10,22,12,'new@example.invalid')
assert.equal((await staff(21)).user_id,null);assert.equal((await staff(22)).user_id,id(12));assert.equal(await role(12),'staff')
assert.equal((await staff(21)).name,'本人プロフィール','transfer preserves former staff record')
await assert.rejects(()=>link(10,22,13),/組織が異なります/)
assert.equal((await staff(22)).user_id,id(12),'failed transfer preserves previous link')
await runAs(10,"INSERT INTO staff(id,organization_id,user_id,role) VALUES($1,$2,$3,ARRAY['gm'])",[id(23),id(1),id(14)])
await runAs(10,'UPDATE staff SET user_id=NULL WHERE id=$1',[id(23)])
assert.equal(await role(14),'license_admin')
await runAs(10,'DELETE FROM staff WHERE id=$1',[id(22)])
assert.equal(await role(12),'customer','delete revokes derived staff access')
assert.equal(await orgOf(12),null,'delete clears organization membership')
await assert.rejects(()=>db.query("UPDATE users SET role='staff' WHERE id=$1",[id(12)]),/解除済み/)
// Auth's internal signup trigger has no caller JWT.
await db.exec(`CREATE FUNCTION simulate_signup() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ INSERT INTO staff(id,organization_id,user_id,role) VALUES('${id(24)}','${id(1)}','${id(15)}',ARRAY['gm']) $$; GRANT USAGE ON SCHEMA public TO supabase_auth_admin; GRANT EXECUTE ON FUNCTION simulate_signup() TO supabase_auth_admin; SET SESSION AUTHORIZATION supabase_auth_admin; SELECT simulate_signup(); SET SESSION AUTHORIZATION postgres; RESET ROLE;`)
assert.equal((await staff(24)).user_id,id(15))
// Force a users update to fail and prove staff+profile changes roll back together.
await db.exec(`CREATE FUNCTION fail_profile_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${id(11)}' THEN RAISE EXCEPTION 'simulated users failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fail_profile_write BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fail_profile_write();`)
await assert.rejects(()=>runAs(10,'UPDATE staff SET user_id=$1 WHERE id=$2',[id(11),id(21)]),/simulated users failure/)
assert.equal((await staff(21)).user_id,null);assert.equal(await role(11),'customer')
await db.exec('DROP TRIGGER fail_profile_write ON users')
await db.exec(fs.readFileSync('supabase/rollbacks/20260927003000_staff_lifecycle_resigned_org.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rollbacks/20260927002000_staff_account_lifecycle.sql','utf8'))
await db.exec(migration)
await db.exec(followUp)
await db.close()
console.log('PASS staff lifecycle: atomic role/org/link, resigned/inactive org clear, leave restore, transfer, cross-org, self-escalation, license role, rollback/reapply')

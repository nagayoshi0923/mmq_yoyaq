import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
const db=new PGlite({extensions:{pgcrypto}})
const id=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_auth_admin;
CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.email',true),'') $$;
CREATE TYPE public.app_role AS ENUM ('admin','staff','customer','license_admin');
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,slug text UNIQUE,plan text,contact_email text,is_active boolean,is_license_manager boolean,settings jsonb,created_at timestamptz DEFAULT now());
CREATE TABLE users(id uuid PRIMARY KEY REFERENCES auth.users,organization_id uuid REFERENCES organizations,role public.app_role NOT NULL,email text,created_at timestamptz,updated_at timestamptz);
CREATE TABLE staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES organizations,name text,role text[] DEFAULT '{}',status text DEFAULT 'active' CONSTRAINT staff_status_check CHECK(status IN('active','inactive','on-leave')),user_id uuid UNIQUE REFERENCES users,email text,phone text,stores text[],ng_days text[],want_to_learn text[],available_scenarios text[],availability text[],experience int,special_scenarios text[],updated_at timestamptz);
CREATE TABLE stores(id uuid DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations,name text,short_name text,address text,phone_number text,status text,capacity int,rooms int,color text,opening_date date,is_temporary boolean,created_at timestamptz,updated_at timestamptz);
CREATE TABLE customers(user_id uuid,organization_id uuid,name text,email text,phone text,prefecture text,birth_date date,notification_settings jsonb,created_at timestamptz,updated_at timestamptz);
CREATE TABLE organization_settings(organization_id uuid); CREATE TABLE global_settings(organization_id uuid);
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role,supabase_auth_admin;
GRANT INSERT ON auth.users TO supabase_auth_admin;
GRANT SELECT ON users TO authenticated;`)
await db.exec(fs.readFileSync('supabase/migrations/20260927002000_staff_account_lifecycle.sql','utf8'))
const migration=fs.readFileSync('supabase/migrations/20260927003000_organization_signup_ownership.sql','utf8')
await db.exec(migration)
await db.exec(fs.readFileSync('supabase/migrations/20260927004000_signup_customer_profile_columns.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260927005000_staff_lifecycle_resigned_org.sql','utf8'))
await db.exec('CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()')
const as=async(role,user,email,sql,args=[])=>{
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.jwt.claim.email',$3,false)",[user??'',role,email??''])
 await db.exec(`SET ROLE ${role}`)
 try{return await db.query(sql,args)}finally{await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false),set_config('request.jwt.claim.email','',false)")}
}
let counter=0
const register=async(email,actor=null)=>{
 const authEmail=actor?(await db.query('SELECT email FROM auth.users WHERE id=$1',[actor])).rows[0].email:null
 const r=await as(actor?'authenticated':'anon',actor,authEmail,"SELECT register_organization_for_signup('Fixture',$1,$2,'Store') AS org",['fixture-'+(++counter),email]);return r.rows[0].org
}
const signup=async(n,email,meta={})=>{
 await db.exec('SET SESSION AUTHORIZATION supabase_auth_admin')
 try{return await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[id(n),email,meta])}
 finally{await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE')}
}
const metadata=o=>({invited_as:'admin',organization_id:o.id,organization_claim_token:o.claim_token})
const profile=async n=>(await db.query('SELECT role,organization_id FROM users WHERE id=$1',[id(n)])).rows[0]
const claim=(org,actor,email,token=org.claim_token)=>as('authenticated',id(actor),email,'SELECT claim_organization_as_admin_v2($1,$2,$3)',[org.id,'Admin',token])
const rollback=(org,token=org.claim_token,actor=null,email=null)=>as(actor?'authenticated':'anon',actor,email,'SELECT rollback_orphan_organization_v2($1,$2)',[org.id,token])
const a=await register('owner@example.invalid')
assert.equal(a.claim_token.length,64)
await assert.rejects(()=>signup(10,'owner@example.invalid',{...metadata(a),organization_claim_token:null}),/登録権限/)
await assert.rejects(()=>signup(10,'owner@example.invalid',{...metadata(a),organization_claim_token:'wrong'}),/登録権限/)
await assert.rejects(()=>signup(10,'other@example.invalid',metadata(a)),/登録権限/)
assert.equal((await db.query('SELECT count(*)::int AS n FROM auth.users')).rows[0].n,0)
await assert.rejects(()=>rollback(a,null),/取り消す権限/)
await assert.rejects(()=>as('anon',null,null,'SELECT rollback_orphan_organization($1)',[a.id]),/取り消す権限/)
await signup(10,'owner@example.invalid',metadata(a))
assert.deepEqual(await profile(10),{role:'admin',organization_id:a.id})
assert.equal((await db.query('SELECT count(*)::int AS n FROM customers WHERE user_id=$1',[id(10)])).rows[0].n,1,'signup creates the customer profile with current columns')
assert.equal((await db.query('SELECT count(*)::int AS n FROM staff WHERE user_id=$1',[id(10)])).rows[0].n,1)
await assert.rejects(()=>signup(11,'owner@example.invalid',metadata(a)),/完了しています/)
await assert.rejects(()=>rollback(a),/取り消す権限/)
await claim(a,10,'owner@example.invalid') // same owner retry is idempotent
// A public org UUID and privileged user metadata are never proof.
await signup(12,'staff@example.invalid',{invited_as:'staff',organization_id:a.id})
await signup(13,'license@example.invalid',{invited_as:'license_admin',organization_id:a.id})
assert.deepEqual(await profile(12),{role:'customer',organization_id:null})
assert.deepEqual(await profile(13),{role:'customer',organization_id:null})
await assert.rejects(()=>claim(a,12,'staff@example.invalid'),/登録権限/)
const b=await register('staff@example.invalid',id(12))
await assert.rejects(()=>claim(b,13,'license@example.invalid',null),/登録権限/)
await as('authenticated',id(12),'staff@example.invalid','SELECT claim_organization_as_admin($1,NULL)',[b.id])
assert.deepEqual(await profile(12),{role:'admin',organization_id:b.id})
await assert.rejects(()=>register('other@example.invalid',id(12)),/ログイン中/)
const c=await register('rollback@example.invalid')
await rollback(c)
assert.equal((await db.query('SELECT count(*)::int AS n FROM organizations WHERE id=$1',[c.id])).rows[0].n,0)
const d=await register('expired@example.invalid')
await db.query("UPDATE organization_signup_claims SET expires_at=now()-interval '1 second' WHERE organization_id=$1",[d.id])
await assert.rejects(()=>signup(14,'expired@example.invalid',metadata(d)),/有効期限/)
const e=await register('failure@example.invalid')
await db.exec(`CREATE FUNCTION fail_staff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated staff failure'; END $$; CREATE TRIGGER fail_staff BEFORE INSERT ON staff FOR EACH ROW EXECUTE FUNCTION fail_staff();`)
await assert.rejects(()=>signup(15,'failure@example.invalid',metadata(e)),/simulated staff failure/)
assert.equal(await profile(15),undefined)
assert.equal((await db.query('SELECT consumed_at FROM organization_signup_claims WHERE organization_id=$1',[e.id])).rows[0].consumed_at,null)
await db.exec('DROP TRIGGER fail_staff ON staff')
await signup(15,'failure@example.invalid',metadata(e))
assert.equal((await profile(15)).role,'admin')
// An unlinked former staff member can legitimately own a NEW org, but cannot reuse old proof to restore permissions later.
await db.query('DELETE FROM staff WHERE user_id=$1',[id(10)])
assert.deepEqual(await profile(10),{role:'customer',organization_id:null})
const next=await register('owner@example.invalid',id(10))
await claim(next,10,'owner@example.invalid')
assert.deepEqual(await profile(10),{role:'admin',organization_id:next.id})
await db.query('DELETE FROM staff WHERE user_id=$1',[id(10)])
await assert.rejects(()=>db.query("UPDATE users SET role='admin',organization_id=$1 WHERE id=$2",[next.id,id(10)]),/解除済み/)
// No direct claim table/helper access from public clients.
await assert.rejects(()=>as('anon',null,null,'SELECT * FROM organization_signup_claims'),/permission denied/)
await assert.rejects(()=>as('authenticated',id(13),'license@example.invalid','SELECT consume_organization_signup_claim($1,$2,$3,$4)',[a.id,a.claim_token,id(13),'license@example.invalid']),/permission denied/)
await db.exec(fs.readFileSync('supabase/rollbacks/20260927005000_staff_lifecycle_resigned_org.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rollbacks/20260927004000_signup_customer_profile_columns.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rollbacks/20260927003000_organization_signup_ownership.sql','utf8'))
await db.exec(migration)
await db.exec(fs.readFileSync('supabase/migrations/20260927004000_signup_customer_profile_columns.sql','utf8'))
await db.close()
console.log('PASS organization signup: ownership, null/wrong proof, email, metadata spoofing, expiry, replay, rollback isolation, transaction failure, staff trigger integration, migration rollback/reapply')

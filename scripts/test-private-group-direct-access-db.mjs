import fs from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
const tables=['private_groups','private_group_members','private_group_candidate_dates','private_group_date_responses','private_group_messages','private_group_survey_responses','org_scenario_survey_questions','private_group_invitations']
await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;')
for(const t of tables) await db.exec(`CREATE TABLE ${t}(id int PRIMARY KEY,secret text);INSERT INTO ${t} VALUES(1,'preserve');GRANT ALL ON ${t} TO service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON ${t} TO authenticated;GRANT SELECT(id) ON ${t} TO anon;GRANT UPDATE(secret) ON ${t} TO authenticated WITH GRANT OPTION;`)
await db.exec('GRANT SELECT ON private_groups TO PUBLIC;GRANT INSERT ON private_group_messages TO anon;')
const snapshot=async()=> (await db.query(`SELECT c.relname,coalesce(a.attname,'') col,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END role,x.privilege_type,x.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL (SELECT NULL::text attname,coalesce(c.relacl,acldefault('r',c.relowner)) acl UNION ALL SELECT attname,attacl FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND attacl IS NOT NULL) a CROSS JOIN LATERAL aclexplode(a.acl) x WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1,2,3,4,5`)).rows
const before=await snapshot()
const migration=fs.readFileSync('supabase/migrations/20260927113000_private_group_direct_access_closure.sql','utf8')
const rollback=fs.readFileSync('supabase/rollbacks/20260927113000_private_group_direct_access_closure.sql','utf8')
for(let round=0;round<2;round++) {
 await db.exec(migration)
 for(const role of ['anon','authenticated']) {
  await db.exec(`SET ROLE ${role}`)
  try {
   for(const t of tables) for(const sql of [`SELECT id FROM ${t}`,`INSERT INTO ${t} VALUES(2,'x')`,`UPDATE ${t} SET secret='x'`,`DELETE FROM ${t}`,`TRUNCATE ${t}`]) await assert.rejects(db.exec(sql),e=>e.code==='42501')
  } finally {await db.exec('RESET ROLE')}
 }
 await db.exec('SET ROLE service_role')
 for(const t of tables) {assert.equal((await db.query(`SELECT secret FROM ${t}`)).rows[0].secret,'preserve');await db.exec(`INSERT INTO ${t} VALUES(2,'server');DELETE FROM ${t} WHERE id=2`)}
 await db.exec('RESET ROLE')
 await db.exec(rollback)
 assert.deepEqual(await snapshot(),before,'rollback exactly preserves table/column grants and grant options')
}
await db.close()
console.log('PASS direct access closure: anonymous/authenticated table+column denial, server access, exact rollback/reapply')

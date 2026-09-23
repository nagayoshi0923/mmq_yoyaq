import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const read = name => readFileSync(name, 'utf8')
try {
 await db.exec(read('supabase/tests/fixtures/recruitment_deadlines.sql'))
 await db.exec(read('supabase/schemas/performance_recruitment_deadlines.sql'))
 await db.exec(read('supabase/schemas/performance_recruitment_notices.sql'))
 await db.exec(`ALTER TABLE organization_scenarios ADD COLUMN recruitment_extension_enabled boolean NOT NULL DEFAULT true, ADD COLUMN recruitment_max_missing smallint NOT NULL DEFAULT 2 CHECK(recruitment_max_missing BETWEEN 1 AND 20), ADD COLUMN recruitment_deadline_minutes smallint NOT NULL DEFAULT 90;`)
 await db.exec(read('supabase/schemas/scenario_recruitment_setting_history.sql'))
 await db.exec(read('supabase/rpcs/set_performance_recruitment_deadline.sql'))
 // Migration preservation: a non-default value and an explicitly saved default stay custom.
 await db.exec(`INSERT INTO organizations VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
 INSERT INTO scenario_masters VALUES('20000000-0000-0000-0000-000000000001',7,10),('20000000-0000-0000-0000-000000000002',7,10),('20000000-0000-0000-0000-000000000003',7,10);
 INSERT INTO organization_scenarios(id,organization_id,scenario_master_id,recruitment_max_missing) SELECT ('40000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001',('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=2 THEN 1 ELSE 2 END FROM generate_series(1,3)n;
 INSERT INTO scenario_recruitment_setting_history(organization_id,organization_scenario_id,actor_id,before_settings,after_settings) VALUES('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001','{}','{}');`)
 await db.exec(read('supabase/migrations/20260924120000_common_recruitment_targets.sql'))
 assert.deepEqual((await db.query('SELECT recruitment_target_source,recruitment_target_value FROM organization_scenarios ORDER BY id')).rows,[{recruitment_target_source:'common',recruitment_target_value:2},{recruitment_target_source:'custom',recruitment_target_value:1},{recruitment_target_source:'custom',recruitment_target_value:2}])
 await db.exec(read('supabase/tests/common_recruitment_targets_test.sql'))
 await db.exec(read('supabase/rollbacks/20260924120000_common_recruitment_targets.sql'))
 assert.equal((await db.query("SELECT to_regclass('public.organization_recruitment_settings') AS name")).rows[0].name,null)
 console.log('OK: rollback, common/custom/percent, rounding, migration preservation, tenant isolation, conflict, history, frozen deadline, actual decisions, grants')
} finally { await db.close() }

import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const read = name => readFileSync(name, 'utf8')
try {
 await db.exec(read('supabase/tests/fixtures/recruitment_deadlines.sql'))
 // 募集期限の設定（set_performance_recruitment_deadline）は現行の resolve_operating_setting で開催判断の時刻を読む。
 // 関数が読む表を足して、本物の関数（supabase/rpcs）をそのまま入れる（監査 C4: 無いと 42883 で落ちていた）。
 await db.exec(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS organization_id uuid;
 ALTER TABLE organization_scenarios ADD COLUMN IF NOT EXISTS extra_preparation_time integer;
 CREATE TABLE IF NOT EXISTS email_settings(id uuid, organization_id uuid, store_id uuid);
 CREATE TABLE IF NOT EXISTS performance_schedule_settings(organization_id uuid, store_id uuid, default_duration integer);
 CREATE TABLE IF NOT EXISTS operating_setting_overrides(organization_id uuid, store_id uuid, organization_scenario_id uuid, schedule_event_id uuid, settings jsonb);`)
 for (const name of ['get_operating_setting_default', 'resolve_operating_setting']) await db.exec(read(`supabase/rpcs/${name}.sql`))
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

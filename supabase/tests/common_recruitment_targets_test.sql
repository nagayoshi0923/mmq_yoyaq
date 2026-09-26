BEGIN;
DO $$ BEGIN
 ASSERT recruitment_missing_limit(7,'percent',50)=3;
 ASSERT recruitment_missing_limit(7,'percent',30)=2;
 ASSERT recruitment_missing_limit(7,'percent',20)=1;
 ASSERT recruitment_missing_limit(7,'percent',1)=0;
 ASSERT recruitment_missing_limit(7,'percent',100)=7;
 ASSERT recruitment_missing_limit(7,'count',2)=2;
 ASSERT recruitment_missing_limit(7,'percent',101) IS NULL;
 ASSERT recruitment_missing_limit(7,'bad',2) IS NULL;
 ASSERT NOT has_function_privilege('authenticated','save_organization_recruitment_settings(uuid,uuid,text,integer,timestamptz)','EXECUTE');
 ASSERT NOT has_table_privilege('anon','organization_recruitment_settings','SELECT');
 ASSERT NOT has_table_privilege('authenticated','organization_recruitment_setting_history','SELECT');
END $$;
DO $$ DECLARE r jsonb; rev timestamptz; BEGIN
 r:=save_organization_recruitment_settings('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','percent',50,NULL);
 ASSERT r->>'success'='true';
 r:=save_organization_recruitment_settings('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','percent',30,NULL);
 ASSERT r->>'error'='CONFLICT';
 ASSERT (SELECT count(*)=1 FROM organization_recruitment_setting_history);
 SELECT updated_at INTO rev FROM organization_scenarios WHERE right(id::text,1)='2';
 r:=save_scenario_recruitment_settings_v2('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001',true,'custom','percent',30,90,rev);
 ASSERT r->>'error'='NOT_FOUND';
 r:=save_scenario_recruitment_settings_v2('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001',true,'custom','percent',30,90,rev);
 ASSERT r->>'success'='true';
 r:=save_scenario_recruitment_settings_v2('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001',true,'common','count',2,90,rev);
 ASSERT r->>'error'='CONFLICT';
END $$;
INSERT INTO performance_recruitment_policies(organization_id,one_seat_enabled,customer_site_url,max_missing_participants) VALUES('10000000-0000-0000-0000-000000000001',true,'https://example.invalid',2),('10000000-0000-0000-0000-000000000002',true,'https://example.invalid',2);
-- Event1 common50%, minimum7/current4: extend; Event2 same but3: cancel;
-- Event3 custom30%, minimum7/current4: cancel. Event4 other tenant stays untouched.
INSERT INTO schedule_events(id,organization_id,date,start_time,scenario,scenario_master_id)
SELECT ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=4 THEN '10000000-0000-0000-0000-000000000002' ELSE '10000000-0000-0000-0000-000000000001' END::uuid,
 ((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::date,((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::time,'target-test',CASE WHEN n=3 THEN '20000000-0000-0000-0000-000000000002' ELSE '20000000-0000-0000-0000-000000000001' END::uuid FROM generate_series(1,4)n;
INSERT INTO reservations(schedule_event_id,organization_id,participant_count,customer_email) SELECT id,organization_id,CASE WHEN right(id::text,1)='2' THEN 3 ELSE 4 END,'fixture@example.invalid' FROM schedule_events;
SELECT * FROM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
DO $$ BEGIN
 ASSERT (SELECT max_missing_participants=3 FROM performance_recruitment_deadlines WHERE right(schedule_event_id::text,1)='1'), 'uses minimum7 not maximum10';
 ASSERT (SELECT count(*)=2 FROM schedule_events WHERE is_cancelled), 'common and custom threshold boundary';
 ASSERT NOT (SELECT is_cancelled FROM schedule_events WHERE right(id::text,1)='4'), 'org scoped checker';
END $$;
UPDATE organization_recruitment_settings SET value=1;
UPDATE organization_scenarios SET recruitment_deadline_minutes=30;
SELECT * FROM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
DO $$ BEGIN
 ASSERT (SELECT max_missing_participants=3 AND deadline=now()+interval '90 minutes' AND status='active' FROM performance_recruitment_deadlines WHERE right(schedule_event_id::text,1)='1'), 'announced threshold/deadline frozen';
END $$;
UPDATE reservations SET participant_count=7 WHERE right(schedule_event_id::text,1)='1';
SELECT * FROM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
DO $$ BEGIN ASSERT (SELECT status='confirmed' FROM performance_recruitment_deadlines WHERE right(schedule_event_id::text,1)='1'); END $$;
ROLLBACK;

BEGIN;
INSERT INTO organizations VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO performance_recruitment_policies(organization_id,one_seat_enabled,customer_site_url,max_missing_participants) VALUES('10000000-0000-0000-0000-000000000001',true,'https://example.invalid',1);
INSERT INTO scenario_masters VALUES('20000000-0000-0000-0000-000000000001',4,6);
INSERT INTO organization_scenarios(id,organization_id,scenario_master_id) VALUES('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
INSERT INTO schedule_events(id,organization_id,date,start_time,scenario,scenario_master_id)
SELECT ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001',((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::date,((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::time,'settings-test','20000000-0000-0000-0000-000000000001' FROM generate_series(1,2)n;
INSERT INTO reservations(schedule_event_id,organization_id,participant_count,customer_email) SELECT id,organization_id,2,'fixture@example.invalid' FROM schedule_events;
UPDATE schedule_events SET is_recruitment_extended=false WHERE right(id::text,1)='2';
DO $$ DECLARE revision timestamptz; result jsonb; BEGIN
 PERFORM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
 ASSERT (SELECT count(*)=1 FROM performance_recruitment_deadlines), 'master-only scenario resolution and default two missing';
 SELECT updated_at INTO revision FROM organization_scenarios;
 result:=save_scenario_recruitment_settings('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',false,2,60,revision);
 ASSERT result->>'error'='NOT_FOUND', 'tenant isolation';
 result:=save_scenario_recruitment_settings('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',true,2,60,revision);
 ASSERT result->>'success'='true', 'save setting';
 ASSERT (SELECT count(*)=1 FROM scenario_recruitment_setting_history), 'atomic history';
 result:=save_scenario_recruitment_settings('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',false,1,30,revision);
 ASSERT result->>'error'='CONFLICT', 'stale save rejected';
 UPDATE schedule_events SET is_recruitment_extended=true WHERE right(id::text,1)='2';
 PERFORM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
 ASSERT (SELECT deadline=now()+interval '90 minutes' FROM performance_recruitment_deadlines WHERE right(schedule_event_id::text,1)='1'), 'communicated deadline frozen';
 ASSERT (SELECT deadline=now()+interval '120 minutes' FROM performance_recruitment_deadlines WHERE right(schedule_event_id::text,1)='2'), 'unnotified existing event gets new setting';
 ASSERT (SELECT bool_and(max_missing_participants=2) FROM performance_recruitment_deadlines), 'threshold snapshot';
END $$;
ROLLBACK;

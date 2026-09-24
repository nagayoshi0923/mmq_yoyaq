-- Fictional tenants only; no external messages; all rows rolled back.
BEGIN;
INSERT INTO organizations(id,name,slug) VALUES ('dddddddd-0000-4000-8000-000000000001','継承検証A','qw-operating-test-a'),('dddddddd-0000-4000-8000-000000000002','継承検証B','qw-operating-test-b');
INSERT INTO scenario_masters(id,title,player_count_min,player_count_max) VALUES('dddddddd-0000-4000-8000-000000000003','継承検証',7,8);
INSERT INTO organization_scenarios(organization_id,scenario_master_id) VALUES('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000003'),('dddddddd-0000-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000003');
INSERT INTO global_settings(organization_id,booking_cutoff_minutes) VALUES('dddddddd-0000-4000-8000-000000000001',30),('dddddddd-0000-4000-8000-000000000002',60) ON CONFLICT(organization_id) DO UPDATE SET booking_cutoff_minutes=EXCLUDED.booking_cutoff_minutes;
INSERT INTO schedule_events(id,organization_id,date,start_time,end_time,venue,scenario,scenario_master_id,is_recruitment_extended)
SELECT ('dddddddd-0000-4000-8000-'||lpad((n+10)::text,12,'0'))::uuid,('dddddddd-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::date,((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::time,((now()+interval '5 hours') AT TIME ZONE 'Asia/Tokyo')::time,'fixture','継承検証','dddddddd-0000-4000-8000-000000000003',true FROM generate_series(1,2)n;
DO $$ DECLARE r jsonb; rev timestamptz; BEGIN
 ASSERT (SELECT default_minutes=30 FROM get_performance_booking_window('dddddddd-0000-4000-8000-000000000011'));
 ASSERT (SELECT default_minutes=60 FROM get_performance_booking_window('dddddddd-0000-4000-8000-000000000012'));
 UPDATE organization_scenarios SET booking_cutoff_minutes=0 WHERE organization_id='dddddddd-0000-4000-8000-000000000001';
 ASSERT (SELECT default_minutes=0 FROM get_performance_booking_window('dddddddd-0000-4000-8000-000000000011'));
 UPDATE schedule_events SET booking_cutoff_minutes=15 WHERE id='dddddddd-0000-4000-8000-000000000011';
 ASSERT (SELECT override_minutes=15 AND booking_deadline=now()+interval '165 minutes' FROM get_performance_booking_window('dddddddd-0000-4000-8000-000000000011'));
 UPDATE schedule_events SET booking_cutoff_minutes=NULL WHERE id='dddddddd-0000-4000-8000-000000000011';
 UPDATE organization_scenarios SET booking_cutoff_minutes=NULL WHERE organization_id='dddddddd-0000-4000-8000-000000000001';
 UPDATE global_settings SET booking_cutoff_minutes=45 WHERE organization_id='dddddddd-0000-4000-8000-000000000001';
 ASSERT (SELECT default_minutes=45 FROM get_performance_booking_window('dddddddd-0000-4000-8000-000000000011'));
 r:=save_organization_recruitment_settings_v2('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000004','count',2,NULL,true,60);
 ASSERT r->>'success'='true';
 r:=save_organization_recruitment_settings_v2('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000004','count',2,NULL,false,30);
 ASSERT r->>'error'='CONFLICT';
 SELECT updated_at INTO rev FROM organization_scenarios WHERE organization_id='dddddddd-0000-4000-8000-000000000001';
 r:=save_scenario_recruitment_settings_v3('dddddddd-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000003','dddddddd-0000-4000-8000-000000000004',true,'common','count',2,90,rev,'common','common');
 ASSERT r->>'success'='true';
 ASSERT NOT has_function_privilege('authenticated','save_scenario_recruitment_settings_v3(uuid,uuid,uuid,boolean,text,text,integer,integer,timestamptz,text,text)','EXECUTE');
END $$;
INSERT INTO performance_recruitment_policies(organization_id,one_seat_enabled,customer_site_url,max_missing_participants) VALUES('dddddddd-0000-4000-8000-000000000001',true,'https://example.invalid',2);
-- No reservations, staff assignment, or customer emails: minimum one creates a shortage of one.
UPDATE organization_scenarios SET override_player_count_min=1 WHERE organization_id='dddddddd-0000-4000-8000-000000000001';
SELECT * FROM check_performances_with_recruitment_deadlines_for_org('dddddddd-0000-4000-8000-000000000001');
DO $$ BEGIN
 ASSERT (SELECT deadline=now()+interval '2 hours' AND status='active' FROM performance_recruitment_deadlines WHERE schedule_event_id='dddddddd-0000-4000-8000-000000000011'), 'common deadline applied';
 ASSERT NOT EXISTS(SELECT 1 FROM performance_recruitment_deadlines WHERE organization_id='dddddddd-0000-4000-8000-000000000002'), 'other tenant untouched';
END $$;
UPDATE organization_recruitment_settings SET enabled=false,deadline_minutes=120 WHERE organization_id='dddddddd-0000-4000-8000-000000000001';
SELECT * FROM check_performances_with_recruitment_deadlines_for_org('dddddddd-0000-4000-8000-000000000001');
DO $$ BEGIN
 ASSERT (SELECT deadline=now()+interval '2 hours' AND status='active' FROM performance_recruitment_deadlines WHERE schedule_event_id='dddddddd-0000-4000-8000-000000000011'), 'announced deadline preserved';
 ASSERT (SELECT effective_booking_deadline=now()+interval '2 hours' FROM get_performance_booking_window('dddddddd-0000-4000-8000-000000000011')), 'active recruitment window preserved';
END $$;
-- A fresh event follows the explicit scenario override even when common is disabled.
INSERT INTO schedule_events(id,organization_id,date,start_time,end_time,venue,scenario,scenario_master_id,is_recruitment_extended,gm_roles)
SELECT 'dddddddd-0000-4000-8000-000000000013',organization_id,date,start_time,end_time,venue,scenario,scenario_master_id,true,gm_roles FROM schedule_events WHERE id='dddddddd-0000-4000-8000-000000000011';
UPDATE organization_scenarios SET recruitment_enabled_source='custom',recruitment_extension_enabled=true,recruitment_deadline_source='custom',recruitment_deadline_minutes=30 WHERE organization_id='dddddddd-0000-4000-8000-000000000001';
SELECT * FROM check_performances_with_recruitment_deadlines_for_org('dddddddd-0000-4000-8000-000000000001');
DO $$ BEGIN
 ASSERT (SELECT deadline=now()+interval '150 minutes' FROM performance_recruitment_deadlines WHERE schedule_event_id='dddddddd-0000-4000-8000-000000000013'), 'custom deadline and enabled applied';
 ASSERT NOT EXISTS(SELECT 1 FROM performance_recruitment_notices WHERE organization_id='dddddddd-0000-4000-8000-000000000001'), 'no customer notifications';
END $$;
ROLLBACK;

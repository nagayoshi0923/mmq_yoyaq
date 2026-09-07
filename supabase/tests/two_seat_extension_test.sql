-- 隔離DB専用。あと1人の既存回帰テストと合わせて実行。
BEGIN;
INSERT INTO organizations VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO performance_recruitment_policies(organization_id,one_seat_enabled,customer_site_url,max_missing_participants)
VALUES('10000000-0000-0000-0000-000000000001',true,'https://example.invalid',2),('10000000-0000-0000-0000-000000000002',true,'https://example.invalid',1);
INSERT INTO scenario_masters VALUES('20000000-0000-0000-0000-000000000001',4,4);
INSERT INTO schedule_events(id,organization_id,date,start_time,scenario,scenario_master_id)
SELECT ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001',
 ((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::date,((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::time,
 'two-seat-test','20000000-0000-0000-0000-000000000001' FROM generate_series(1,7)n;
UPDATE schedule_events SET organization_id='10000000-0000-0000-0000-000000000002' WHERE right(id::text,1)='6';
UPDATE schedule_events SET is_recruitment_extended=false WHERE right(id::text,1)='2';
INSERT INTO performance_cancellation_logs(schedule_event_id,organization_id,check_type,result)
SELECT id,organization_id,'four_hours_before','confirmed' FROM schedule_events WHERE right(id::text,1)='2';
UPDATE schedule_events SET date=((now()+interval '90 minutes') AT TIME ZONE 'Asia/Tokyo')::date,
 start_time=((now()+interval '90 minutes') AT TIME ZONE 'Asia/Tokyo')::time WHERE right(id::text,1)='5';
INSERT INTO reservations(schedule_event_id,organization_id,participant_count,customer_email)
SELECT id,organization_id,CASE right(id::text,1) WHEN '3' THEN 3 WHEN '4' THEN 1 WHEN '7' THEN 4 ELSE 2 END,'fixture@example.invalid' FROM schedule_events;
DO $$ DECLARE r record; BEGIN
 BEGIN
  UPDATE performance_recruitment_policies SET max_missing_participants=3;
  RAISE EXCEPTION '未承認の3人まで拡大できた';
 EXCEPTION WHEN check_violation THEN NULL; END;
 SELECT * INTO r FROM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
 ASSERT r.events_cancelled=2 AND r.events_confirmed=1, '3人不足と90分丁度は中止、満席は開催';
 ASSERT (SELECT count(*)=3 FROM performance_recruitment_deadlines), '未決定/確定後のあと2人とあと1人を延長';
 ASSERT (SELECT bool_and(deadline=now()+interval '90 minutes') FROM performance_recruitment_deadlines), '共通期限は開始90分前';
 ASSERT (SELECT count(*)=2 FROM performance_recruitment_notices WHERE snapshot->>'missing_participants'='2'), '開始時人数を通知へ保存';
 ASSERT (SELECT count(*)=1 FROM performance_recruitment_notices WHERE snapshot->>'missing_participants'='1'), 'あと1人も保持';
 ASSERT NOT (SELECT is_cancelled FROM schedule_events WHERE right(id::text,1)='6'), '他組織に影響しない';
 PERFORM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000002');
 ASSERT (SELECT is_cancelled FROM schedule_events WHERE right(id::text,1)='6'), '設定1の組織は2人不足を延長しない';
END $$;
-- あと2人からあと1人に変わっても期限・通知を作り直さない。
UPDATE reservations SET participant_count=3 WHERE right(schedule_event_id::text,1)='1';
DO $$ BEGIN
 PERFORM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
 ASSERT (SELECT count(*)=3 FROM performance_recruitment_notices WHERE kind='extension'), '人数変化で二重通知しない';
 ASSERT (SELECT deadline=now()+interval '90 minutes' FROM performance_recruitment_deadlines WHERE right(schedule_event_id::text,1)='1'), '案内済み締切を維持';
END $$;
UPDATE reservations SET participant_count=4 WHERE right(schedule_event_id::text,1)='1';
UPDATE performance_recruitment_deadlines SET deadline=now() WHERE right(schedule_event_id::text,1)='2';
DO $$ DECLARE r record; t uuid; BEGIN
 -- 辞退で欠員が増えても、既に案内済みの期限は短縮しない。
 SELECT response_token INTO t FROM performance_recruitment_notices WHERE right(schedule_event_id::text,1)='3' AND kind='extension';
 ASSERT respond_to_performance_recruitment(t,true)->>'status'='withdrawn', '無料辞退を共用';
 SELECT * INTO r FROM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
 ASSERT r.events_confirmed=1 AND r.events_cancelled=1, '揃えば即開催、2人不足でも90分前未達は中止';
 ASSERT NOT (SELECT is_cancelled FROM schedule_events WHERE right(id::text,1)='3'), '案内済み期限前は継続';
 ASSERT (SELECT count(*)=1 FROM performance_recruitment_notices WHERE kind='confirmed'), '開催通知';
 ASSERT (SELECT count(*)=1 FROM performance_recruitment_notices WHERE kind='cancelled'), '以前開催決定済みでも中止通知';
END $$;
ROLLBACK;

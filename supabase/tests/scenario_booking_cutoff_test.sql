BEGIN;
INSERT INTO organizations VALUES('11000000-0000-0000-0000-000000000001'),('11000000-0000-0000-0000-000000000002');
INSERT INTO stores VALUES('22000000-0000-0000-0000-000000000001','fixture');
INSERT INTO reservation_settings VALUES('22000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',2);
INSERT INTO schedule_events(id,organization_id,date,start_time,scenario,store_id,updated_at)
VALUES('33000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
 ((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::date,((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::time,
 'cutoff-test','22000000-0000-0000-0000-000000000001',now());
DO $$ DECLARE e uuid:='33000000-0000-0000-0000-000000000001'; w record; BEGIN
 SELECT * INTO w FROM get_performance_booking_window(e);
 ASSERT w.default_minutes=120 AND w.override_minutes IS NULL AND w.booking_deadline=now()+interval '1 hour', '店舗設定を継承';
 ASSERT w.judgment_deadline=now()-interval '1 hour', '判断は通常4時間前';
 INSERT INTO organization_scenarios(id,organization_id,scenario_master_id,booking_cutoff_minutes) VALUES('44000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001',60);
 UPDATE schedule_events SET organization_scenario_id='44000000-0000-0000-0000-000000000001',scenario_master_id='55000000-0000-0000-0000-000000000001';
 SELECT * INTO w FROM get_performance_booking_window(e);
 ASSERT w.default_minutes=60 AND w.booking_deadline=now()+interval '2 hours', 'シナリオ指定が標準となる';
 UPDATE schedule_events SET organization_scenario_id=NULL;
 SELECT * INTO w FROM get_performance_booking_window(e);
 ASSERT w.default_minutes=60, 'マスタIDのみの公演も同じシナリオ設定';
 UPDATE organization_scenarios SET organization_id='11000000-0000-0000-0000-000000000002';
 SELECT * INTO w FROM get_performance_booking_window(e);
 ASSERT w.default_minutes=120, '他組織のシナリオ設定を使わない';
 UPDATE organization_scenarios SET organization_id='11000000-0000-0000-0000-000000000001';

 UPDATE schedule_events SET booking_cutoff_minutes=30;
 SELECT * INTO w FROM get_performance_booking_window(e);
 ASSERT w.booking_deadline=now()+interval '150 minutes', '公演指定で店舗設定より遅く受付可能';
 PERFORM set_performance_recruitment_deadline('11000000-0000-0000-0000-000000000001',e,now()+interval '90 minutes','fixture');
 SELECT * INTO w FROM get_performance_booking_window(e);
 ASSERT w.effective_booking_deadline=now()+interval '90 minutes' AND w.booking_deadline=now()+interval '150 minutes', '判断待ちと通常予約を分離';
 UPDATE performance_recruitment_deadlines SET status='confirmed',deadline=now()-interval '1 minute';
 SELECT * INTO w FROM get_performance_booking_window(e);
 ASSERT w.effective_booking_deadline=now()+interval '150 minutes', '判断期限経過後も開催決定なら通常受付';
 INSERT INTO reservations(schedule_event_id,organization_id,participant_count) VALUES(e,'11000000-0000-0000-0000-000000000001',2);
 UPDATE schedule_events SET booking_cutoff_minutes=180;
 BEGIN
  INSERT INTO reservations(schedule_event_id,organization_id,participant_count) VALUES(e,'11000000-0000-0000-0000-000000000001',1);
  RAISE EXCEPTION '締切ちょうどに新規予約できた';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  UPDATE reservations SET participant_count=3;
  RAISE EXCEPTION '締切後に増員できた';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 UPDATE reservations SET participant_count=1;
 ASSERT (SELECT participant_count=1 FROM reservations), '減員は妨げない';
 UPDATE schedule_events SET booking_cutoff_minutes=0;
 SELECT * INTO w FROM get_performance_booking_window(e);
 ASSERT w.booking_deadline=now()+interval '3 hours', '0分は開始までの明示指定';
 UPDATE schedule_events SET booking_cutoff_minutes=NULL;
 SELECT * INTO w FROM get_performance_booking_window(e);
 ASSERT w.default_minutes=60 AND w.booking_deadline=now()+interval '2 hours', 'シナリオ標準へ戻せる';
 UPDATE organization_scenarios SET booking_cutoff_minutes=NULL;
 UPDATE reservation_settings SET organization_id='11000000-0000-0000-0000-000000000002';
 SELECT * INTO w FROM get_performance_booking_window(e);
 ASSERT w.default_minutes=0, '他組織の店舗設定を使わない';
 BEGIN UPDATE schedule_events SET booking_cutoff_minutes=-1; RAISE EXCEPTION '負数を許可'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;

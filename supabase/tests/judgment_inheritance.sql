-- 実処理の参照先を一時表に置換して実行する。予約・通知・公演の実表は変更しない。
INSERT INTO j_schedule_events(id,organization_id,date,start_time,end_time,scenario,venue,category,is_cancelled,is_recruitment_extended,max_participants)
SELECT 'dddddddd-1000-4000-8000-000000000001','dddddddd-1000-4000-8000-000000000099',
 (timezone('Asia/Tokyo',now()+interval '18 hours'))::date,
 (timezone('Asia/Tokyo',now()+interval '18 hours'))::time,
 (timezone('Asia/Tokyo',now()+interval '20 hours'))::time,'仮作品','仮店舗','open',false,false,8;
INSERT INTO judgment_values VALUES('dddddddd-1000-4000-8000-000000000001',1440);
DO $$ DECLARE result record; BEGIN
 SELECT * INTO result FROM pg_temp.check_performances_with_recruitment_deadlines_for_org('dddddddd-1000-4000-8000-000000000099');
 ASSERT result.events_checked=1 AND result.events_cancelled=1, '前日判定前でも設定された最終判断を行う';
 UPDATE j_schedule_events SET is_cancelled=false;
 SELECT * INTO result FROM pg_temp.check_performances_day_before((SELECT date FROM j_schedule_events),false);
 ASSERT result.events_checked=0, '最終判断済みの公演を前日処理で再判定しない';
END $$;
TRUNCATE j_schedule_events,j_performance_cancellation_logs,judgment_values;
INSERT INTO j_schedule_events(id,organization_id,date,start_time,end_time,scenario,venue,category,is_cancelled,is_recruitment_extended,max_participants)
SELECT 'dddddddd-1000-4000-8000-000000000002','dddddddd-1000-4000-8000-000000000099',
 (timezone('Asia/Tokyo',now()+interval '3 hours'))::date,
 (timezone('Asia/Tokyo',now()+interval '3 hours'))::time,
 (timezone('Asia/Tokyo',now()+interval '5 hours'))::time,'仮作品','仮店舗','open',false,true,8;
INSERT INTO judgment_values VALUES('dddddddd-1000-4000-8000-000000000002',60);
INSERT INTO j_performance_recruitment_deadlines(schedule_event_id,organization_id,deadline,reason,status)
VALUES('dddddddd-1000-4000-8000-000000000002','dddddddd-1000-4000-8000-000000000099',now()+interval '30 minutes','検証','active');
DO $$ DECLARE result record; BEGIN
 SELECT * INTO result FROM pg_temp.check_performances_with_recruitment_deadlines_for_org('dddddddd-1000-4000-8000-000000000099');
 ASSERT result.events_checked=0, '案内済み締切までは中止しない';
 UPDATE j_performance_recruitment_deadlines SET deadline=now()-interval '1 minute';
 SELECT * INTO result FROM pg_temp.check_performances_with_recruitment_deadlines_for_org('dddddddd-1000-4000-8000-000000000099');
 ASSERT result.events_checked=1 AND result.events_cancelled=1, '共通判断を後ろ倒ししても案内済み締切を処理する';
 ASSERT (SELECT status='cancelled' FROM j_performance_recruitment_deadlines);
END $$;
-- 前日延長で案内した期限も、設定変更や公演時刻変更では動かない。
INSERT INTO j_performance_judgment_deadlines(schedule_event_id,organization_id,deadline_at)
VALUES('dddddddd-1000-4000-8000-000000000002','dddddddd-1000-4000-8000-000000000099',now()+interval '25 minutes');
UPDATE judgment_values SET minutes=1440;
UPDATE j_schedule_events SET start_time=start_time+interval '1 hour';
DO $$ BEGIN
 ASSERT pg_temp.get_performance_judgment_deadline('dddddddd-1000-4000-8000-000000000099','dddddddd-1000-4000-8000-000000000002')=now()+interval '25 minutes';
 BEGIN
  PERFORM pg_temp.get_performance_judgment_deadline('dddddddd-1000-4000-8000-000000000098','dddddddd-1000-4000-8000-000000000002');
  RAISE EXCEPTION 'foreign event exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- fixtures/recruitment_deadlines.sql → 対象migration → 本ファイルの順に隔離DBで実行。
BEGIN;
INSERT INTO organizations VALUES ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
INSERT INTO scenario_masters VALUES ('20000000-0000-0000-0000-000000000001', 4, 4);
INSERT INTO schedule_events (id, organization_id, date, start_time, scenario, scenario_master_id)
SELECT ('30000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
 '10000000-0000-0000-0000-000000000001',
 ((now() + interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::date,
 ((now() + interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::time, 'test',
 '20000000-0000-0000-0000-000000000001'
FROM generate_series(1, 7) n;
INSERT INTO reservations (schedule_event_id, participant_count) SELECT id, 3 FROM schedule_events;
DO $$
DECLARE r jsonb;
BEGIN
  -- 別組織、開始以降、理由なしを拒否。DBでも必ず検証する。
  BEGIN
    PERFORM set_performance_recruitment_deadline('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',now()+interval '1 hour','あと1人');
    RAISE EXCEPTION '別組織を拒否できていない';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM set_performance_recruitment_deadline('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',now()+interval '4 hours','あと1人');
    RAISE EXCEPTION '開始後の締切を拒否できていない';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM set_performance_recruitment_deadline('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',now()+interval '1 hour',' ');
    RAISE EXCEPTION '空理由を拒否できていない';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM set_performance_recruitment_deadline('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',now()+interval '1 hour','あと1人');
  r := set_performance_recruitment_deadline('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',now()+interval '1 hour','あと1人');
  ASSERT (r->>'replayed')::boolean, '同一要求の再送';
  BEGIN
    PERFORM set_performance_recruitment_deadline('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',now()+interval '2 hours','あと1人');
    RAISE EXCEPTION '期限の上書きを拒否できていない';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
-- 2:過去に開催決定、3:締切に人数到達、4:設定なし、5:期限前に人数到達、6:開始後に復旧、7:中止済み。
INSERT INTO performance_cancellation_logs (schedule_event_id, organization_id, check_type, result)
VALUES ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','four_hours_before','confirmed');
SELECT set_performance_recruitment_deadline('10000000-0000-0000-0000-000000000001',id,now()+interval '1 hour','追加募集') FROM schedule_events WHERE right(id::text,1) IN ('2','3','5','6');
UPDATE performance_recruitment_deadlines SET deadline=now() WHERE right(schedule_event_id::text,1) IN ('2','3','6');
UPDATE reservations SET participant_count=4 WHERE right(schedule_event_id::text,1) IN ('3','5');
UPDATE schedule_events SET date=((now()-interval '1 hour') AT TIME ZONE 'Asia/Tokyo')::date, start_time=((now()-interval '1 hour') AT TIME ZONE 'Asia/Tokyo')::time WHERE right(id::text,1)='6';
UPDATE schedule_events SET is_cancelled=true WHERE right(id::text,1)='7';
DO $$
DECLARE r record;
BEGIN
 SELECT * INTO r FROM check_performances_with_recruitment_deadlines();
 ASSERT r.events_checked=5 AND r.events_confirmed=2 AND r.events_cancelled=3, '人数と期限による判定';
 ASSERT NOT (SELECT is_cancelled FROM schedule_events WHERE right(id::text,1)='1'), '残り1人は期限前に中止しない';
 ASSERT NOT EXISTS(SELECT 1 FROM performance_cancellation_logs WHERE right(schedule_event_id::text,1)='1'), '保留は終端ログを残さない';
 ASSERT (SELECT result='confirmed' FROM performance_cancellation_logs WHERE right(schedule_event_id::text,1)='2'), '過去の開催決定を保持';
 ASSERT (SELECT was_confirmed AND status='cancelled' FROM performance_recruitment_deadlines WHERE right(schedule_event_id::text,1)='2'), '開催決定後の欠員も最終判定';
 SELECT * INTO r FROM check_performances_with_recruitment_deadlines();
 ASSERT r.events_checked=0 AND jsonb_array_length(r.details)=0, '二重実行で通知対象を重複させない';
 ASSERT NOT has_table_privilege('authenticated','performance_recruitment_deadlines','SELECT'), '内部の理由を顧客に公開しない';
 ASSERT NOT has_function_privilege('anon','set_performance_recruitment_deadline(uuid,uuid,timestamptz,text)','EXECUTE'), '匿名操作を禁止';
 ASSERT NOT has_function_privilege('authenticated','check_performances_with_recruitment_deadlines()','EXECUTE'), '一般ユーザーの全組織判定を禁止';
END $$;
ROLLBACK;

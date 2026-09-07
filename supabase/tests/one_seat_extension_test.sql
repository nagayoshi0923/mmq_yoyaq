-- 隔離DB専用。fixture → 基盤migration → 本migration → 本テスト。
BEGIN;
INSERT INTO organizations VALUES ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO performance_recruitment_policies(organization_id,one_seat_enabled,customer_site_url)
VALUES('10000000-0000-0000-0000-000000000001',true,'https://example.invalid');
INSERT INTO scenario_masters VALUES ('20000000-0000-0000-0000-000000000001',4,4);
INSERT INTO schedule_events(id,organization_id,date,start_time,scenario,scenario_master_id)
SELECT ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '10000000-0000-0000-0000-000000000001',((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::date,
 ((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::time,'test','20000000-0000-0000-0000-000000000001'
FROM generate_series(1,7) n;
UPDATE schedule_events SET organization_id='10000000-0000-0000-0000-000000000002' WHERE right(id::text,1)='7';
-- 1/2/3:あと1人、4:あと2人、5:期限丁度、6:満席、7:対象外組織。
INSERT INTO reservations(schedule_event_id,organization_id,participant_count,customer_email)
SELECT id,organization_id,CASE right(id::text,1) WHEN '4' THEN 2 WHEN '6' THEN 4 ELSE 3 END,'test@example.invalid' FROM schedule_events;
UPDATE schedule_events SET date=((now()+interval '90 minutes') AT TIME ZONE 'Asia/Tokyo')::date,
 start_time=((now()+interval '90 minutes') AT TIME ZONE 'Asia/Tokyo')::time WHERE right(id::text,1)='5';
-- 以前の開催決定（2）は新しい予約の増加がなくても対象。
UPDATE schedule_events SET is_recruitment_extended=false WHERE right(id::text,1)='2';
INSERT INTO performance_cancellation_logs(schedule_event_id,organization_id,check_type,result)
SELECT id,organization_id,'four_hours_before','confirmed' FROM schedule_events WHERE right(id::text,1)='2';
-- 発端のキャンセル者は案内・無料辞退対象にしない。
INSERT INTO reservations(schedule_event_id,organization_id,participant_count,status,customer_email)
VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1,'cancelled','original@example.invalid');
DO $$
DECLARE r record; t uuid; response jsonb; n integer;
BEGIN
 SELECT * INTO r FROM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
 ASSERT r.events_cancelled=2 AND r.events_confirmed=1, '2人不足・90分前未達は中止、満席は開催';
 ASSERT (SELECT count(*)=3 FROM performance_recruitment_deadlines), 'あと1人だけ延長';
 ASSERT (SELECT bool_and(deadline=now()+interval '90 minutes') FROM performance_recruitment_deadlines), '開始90分前を期限にする';
 ASSERT (SELECT count(*)=3 FROM performance_recruitment_notices), '残る予約者のみ案内';
 ASSERT NOT (SELECT is_cancelled FROM schedule_events WHERE right(id::text,1)='7'), '毎分処理は他組織に触れない';
 PERFORM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
 ASSERT (SELECT count(*)=3 FROM performance_recruitment_notices), '再実行で案内重複なし';
 SELECT count(*) INTO n FROM claim_performance_recruitment_notices(); ASSERT n=3, '通知取得';
 SELECT count(*) INTO n FROM claim_performance_recruitment_notices(); ASSERT n=0, '同時送信リース';
 SELECT response_token INTO t FROM performance_recruitment_notices WHERE right(schedule_event_id::text,1)='1';
 response:=respond_to_performance_recruitment(t,false);
 ASSERT (response->>'can_withdraw')::boolean, '無料辞退可能';
 ASSERT (SELECT count(*)=1 FROM reservations WHERE status='cancelled'), '閲覧で予約を変更しない';
 response:=respond_to_performance_recruitment(t,true);
 ASSERT response->>'status'='withdrawn' AND (response->>'cancellation_fee')::integer=0, '無料辞退';
 response:=respond_to_performance_recruitment(t,true);
 ASSERT response->>'status'='withdrawn', '辞退の再送は冪等';
 ASSERT (SELECT count(*)=1 FROM performance_recruitment_notices WHERE kind='withdrawn'), '辞退確認も一回だけ';
 ASSERT NOT (respond_to_performance_recruitment(gen_random_uuid(),true)->>'success')::boolean, '未知トークン拒否';
 ASSERT NOT has_table_privilege('anon','performance_recruitment_notices','SELECT'), 'トークン非公開';
 ASSERT NOT has_function_privilege('authenticated','respond_to_performance_recruitment(uuid,boolean)','EXECUTE'), 'サービスAPI専用';
END $$;
-- 延長後の新しい予約者には無料辞退トークンを渡さない。過去に開催決定済みでも最終案内が必要。
INSERT INTO reservations(schedule_event_id,organization_id,participant_count,customer_email)
VALUES('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',1,'new@example.invalid');
UPDATE performance_recruitment_deadlines SET deadline=now() WHERE right(schedule_event_id::text,1)='3';
DO $$
DECLARE r record; t uuid;
BEGIN
 BEGIN
  INSERT INTO reservations(schedule_event_id,organization_id,participant_count)
  VALUES('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',1);
  RAISE EXCEPTION '期限後の予約が通った';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 SELECT response_token INTO t FROM performance_recruitment_notices WHERE right(schedule_event_id::text,1)='3';
 ASSERT respond_to_performance_recruitment(t,true)->>'error'='WITHDRAWAL_CLOSED', '期限後辞退拒否';
 SELECT * INTO r FROM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
 ASSERT r.events_confirmed=1 AND r.events_cancelled=1, '揃えば即開催、期限未達中止';
 ASSERT (SELECT count(*)=2 FROM performance_recruitment_notices WHERE kind='confirmed'), '新規予約者と元の予約者へ開催再通知';
 ASSERT (SELECT count(*)=1 FROM performance_recruitment_notices WHERE kind='cancelled'), '中止メールを確保';
 ASSERT NOT EXISTS(SELECT 1 FROM performance_recruitment_notices WHERE customer_email='new@example.invalid' AND kind='extension'), '新規予約は無料辞退対象外';
 SELECT response_token INTO t FROM performance_recruitment_notices WHERE right(schedule_event_id::text,1)='2' AND kind='extension';
 ASSERT respond_to_performance_recruitment(t,true)->>'error'='WITHDRAWAL_CLOSED', '再確定後の辞退拒否';
 SELECT * INTO r FROM check_performances_with_recruitment_deadlines_for_org('10000000-0000-0000-0000-000000000001');
 ASSERT r.events_checked=0, '最終判断の二重処理なし';
  PERFORM dispatch_performance_recruitment_checks();
 ASSERT (SELECT count(*)=1 FROM net.requests), '対象組織だけを定期実行';
 ASSERT (SELECT body->>'check_type'='recruitment_deadline' FROM net.requests LIMIT 1), '追加募集専用の呼び出し';
END $$;
ROLLBACK;

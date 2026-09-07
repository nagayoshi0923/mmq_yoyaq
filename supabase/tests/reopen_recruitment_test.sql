-- 隔離DB専用。再確定→再欠員→再募集の回帰。
BEGIN;
INSERT INTO organizations VALUES('11000000-0000-0000-0000-000000000001');
INSERT INTO performance_recruitment_policies(organization_id,one_seat_enabled,customer_site_url,max_missing_participants)
VALUES('11000000-0000-0000-0000-000000000001',true,'https://example.invalid',2);
INSERT INTO scenario_masters VALUES('22000000-0000-0000-0000-000000000001',4,4);
INSERT INTO schedule_events(id,organization_id,date,start_time,scenario,scenario_master_id)
VALUES('33000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
 ((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::date,((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::time,
 'reopen-test','22000000-0000-0000-0000-000000000001');
INSERT INTO reservations(schedule_event_id,organization_id,participant_count,customer_email)
SELECT id,organization_id,3,'fixture@example.invalid' FROM schedule_events;
DO $$ DECLARE org uuid:='11000000-0000-0000-0000-000000000001'; old_token uuid; new_token uuid; r record; BEGIN
 PERFORM check_performances_with_recruitment_deadlines_for_org(org);
 SELECT response_token INTO old_token FROM performance_recruitment_notices WHERE kind='extension';
 UPDATE reservations SET participant_count=4;
 PERFORM check_performances_with_recruitment_deadlines_for_org(org);
 ASSERT (SELECT status='confirmed' AND cycle=1 FROM performance_recruitment_deadlines), '初回開催確定';
 UPDATE reservations SET participant_count=1;
 PERFORM check_performances_with_recruitment_deadlines_for_org(org);
 ASSERT (SELECT status='confirmed' AND cycle=1 FROM performance_recruitment_deadlines), '未承認の3人不足へ自動拡張しない';
 UPDATE reservations SET participant_count=2;
 PERFORM check_performances_with_recruitment_deadlines_for_org(org);
 ASSERT (SELECT status='active' AND cycle=2 AND deadline=now()+interval '90 minutes' FROM performance_recruitment_deadlines), 'あと2人で同じ期限へ再開';
 ASSERT (SELECT is_recruitment_extended AND NOT is_cancelled FROM schedule_events), '再募集状態';
 ASSERT (SELECT count(*)=2 FROM performance_recruitment_notices WHERE kind='extension'), '新しい周回の通知';
 ASSERT (SELECT bool_and(status='expired') FROM performance_recruitment_notices WHERE cycle=1), '古い未送信通知を停止';
 ASSERT (respond_to_performance_recruitment(old_token,false)->>'can_withdraw')::boolean=false, '旧リンクを復活させない';
 ASSERT respond_to_performance_recruitment(old_token,true)->>'error'='WITHDRAWAL_CLOSED', '旧リンクで辞退不可';
 SELECT response_token INTO new_token FROM performance_recruitment_notices WHERE kind='extension' AND cycle=2;
 ASSERT (respond_to_performance_recruitment(new_token,false)->>'can_withdraw')::boolean, '現周回リンクは有効';
 PERFORM check_performances_with_recruitment_deadlines_for_org(org);
 ASSERT (SELECT count(*)=2 FROM performance_recruitment_notices WHERE kind='extension'), '再実行は二重通知しない';
 ASSERT (SELECT count(*)=1 FROM claim_performance_recruitment_notices()), '現周回だけ送信対象';
 ASSERT respond_to_performance_recruitment(new_token,true)->>'status'='withdrawn', '現周回で無料辞退';
 ASSERT (SELECT count(*)=1 FROM performance_recruitment_notices WHERE kind='withdrawn' AND cycle=2), '辞退通知も現周回';
 INSERT INTO reservations(schedule_event_id,organization_id,participant_count,customer_email)
 SELECT id,organization_id,4,'replacement@example.invalid' FROM schedule_events;
 UPDATE reservations SET participant_count=4;
 PERFORM check_performances_with_recruitment_deadlines_for_org(org);
 ASSERT (SELECT status='confirmed' AND cycle=2 FROM performance_recruitment_deadlines), '2周目も開催確定';
 ASSERT (SELECT count(*)=2 FROM performance_recruitment_notices WHERE kind='confirmed'), '2周目の開催通知を省略しない';
 -- 90分前を過ぎた再欠員は延長せず中止。時刻を動かさず期限だけ境界へ設定。
 UPDATE performance_recruitment_deadlines SET deadline=now();
 UPDATE reservations SET participant_count=3;
 SELECT * INTO r FROM check_performances_with_recruitment_deadlines_for_org(org);
 ASSERT r.events_cancelled=1, '期限到達後の再欠員は中止';
 ASSERT (SELECT status='cancelled' AND cycle=3 AND deadline=now() FROM performance_recruitment_deadlines), '締切を延ばさない';
 ASSERT (SELECT count(*)=2 FROM performance_recruitment_notices WHERE kind='extension'), '締切後は再募集通知しない';
 ASSERT (SELECT count(*)=1 FROM performance_recruitment_notices WHERE kind='cancelled' AND cycle=3), '現周回の中止通知';
 ASSERT (SELECT bool_and(status='cancelled') FROM reservations), '公演中止を予約へ反映';
 PERFORM check_performances_with_recruitment_deadlines_for_org(org);
 ASSERT (SELECT count(*)=1 FROM performance_recruitment_notices WHERE kind='cancelled'), '中止は一度だけ';
END $$;
ROLLBACK;

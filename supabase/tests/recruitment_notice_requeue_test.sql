-- expired になった追加募集案内を active 期間中に pending へ戻して再送できること。
BEGIN;
INSERT INTO organizations VALUES ('10000000-0000-0000-0000-000000000001');
INSERT INTO performance_recruitment_policies(organization_id,one_seat_enabled,customer_site_url)
VALUES('10000000-0000-0000-0000-000000000001',true,'https://example.invalid');
INSERT INTO scenario_masters VALUES ('20000000-0000-0000-0000-000000000001',4,4);
INSERT INTO schedule_events(id,organization_id,date,start_time,scenario,scenario_master_id)
VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 ((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::date,
 ((now()+interval '3 hours') AT TIME ZONE 'Asia/Tokyo')::time,'requeue-test','20000000-0000-0000-0000-000000000001');
INSERT INTO reservations(schedule_event_id,organization_id,participant_count,customer_email)
VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3,'requeue@example.invalid');
DO $$
DECLARE org uuid := '10000000-0000-0000-0000-000000000001';
BEGIN
 PERFORM check_performances_with_recruitment_deadlines_for_org(org);
 UPDATE performance_recruitment_notices SET status='expired', lease_until=NULL WHERE kind='extension';
 PERFORM check_performances_with_recruitment_deadlines_for_org(org);
 ASSERT (SELECT status='pending' FROM performance_recruitment_notices WHERE kind='extension'), 'active 中の expired 案内を pending に戻す';
 ASSERT (SELECT count(*)=1 FROM claim_performance_recruitment_notices()), '再キュー後に送信対象へ';
END $$;
ROLLBACK;

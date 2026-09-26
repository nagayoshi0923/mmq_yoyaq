-- scripts/test-settings-hierarchy-db.py judgment と同じ一時表環境で実行する。
-- 実予約・メール送信・実テーブルへの書込は一切行わない。
TRUNCATE j_performance_recruitment_notices,j_performance_cancellation_logs,j_reservations;
UPDATE j_schedule_events SET is_cancelled=false,is_recruitment_extended=true;
UPDATE j_performance_recruitment_deadlines SET status='active',deadline=now()+interval '30 minutes';
INSERT INTO j_reservations(id,organization_id,schedule_event_id,title,requested_datetime,duration,participant_count,status,customer_email)
VALUES('dddddddd-1000-4000-8000-000000000010','dddddddd-1000-4000-8000-000000000099','dddddddd-1000-4000-8000-000000000002','検証予約',now()+interval '3 hours',120,1,'confirmed','fixture@example.invalid');
DO $$
DECLARE o uuid := 'dddddddd-1000-4000-8000-000000000099'; old_snapshot jsonb; old_token uuid;
BEGIN
 PERFORM pg_temp.check_performances_with_recruitment_deadlines_for_org(o);
 ASSERT (SELECT count(*)=1 FROM j_performance_recruitment_notices), '進行中の追加募集にも未作成案内を補う';
 SELECT snapshot,response_token INTO old_snapshot,old_token FROM j_performance_recruitment_notices;
 UPDATE j_performance_recruitment_notices SET status='expired',attempts=1;
 UPDATE j_reservations SET participant_count=2;
 PERFORM pg_temp.check_performances_with_recruitment_deadlines_for_org(o);
 ASSERT (SELECT status='pending' AND attempts=1 AND snapshot=old_snapshot AND response_token=old_token FROM j_performance_recruitment_notices), '未送信expiredだけを本文・トークン・試行回数を変えず復旧';
 UPDATE j_performance_recruitment_notices SET status='failed',lease_until=now()+interval '10 minutes';
 PERFORM pg_temp.check_performances_with_recruitment_deadlines_for_org(o);
 ASSERT (SELECT status='failed' AND lease_until=now()+interval '10 minutes' FROM j_performance_recruitment_notices), '失敗時の再試行待機を毎分リセットしない';
 UPDATE j_performance_recruitment_notices SET status='expired',lease_until=NULL,withdrawn_at=now();
 PERFORM pg_temp.check_performances_with_recruitment_deadlines_for_org(o);
 ASSERT (SELECT status='expired' FROM j_performance_recruitment_notices), '辞退済みを復活させない';
 UPDATE j_performance_recruitment_notices SET withdrawn_at=NULL,sent_at=now();
 PERFORM pg_temp.check_performances_with_recruitment_deadlines_for_org(o);
 ASSERT (SELECT status='expired' FROM j_performance_recruitment_notices), '送信済みを復活させない';
 UPDATE j_performance_recruitment_notices SET sent_at=NULL,attempts=10;
 PERFORM pg_temp.check_performances_with_recruitment_deadlines_for_org(o);
 ASSERT (SELECT status='expired' AND attempts=10 FROM j_performance_recruitment_notices), '試行上限を無視しない';
 UPDATE j_performance_recruitment_notices SET attempts=1;
 UPDATE j_performance_recruitment_deadlines SET cycle=2;
 PERFORM pg_temp.check_performances_with_recruitment_deadlines_for_org(o);
 ASSERT (SELECT status='expired' FROM j_performance_recruitment_notices WHERE cycle=1), '過去の周回を復活させない';
 ASSERT (SELECT count(*)=1 FROM j_performance_recruitment_notices WHERE status='pending' AND cycle=2), '現周回は独立した案内を持つ';
END $$;

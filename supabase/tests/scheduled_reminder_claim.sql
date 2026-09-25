-- claim本体はテストランナーで同じ定義の参照先だけ一時表に差し替える。
-- 本番の予約・公演・送信記録には触れない。
CREATE TEMP TABLE reminder_reservation_fixture(id uuid,organization_id uuid,schedule_event_id uuid,status text);
CREATE TEMP TABLE reminder_event_fixture(id uuid,organization_id uuid,date date,is_cancelled boolean);
CREATE TEMP TABLE reminder_delivery_fixture(LIKE public.scheduled_reminder_deliveries INCLUDING ALL);
INSERT INTO reminder_event_fixture VALUES('ffffffff-1000-4000-8000-000000000003','ffffffff-1000-4000-8000-000000000001','2099-01-02',false);
INSERT INTO reminder_reservation_fixture VALUES('ffffffff-1000-4000-8000-000000000002','ffffffff-1000-4000-8000-000000000001','ffffffff-1000-4000-8000-000000000003','confirmed');
-- CLAIM_FUNCTION
DO $$
DECLARE
 o uuid := 'ffffffff-1000-4000-8000-000000000001';
 r uuid := 'ffffffff-1000-4000-8000-000000000002';
 e uuid := 'ffffffff-1000-4000-8000-000000000003';
 first_claim record;
 retry_claim record;
BEGIN
 SELECT * INTO first_claim FROM pg_temp.claim_reminder_fixture(o,r,e,'2099-01-02',1,'09:00');
 ASSERT first_claim.delivery_id IS NOT NULL;
 ASSERT NOT EXISTS(SELECT 1 FROM pg_temp.claim_reminder_fixture(o,r,e,'2099-01-02',1,'09:00'));
 UPDATE reminder_delivery_fixture SET status='failed';
 SELECT * INTO retry_claim FROM pg_temp.claim_reminder_fixture(o,r,e,'2099-01-02',1,'09:00');
 ASSERT retry_claim.delivery_id=first_claim.delivery_id AND retry_claim.lease_token<>first_claim.lease_token;
 UPDATE reminder_delivery_fixture SET status='sent';
 ASSERT NOT EXISTS(SELECT 1 FROM pg_temp.claim_reminder_fixture(o,r,e,'2099-01-02',1,'09:00'));
 UPDATE reminder_delivery_fixture SET status='sending',attempted_at=now()-interval '16 minutes';
 ASSERT EXISTS(SELECT 1 FROM pg_temp.claim_reminder_fixture(o,r,e,'2099-01-02',1,'09:00'));
 UPDATE reminder_delivery_fixture SET status='failed',created_at=now()-interval '24 hours';
 ASSERT NOT EXISTS(SELECT 1 FROM pg_temp.claim_reminder_fixture(o,r,e,'2099-01-02',1,'09:00'));
 BEGIN
  PERFORM pg_temp.claim_reminder_fixture('ffffffff-1000-4000-8000-000000000004',r,e,'2099-01-02',1,'09:00');
  RAISE EXCEPTION '別組織の予約を取得できてしまった';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$$;

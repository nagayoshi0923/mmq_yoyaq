-- pg_temp.change_reservations + change_snapshot fixture function installed by runner.
INSERT INTO change_reservations(id,organization_id,participant_count,requested_datetime,reservation_change_deadline_hours_snapshot)
VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010',2,now()-interval '1 day',NULL);
CREATE TRIGGER change_snapshot BEFORE INSERT OR UPDATE ON change_reservations FOR EACH ROW EXECUTE FUNCTION pg_temp.change_snapshot();
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',true);
INSERT INTO change_reservations(id,organization_id,participant_count,requested_datetime)
VALUES('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010',2,now()+interval '20 hours');
DO $$ BEGIN
 IF (SELECT reservation_change_deadline_hours_snapshot FROM change_reservations WHERE id='00000000-0000-0000-0000-000000000002')<>24 THEN RAISE EXCEPTION 'new snapshot missing'; END IF;
 BEGIN
  UPDATE change_reservations SET participant_count=3 WHERE id='00000000-0000-0000-0000-000000000002';
  RAISE EXCEPTION 'deadline was not enforced';
 EXCEPTION WHEN SQLSTATE 'P0050' THEN NULL; END;
END $$;
-- Existing bookings retain their previous unrestricted change behavior.
UPDATE change_reservations SET participant_count=3,reservation_change_deadline_hours_snapshot=99 WHERE id='00000000-0000-0000-0000-000000000001';
-- Changing the stored snapshot cannot extend the deadline.
UPDATE change_reservations SET reservation_change_deadline_hours_snapshot=0 WHERE id='00000000-0000-0000-0000-000000000002';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM change_reservations WHERE id='00000000-0000-0000-0000-000000000001' AND reservation_change_deadline_hours_snapshot IS NOT NULL) THEN RAISE EXCEPTION 'legacy changed'; END IF;
 IF (SELECT reservation_change_deadline_hours_snapshot FROM change_reservations WHERE id='00000000-0000-0000-0000-000000000002')<>24 THEN RAISE EXCEPTION 'snapshot mutable'; END IF;
END $$;
-- Staff can handle a requested exception after the self-service cutoff.
INSERT INTO change_staff VALUES('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000010','active');
UPDATE change_reservations SET participant_count=3 WHERE id='00000000-0000-0000-0000-000000000002';
DELETE FROM change_staff;
INSERT INTO change_reservations(id,organization_id,participant_count,requested_datetime,reservation_source)
VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000010',2,now()+interval '10 days','web_private');
DO $$ BEGIN
 IF (SELECT reservation_change_deadline_hours_snapshot FROM change_reservations WHERE id='00000000-0000-0000-0000-000000000003')<>168 THEN RAISE EXCEPTION 'private snapshot missing'; END IF;
END $$;

-- A different tenant's administrator is still a customer here.
INSERT INTO change_users VALUES('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000011','admin');
DO $$ BEGIN
 BEGIN
  UPDATE change_reservations SET participant_count=4 WHERE id='00000000-0000-0000-0000-000000000002';
  RAISE EXCEPTION 'foreign administrator bypassed deadline';
 EXCEPTION WHEN SQLSTATE 'P0050' THEN NULL; END;
END $$;
UPDATE change_users SET organization_id='00000000-0000-0000-0000-000000000010';
UPDATE change_reservations SET participant_count=4 WHERE id='00000000-0000-0000-0000-000000000002';

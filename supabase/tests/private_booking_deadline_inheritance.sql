-- 検証用の組織・作品だけを作成し、全変更を最後に破棄する。
BEGIN;
INSERT INTO public.organizations(id,name,slug) VALUES ('eeeeeeee-0000-4000-8000-000000000001','締切検証A','qw-deadline-test-a'),('eeeeeeee-0000-4000-8000-000000000002','締切検証B','qw-deadline-test-b');
INSERT INTO public.global_settings(organization_id,private_booking_deadline_days) VALUES ('eeeeeeee-0000-4000-8000-000000000001',7),('eeeeeeee-0000-4000-8000-000000000002',21)
ON CONFLICT(organization_id) DO UPDATE SET private_booking_deadline_days=EXCLUDED.private_booking_deadline_days;
INSERT INTO public.scenario_masters(id,title) VALUES ('eeeeeeee-0000-4000-8000-000000000003','締切検証作品');
INSERT INTO public.organization_scenarios(organization_id,scenario_master_id,private_booking_deadline_days) VALUES ('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003',NULL),('eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000003',NULL);
DO $$ BEGIN
 IF public.get_effective_private_booking_deadline_days('eeeeeeee-0000-4000-8000-000000000001',NULL,'eeeeeeee-0000-4000-8000-000000000003') <> 7 THEN RAISE EXCEPTION 'common inheritance failed'; END IF;
 UPDATE public.global_settings SET private_booking_deadline_days=10 WHERE organization_id='eeeeeeee-0000-4000-8000-000000000001';
 IF public.get_effective_private_booking_deadline_days('eeeeeeee-0000-4000-8000-000000000001',NULL,'eeeeeeee-0000-4000-8000-000000000003') <> 10 THEN RAISE EXCEPTION 'common change failed'; END IF;
 UPDATE public.organization_scenarios SET private_booking_deadline_days=0 WHERE organization_id='eeeeeeee-0000-4000-8000-000000000001' AND scenario_master_id='eeeeeeee-0000-4000-8000-000000000003';
 IF public.get_effective_private_booking_deadline_days(NULL,'qw-deadline-test-a','eeeeeeee-0000-4000-8000-000000000003') <> 0 THEN RAISE EXCEPTION 'zero override failed'; END IF;
 IF public.get_private_booking_deadline_days(NULL,'qw-deadline-test-a') <> 0 THEN RAISE EXCEPTION 'calendar entrance hides available scenario'; END IF;
 IF public.get_effective_private_booking_deadline_days(NULL,'qw-deadline-test-b','eeeeeeee-0000-4000-8000-000000000003') <> 21 THEN RAISE EXCEPTION 'tenant isolation failed'; END IF;
 UPDATE public.organization_scenarios SET private_booking_deadline_days=NULL WHERE organization_id='eeeeeeee-0000-4000-8000-000000000001' AND scenario_master_id='eeeeeeee-0000-4000-8000-000000000003';
 IF public.get_effective_private_booking_deadline_days(NULL,'qw-deadline-test-a','eeeeeeee-0000-4000-8000-000000000003') <> 10 THEN RAISE EXCEPTION 'reset inheritance failed'; END IF;
 BEGIN
  PERFORM public.get_effective_private_booking_deadline_days(NULL,'qw-deadline-test-a','eeeeeeee-0000-4000-8000-000000000004');
  RAISE EXCEPTION 'unknown scenario was accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'SCENARIO_NOT_FOUND' THEN RAISE; END IF; END;
END $$;
INSERT INTO public.private_groups(id,organization_id,scenario_master_id,organizer_id,invite_code)
VALUES('eeeeeeee-0000-4000-8000-000000000005','eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-000000000006','qw-deadline-test');
DO $$ BEGIN
 BEGIN
  INSERT INTO public.private_group_candidate_dates(group_id,date,time_slot,start_time,end_time) VALUES('eeeeeeee-0000-4000-8000-000000000005',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE+9,'午前','10:00','12:00');
  RAISE EXCEPTION 'late group candidate accepted';
 EXCEPTION WHEN SQLSTATE 'P0045' THEN NULL; END;
 INSERT INTO public.private_group_candidate_dates(group_id,date,time_slot,start_time,end_time) VALUES('eeeeeeee-0000-4000-8000-000000000005',(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE+10,'午前','10:00','12:00');
 BEGIN
  UPDATE public.private_group_candidate_dates SET date=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE+9 WHERE group_id='eeeeeeee-0000-4000-8000-000000000005';
  RAISE EXCEPTION 'late candidate update accepted';
 EXCEPTION WHEN SQLSTATE 'P0045' THEN NULL; END;
 BEGIN
  INSERT INTO public.reservations(organization_id,scenario_id,reservation_source,candidate_datetimes,title)
  VALUES('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003','web_private',jsonb_build_object('candidates',jsonb_build_array(jsonb_build_object('date',((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE+9)::TEXT))),'締切検証');
  RAISE EXCEPTION 'late reservation accepted';
 EXCEPTION WHEN SQLSTATE 'P0045' THEN NULL; END;
END $$;
-- 締切内で受付後、共通締切が延びても既存候補の承認は可能。
INSERT INTO public.reservations(id,organization_id,scenario_id,reservation_source,candidate_datetimes,title,requested_datetime,duration)
VALUES('eeeeeeee-0000-4000-8000-000000000007','eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003','web_private',jsonb_build_object('candidates',jsonb_build_array(jsonb_build_object('date',((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE+10)::TEXT,'status','pending'))),'締切検証',CURRENT_TIMESTAMP+INTERVAL '10 days',120);
UPDATE public.global_settings SET private_booking_deadline_days=20 WHERE organization_id='eeeeeeee-0000-4000-8000-000000000001';
UPDATE public.reservations SET candidate_datetimes=jsonb_set(candidate_datetimes,'{candidates,0,status}','"confirmed"'::JSONB) WHERE id='eeeeeeee-0000-4000-8000-000000000007';
DO $$ BEGIN
 BEGIN
  UPDATE public.reservations SET candidate_datetimes=jsonb_set(candidate_datetimes,'{candidates,0,date}',to_jsonb(((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE+11)::TEXT)) WHERE id='eeeeeeee-0000-4000-8000-000000000007';
  RAISE EXCEPTION 'new late candidate accepted';
 EXCEPTION WHEN SQLSTATE 'P0045' THEN NULL; END;
END $$;
UPDATE public.reservations SET candidate_datetimes=jsonb_set(candidate_datetimes,'{candidates}','[]'::JSONB) WHERE id='eeeeeeee-0000-4000-8000-000000000007';
SET LOCAL ROLE anon;
SELECT public.get_effective_private_booking_deadline_days(NULL,'qw-deadline-test-a','eeeeeeee-0000-4000-8000-000000000003') AS anonymous_read;
RESET ROLE;
ROLLBACK;

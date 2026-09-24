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
SET LOCAL ROLE anon;
SELECT public.get_effective_private_booking_deadline_days(NULL,'qw-deadline-test-a','eeeeeeee-0000-4000-8000-000000000003') AS anonymous_read;
RESET ROLE;
ROLLBACK;

-- Restore each environment's observed pre-migration UPDATE privileges.
DO $$ DECLARE saved jsonb; target_role text; BEGIN
 saved:=obj_description('public.sync_event_datetime_to_current_bookings()'::regprocedure,'pg_proc')::jsonb->'rollback_candidate_update';
 IF saved IS NULL OR NOT saved ?& ARRAY['anon','authenticated'] THEN RAISE EXCEPTION 'Missing original candidate UPDATE ACL'; END IF;
 FOREACH target_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF (saved->>target_role)::boolean THEN EXECUTE format('GRANT UPDATE ON TABLE public.private_group_candidate_dates TO %I',target_role);
  ELSE EXECUTE format('REVOKE UPDATE ON TABLE public.private_group_candidate_dates FROM %I',target_role); END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS sync_event_datetime_to_current_bookings ON public.schedule_events;
DROP FUNCTION IF EXISTS public.sync_event_datetime_to_current_bookings();

CREATE OR REPLACE FUNCTION public.enforce_private_group_candidate_deadline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE g RECORD;
BEGIN
 IF TG_OP='UPDATE' AND NEW.date IS NOT DISTINCT FROM OLD.date AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id THEN RETURN NEW; END IF;
 SELECT organization_id,COALESCE(scenario_master_id,scenario_id) AS scenario_id INTO g FROM public.private_groups WHERE id=NEW.group_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRIVATE_GROUP_NOT_FOUND' USING ERRCODE='P0045'; END IF;
 PERFORM public.assert_private_booking_candidate_date(g.organization_id,g.scenario_id,NEW.date);
 RETURN NEW;
END;
$function$;

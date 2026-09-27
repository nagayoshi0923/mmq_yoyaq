DROP TRIGGER IF EXISTS sync_event_datetime_to_current_bookings ON public.schedule_events;
DROP FUNCTION IF EXISTS public.sync_event_datetime_to_current_bookings();
GRANT UPDATE ON TABLE public.private_group_candidate_dates TO anon,authenticated;

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

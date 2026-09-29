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
 -- Only a nested event synchronization may move an already confirmed candidate
 -- inside the new-request deadline. Direct candidate RPCs remain subject to it.
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND NEW.group_id=OLD.group_id AND EXISTS (
   SELECT 1 FROM public.private_groups pg JOIN public.reservations r ON r.id=pg.reservation_id
   JOIN public.schedule_events e ON e.id=r.schedule_event_id
   WHERE pg.id=NEW.group_id AND pg.status='confirmed' AND r.private_group_id=pg.id
    AND r.organization_id=pg.organization_id AND e.organization_id=pg.organization_id
    AND r.status IN ('confirmed','gm_confirmed','checked_in','completed')
    AND e.date=NEW.date AND e.start_time=NEW.start_time::time AND e.end_time=NEW.end_time::time
 ) THEN RETURN NEW; END IF;
 PERFORM public.assert_private_booking_candidate_date(g.organization_id,g.scenario_id,NEW.date);
 RETURN NEW;
END;
$function$;

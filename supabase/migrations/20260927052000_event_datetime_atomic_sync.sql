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

-- Keep the event and its current reservation/candidate dates in one transaction.
-- No historical rows are backfilled and no RLS policies are changed.
CREATE FUNCTION public.sync_event_datetime_to_current_bookings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; g record; candidate_ids uuid[];
BEGIN
 IF NEW.date IS NOT DISTINCT FROM OLD.date AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
    AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time AND NEW.time_slot IS NOT DISTINCT FROM OLD.time_slot THEN RETURN NEW; END IF;
 IF NEW.organization_id IS NULL OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
  RAISE EXCEPTION 'EVENT_BOOKING_ORGANIZATION_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.reservations WHERE schedule_event_id=NEW.id
    AND organization_id IS DISTINCT FROM NEW.organization_id) THEN
  RAISE EXCEPTION 'EVENT_BOOKING_ORGANIZATION_MISMATCH' USING ERRCODE='23514';
 END IF;
 FOR r IN SELECT id,private_group_id FROM public.reservations
   WHERE schedule_event_id=NEW.id AND organization_id=NEW.organization_id
     AND status IN ('pending','confirmed','gm_confirmed','checked_in','completed') ORDER BY id FOR UPDATE NOWAIT LOOP
  UPDATE public.reservations SET requested_datetime=(NEW.date::text||' '||NEW.start_time::text)::timestamp AT TIME ZONE 'Asia/Tokyo'
   WHERE id=r.id AND organization_id=NEW.organization_id;
  IF r.private_group_id IS NULL THEN CONTINUE; END IF;
  SELECT id,organization_id,reservation_id INTO g FROM public.private_groups WHERE id=r.private_group_id FOR UPDATE NOWAIT;
  IF NOT FOUND OR g.organization_id IS DISTINCT FROM NEW.organization_id THEN
   RAISE EXCEPTION 'EVENT_PRIVATE_GROUP_ORGANIZATION_MISMATCH' USING ERRCODE='23514';
  END IF;
  -- A superseded reservation must not rewrite the current group's candidate dates.
  IF g.reservation_id IS DISTINCT FROM r.id THEN CONTINUE; END IF;
  PERFORM c.id FROM public.private_group_candidate_dates c WHERE c.group_id=g.id
   AND c.date=OLD.date AND c.start_time::time=OLD.start_time::time AND c.status IS DISTINCT FROM 'rejected'
   ORDER BY c.id FOR UPDATE NOWAIT;
  SELECT array_agg(c.id ORDER BY c.id) INTO candidate_ids FROM public.private_group_candidate_dates c
   WHERE c.group_id=g.id AND c.date=OLD.date AND c.start_time::time=OLD.start_time::time
     AND c.status IS DISTINCT FROM 'rejected';
  IF coalesce(cardinality(candidate_ids),0)>1 THEN
   RAISE EXCEPTION 'EVENT_PRIVATE_CANDIDATE_AMBIGUOUS' USING ERRCODE='23514';
  END IF;
  -- No exact match: preserve the original proposals, never choose the first same-day row.
  IF cardinality(candidate_ids)=1 THEN
   UPDATE public.private_group_candidate_dates SET date=NEW.date,start_time=NEW.start_time::text,end_time=NEW.end_time::text,
    time_slot=CASE NEW.time_slot WHEN '朝' THEN '午前' WHEN '昼' THEN '午後' WHEN '夜' THEN '夜間' ELSE time_slot END
    WHERE id=candidate_ids[1] AND group_id=g.id;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_event_datetime_to_current_bookings() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_event_datetime_to_current_bookings AFTER UPDATE OF date,start_time,end_time,time_slot
 ON public.schedule_events FOR EACH ROW EXECUTE FUNCTION public.sync_event_datetime_to_current_bookings();

-- Old browser bundles must not apply a second, same-day fallback update after the trigger.
DO $$ BEGIN
 EXECUTE format('COMMENT ON FUNCTION public.sync_event_datetime_to_current_bookings() IS %L',
  jsonb_build_object('rollback_candidate_update',jsonb_build_object(
   'anon',has_table_privilege('anon','public.private_group_candidate_dates','UPDATE'),
   'authenticated',has_table_privilege('authenticated','public.private_group_candidate_dates','UPDATE')))::text);
END $$;
REVOKE UPDATE ON TABLE public.private_group_candidate_dates FROM anon,authenticated;

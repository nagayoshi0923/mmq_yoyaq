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

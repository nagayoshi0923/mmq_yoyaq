-- QW-20260917-001 A11: wait for the event lock before taking the aggregate snapshot.
-- Existing discrepancies are not backfilled: their operational meaning remains unverified.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.recalc_current_participants_for_event(p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
BEGIN
  -- A subquery inside UPDATE can retain a pre-wait snapshot and overwrite a newer count.
  -- This separate statement obtains the lock first, then the next statement sees committed reservations.
  PERFORM 1 FROM public.schedule_events WHERE id=p_event_id FOR NO KEY UPDATE;
  UPDATE public.schedule_events se
  SET current_participants = coalesce((
    SELECT sum(r.participant_count) FROM public.reservations r
    WHERE r.schedule_event_id=se.id AND r.status IN ('pending','confirmed','gm_confirmed','checked_in')
  ),0)
  WHERE se.id=p_event_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.recalc_current_participants_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
DECLARE event_ids uuid[]; event_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN event_ids:=ARRAY[OLD.schedule_event_id];
  ELSIF TG_OP='UPDATE' THEN event_ids:=ARRAY[OLD.schedule_event_id,NEW.schedule_event_id];
  ELSE event_ids:=ARRAY[NEW.schedule_event_id]; END IF;
  -- Moves between events take the two locks in a stable order.
  PERFORM 1 FROM public.schedule_events WHERE id=ANY(event_ids) ORDER BY id FOR NO KEY UPDATE;
  FOR event_id IN SELECT DISTINCT id FROM unnest(event_ids) id WHERE id IS NOT NULL ORDER BY id LOOP
    PERFORM public.recalc_current_participants_for_event(event_id);
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
COMMIT;

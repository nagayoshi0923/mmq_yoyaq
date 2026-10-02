CREATE OR REPLACE FUNCTION public.recalc_current_participants_for_event(p_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
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
$function$

BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.recalc_current_participants_for_event(p_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
  UPDATE schedule_events se
  SET current_participants = COALESCE((
    SELECT SUM(r.participant_count)
    FROM reservations r
    WHERE r.schedule_event_id = se.id
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in')
  ), 0)
  WHERE se.id = p_event_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.recalc_current_participants_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.schedule_event_id IS NOT NULL THEN
      PERFORM public.recalc_current_participants_for_event(OLD.schedule_event_id);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.schedule_event_id IS DISTINCT FROM NEW.schedule_event_id THEN
    IF OLD.schedule_event_id IS NOT NULL THEN
      PERFORM public.recalc_current_participants_for_event(OLD.schedule_event_id);
    END IF;
    IF NEW.schedule_event_id IS NOT NULL THEN
      PERFORM public.recalc_current_participants_for_event(NEW.schedule_event_id);
    END IF;
  ELSE
    IF NEW.schedule_event_id IS NOT NULL THEN
      PERFORM public.recalc_current_participants_for_event(NEW.schedule_event_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
COMMIT;

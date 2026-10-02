CREATE OR REPLACE FUNCTION public.enforce_performance_recruitment_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE deadline_at timestamptz;
BEGIN
 IF NEW.status NOT IN ('pending','confirmed','gm_confirmed','checked_in') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.schedule_event_id IS NOT DISTINCT FROM OLD.schedule_event_id
   AND OLD.status IN ('pending','confirmed','gm_confirmed','checked_in') AND NEW.participant_count<=OLD.participant_count THEN RETURN NEW; END IF;
 PERFORM 1 FROM schedule_events WHERE id=NEW.schedule_event_id FOR UPDATE;
 SELECT effective_booking_deadline INTO deadline_at FROM get_performance_booking_window(NEW.schedule_event_id);
 IF deadline_at IS NOT NULL AND now()>=deadline_at THEN RAISE EXCEPTION '予約の受付期限を過ぎています' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END;
$function$

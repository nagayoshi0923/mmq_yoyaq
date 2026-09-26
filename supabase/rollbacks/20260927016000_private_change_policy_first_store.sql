BEGIN;
CREATE OR REPLACE FUNCTION public.set_reservation_change_policy_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE scenario_id uuid; is_private boolean; setting_key text; performance_start timestamptz;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT EXISTS(SELECT 1 FROM schedule_events e WHERE e.id=NEW.schedule_event_id
    AND e.organization_id=NEW.organization_id AND (e.category='private' OR e.is_private_booking)) INTO is_private;
  is_private:=is_private OR NEW.private_group_id IS NOT NULL OR NEW.reservation_source='web_private'
    OR COALESCE(NEW.reservation_type IN ('private','private_booking'),false);
  SELECT s.id INTO scenario_id FROM organization_scenarios s WHERE s.organization_id=NEW.organization_id
    AND s.scenario_master_id=NEW.scenario_master_id LIMIT 1;
  setting_key:=CASE WHEN is_private THEN 'private_reservation_change_deadline_hours' ELSE 'reservation_change_deadline_hours' END;
  NEW.reservation_change_deadline_hours_snapshot:=(public.resolve_operating_setting(NEW.organization_id,setting_key,'null'::jsonb,NEW.store_id,scenario_id,NEW.schedule_event_id)->>'value')::integer;
 ELSE
  NEW.reservation_change_deadline_hours_snapshot:=OLD.reservation_change_deadline_hours_snapshot;
  IF NEW.participant_count IS DISTINCT FROM OLD.participant_count
    AND OLD.reservation_change_deadline_hours_snapshot IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM staff WHERE user_id=auth.uid() AND organization_id=OLD.organization_id AND status='active')
    AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND organization_id=OLD.organization_id AND role='admin') THEN
   SELECT (e.date + e.start_time) AT TIME ZONE 'Asia/Tokyo' INTO performance_start
    FROM schedule_events e WHERE e.id=OLD.schedule_event_id AND e.organization_id=OLD.organization_id;
   performance_start:=COALESCE(performance_start,OLD.requested_datetime);
   IF performance_start IS NULL OR now() >= performance_start - make_interval(hours=>OLD.reservation_change_deadline_hours_snapshot) THEN
    RAISE EXCEPTION 'RESERVATION_CHANGE_DEADLINE_PASSED' USING ERRCODE='P0050';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $function$;
ALTER TABLE public.reservations DROP COLUMN reservation_change_policy_snapshot_version;
COMMIT;

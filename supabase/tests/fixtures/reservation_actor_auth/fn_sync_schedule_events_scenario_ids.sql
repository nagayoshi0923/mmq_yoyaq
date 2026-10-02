CREATE OR REPLACE FUNCTION public.fn_sync_schedule_events_scenario_ids()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.scenario_master_id IS NOT NULL AND NEW.scenario_id IS NULL THEN
      NEW.scenario_id := NEW.scenario_master_id;
    ELSIF NEW.scenario_id IS NOT NULL AND NEW.scenario_master_id IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.scenario_masters WHERE id = NEW.scenario_id) THEN
        NEW.scenario_master_id := NEW.scenario_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.scenario_master_id IS DISTINCT FROM OLD.scenario_master_id THEN
      NEW.scenario_id := NEW.scenario_master_id;
    ELSIF NEW.scenario_id IS DISTINCT FROM OLD.scenario_id THEN
      IF EXISTS (SELECT 1 FROM public.scenario_masters WHERE id = NEW.scenario_id) THEN
        NEW.scenario_master_id := NEW.scenario_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$

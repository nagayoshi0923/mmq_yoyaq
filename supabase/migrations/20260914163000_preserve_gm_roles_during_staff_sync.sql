-- QW-20260914-004: prevent recursive legacy synchronization from changing GM roles.
BEGIN;
CREATE OR REPLACE FUNCTION public.sync_staff_to_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_scenario_id TEXT;
BEGIN
  -- Assignment rows are canonical. Do not echo their staff-cache updates back
  -- into assignments, which would overwrite precise main/sub GM flags.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- special_scenarios に追加
  FOR v_scenario_id IN SELECT unnest(COALESCE(NEW.special_scenarios, ARRAY[]::TEXT[])) EXCEPT SELECT unnest(COALESCE(OLD.special_scenarios, ARRAY[]::TEXT[]))
  LOOP
    INSERT INTO staff_scenario_assignments (staff_id, scenario_id, organization_id, can_main_gm, can_sub_gm, is_experienced)
    VALUES (NEW.id, v_scenario_id::UUID, NEW.organization_id, true, true, false)
    ON CONFLICT (staff_id, scenario_id) 
    DO UPDATE SET can_main_gm = true, can_sub_gm = true;
  END LOOP;
  
  -- special_scenarios から削除
  FOR v_scenario_id IN SELECT unnest(COALESCE(OLD.special_scenarios, ARRAY[]::TEXT[])) EXCEPT SELECT unnest(COALESCE(NEW.special_scenarios, ARRAY[]::TEXT[]))
  LOOP
    UPDATE staff_scenario_assignments 
    SET can_main_gm = false, can_sub_gm = false
    WHERE staff_id = NEW.id AND staff_scenario_assignments.scenario_id = v_scenario_id::UUID;
  END LOOP;
  
  -- available_scenarios に追加
  FOR v_scenario_id IN SELECT unnest(COALESCE(NEW.available_scenarios, ARRAY[]::TEXT[])) EXCEPT SELECT unnest(COALESCE(OLD.available_scenarios, ARRAY[]::TEXT[]))
  LOOP
    INSERT INTO staff_scenario_assignments (staff_id, scenario_id, organization_id, can_main_gm, can_sub_gm, is_experienced)
    VALUES (NEW.id, v_scenario_id::UUID, NEW.organization_id, false, false, true)
    ON CONFLICT (staff_id, scenario_id) 
    DO UPDATE SET is_experienced = true;
  END LOOP;
  
  -- available_scenarios から削除
  FOR v_scenario_id IN SELECT unnest(COALESCE(OLD.available_scenarios, ARRAY[]::TEXT[])) EXCEPT SELECT unnest(COALESCE(NEW.available_scenarios, ARRAY[]::TEXT[]))
  LOOP
    UPDATE staff_scenario_assignments 
    SET is_experienced = false
    WHERE staff_id = NEW.id AND staff_scenario_assignments.scenario_id = v_scenario_id::UUID;
  END LOOP;
  
  RETURN NEW;
END;
$function$;
COMMIT;

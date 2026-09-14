-- Production definitions captured 2026-09-14 before QW-20260914-004. No data.
CREATE OR REPLACE FUNCTION public.fn_sync_ssa_scenario_ids()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.scenario_master_id IS NOT NULL AND NEW.scenario_id IS NULL THEN
      NEW.scenario_id := NEW.scenario_master_id;
    ELSIF NEW.scenario_id IS NOT NULL AND NEW.scenario_master_id IS NULL THEN
      NEW.scenario_master_id := NEW.scenario_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.scenario_master_id IS DISTINCT FROM OLD.scenario_master_id THEN
      NEW.scenario_id := NEW.scenario_master_id;
    ELSIF NEW.scenario_id IS DISTINCT FROM OLD.scenario_id THEN
      NEW.scenario_master_id := NEW.scenario_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_assignments_to_staff()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (NEW.can_main_gm = true OR NEW.can_sub_gm = true) THEN
    UPDATE staff
    SET special_scenarios = array_append(
      array_remove(COALESCE(special_scenarios, ARRAY[]::TEXT[]), NEW.scenario_id::TEXT),
      NEW.scenario_id::TEXT
    )
    WHERE id = NEW.staff_id
      AND NOT (NEW.scenario_id::TEXT = ANY(COALESCE(special_scenarios, ARRAY[]::TEXT[])));
  ELSIF (COALESCE(NEW.can_main_gm, false) = false AND COALESCE(NEW.can_sub_gm, false) = false) THEN
    UPDATE staff
    SET special_scenarios = array_remove(COALESCE(special_scenarios, ARRAY[]::TEXT[]), NEW.scenario_id::TEXT)
    WHERE id = NEW.staff_id;
  END IF;
  
  IF (NEW.is_experienced = true) THEN
    UPDATE staff
    SET available_scenarios = array_append(
      array_remove(COALESCE(available_scenarios, ARRAY[]::TEXT[]), NEW.scenario_id::TEXT),
      NEW.scenario_id::TEXT
    )
    WHERE id = NEW.staff_id
      AND NOT (NEW.scenario_id::TEXT = ANY(COALESCE(available_scenarios, ARRAY[]::TEXT[])));
  ELSIF (COALESCE(NEW.is_experienced, false) = false) THEN
    UPDATE staff
    SET available_scenarios = array_remove(COALESCE(available_scenarios, ARRAY[]::TEXT[]), NEW.scenario_id::TEXT)
    WHERE id = NEW.staff_id;
  END IF;
  
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_staff_to_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_scenario_id TEXT;
BEGIN
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

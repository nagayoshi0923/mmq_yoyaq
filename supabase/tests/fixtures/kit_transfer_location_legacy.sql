CREATE OR REPLACE FUNCTION public.sync_kit_location_on_transfer_complete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- ステータスが 'completed' に変更された場合、キット位置を更新
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    INSERT INTO scenario_kit_locations (organization_id, scenario_id, kit_number, store_id)
    VALUES (NEW.organization_id, NEW.scenario_id, NEW.kit_number, NEW.to_store_id)
    ON CONFLICT (organization_id, scenario_id, kit_number)
    DO UPDATE SET 
      store_id = EXCLUDED.store_id,
      updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$function$
;

-- FK検査のKEY SHAREと競合せず、同じスタッフの派生キャッシュ更新を直列化する。
BEGIN;
CREATE OR REPLACE FUNCTION public.sync_assignments_to_staff()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $function$
DECLARE target uuid; targets uuid[];
BEGIN
  IF TG_OP='INSERT' THEN targets:=ARRAY[NEW.staff_id];
  ELSIF TG_OP='DELETE' THEN targets:=ARRAY[OLD.staff_id];
  ELSE targets:=ARRAY[OLD.staff_id,NEW.staff_id]; END IF;
  FOR target IN SELECT DISTINCT x FROM unnest(targets) x ORDER BY x LOOP
    PERFORM 1 FROM public.staff WHERE id=target FOR NO KEY UPDATE;
    UPDATE public.staff SET
      special_scenarios=coalesce((SELECT array_agg(DISTINCT scenario_master_id::text ORDER BY scenario_master_id::text)
        FROM public.staff_scenario_assignments WHERE staff_id=target AND (can_main_gm OR can_sub_gm)),'{}'::text[]),
      available_scenarios=coalesce((SELECT array_agg(DISTINCT scenario_master_id::text ORDER BY scenario_master_id::text)
        FROM public.staff_scenario_assignments WHERE staff_id=target AND is_experienced),'{}'::text[])
      WHERE id=target;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
COMMIT;

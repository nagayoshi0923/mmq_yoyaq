-- 担当表を正本にし、staff旧配列は読取互換用の派生値だけにする。
-- 過去データ・RLS・担当フラグ・履歴は変更しない。
BEGIN;
CREATE OR REPLACE FUNCTION public.sync_staff_to_assignments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE gm text[]; played text[];
BEGIN
  IF TG_OP='UPDATE' AND (NEW.special_scenarios,NEW.available_scenarios)
    IS NOT DISTINCT FROM (OLD.special_scenarios,OLD.available_scenarios) THEN RETURN NEW; END IF;
  SELECT coalesce(array_agg(DISTINCT scenario_master_id::text ORDER BY scenario_master_id::text)
      FILTER(WHERE can_main_gm OR can_sub_gm),'{}'::text[]),
    coalesce(array_agg(DISTINCT scenario_master_id::text ORDER BY scenario_master_id::text)
      FILTER(WHERE is_experienced),'{}'::text[])
  INTO gm,played FROM public.staff_scenario_assignments WHERE staff_id=NEW.id;
  IF coalesce(NEW.special_scenarios,'{}'::text[]) IS DISTINCT FROM gm
    OR coalesce(NEW.available_scenarios,'{}'::text[]) IS DISTINCT FROM played THEN
    RAISE EXCEPTION '担当作品・体験済み作品は担当設定から変更してください' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_assignments_to_staff()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $function$
DECLARE target uuid; targets uuid[];
BEGIN
  IF TG_OP='INSERT' THEN targets:=ARRAY[NEW.staff_id];
  ELSIF TG_OP='DELETE' THEN targets:=ARRAY[OLD.staff_id];
  ELSE targets:=ARRAY[OLD.staff_id,NEW.staff_id]; END IF;
  FOR target IN SELECT DISTINCT x FROM unnest(targets) x ORDER BY x LOOP
    PERFORM 1 FROM public.staff WHERE id=target FOR UPDATE;
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
DROP TRIGGER sync_staff_to_assignments_trigger ON public.staff;
CREATE TRIGGER sync_staff_to_assignments_trigger BEFORE INSERT OR UPDATE OF special_scenarios,available_scenarios
ON public.staff FOR EACH ROW EXECUTE FUNCTION public.sync_staff_to_assignments();
DROP TRIGGER sync_assignments_to_staff_trigger ON public.staff_scenario_assignments;
CREATE TRIGGER sync_assignments_to_staff_trigger AFTER INSERT OR UPDATE OR DELETE
ON public.staff_scenario_assignments FOR EACH ROW EXECUTE FUNCTION public.sync_assignments_to_staff();
COMMIT;

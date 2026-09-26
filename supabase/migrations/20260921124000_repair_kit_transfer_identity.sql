-- QW-20260917-001: finish the existing org_scenario_id migration for kit moves.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.normalize_kit_transfer_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE master_id uuid; org_scenario uuid;
BEGIN
  IF NEW.org_scenario_id IS NOT NULL THEN
    SELECT scenario_master_id,id INTO master_id,org_scenario FROM public.organization_scenarios
      WHERE id=NEW.org_scenario_id AND organization_id=NEW.organization_id FOR SHARE;
  ELSE
    SELECT scenario_master_id,id INTO master_id,org_scenario FROM public.organization_scenarios
      WHERE scenario_master_id=NEW.scenario_master_id AND organization_id=NEW.organization_id FOR SHARE;
  END IF;
  IF master_id IS NULL OR org_scenario IS NULL THEN
    RAISE EXCEPTION '移動する作品を組織内で確認できません' USING ERRCODE='23514';
  END IF;
  IF NEW.scenario_master_id IS NOT NULL AND NEW.scenario_master_id<>master_id THEN
    RAISE EXCEPTION '移動する作品の参照IDが一致しません' USING ERRCODE='23514';
  END IF;
  IF NEW.kit_number IS NULL OR NEW.kit_number<1 THEN
    RAISE EXCEPTION 'キット番号は1以上で指定してください' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=NEW.from_store_id AND organization_id=NEW.organization_id)
    OR NOT EXISTS(SELECT 1 FROM public.stores WHERE id=NEW.to_store_id AND organization_id=NEW.organization_id) THEN
    RAISE EXCEPTION '移動元・移動先は同じ組織の店舗を指定してください' USING ERRCODE='23514';
  END IF;
  NEW.scenario_master_id:=master_id;
  NEW.org_scenario_id:=org_scenario;
  RETURN NEW;
END $$;
CREATE TRIGGER normalize_kit_transfer_identity BEFORE INSERT OR UPDATE ON public.kit_transfer_events
FOR EACH ROW EXECUTE FUNCTION public.normalize_kit_transfer_identity();
REVOKE ALL ON FUNCTION public.normalize_kit_transfer_identity() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sync_kit_location_on_transfer_complete() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.status='completed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO public.scenario_kit_locations(organization_id,org_scenario_id,scenario_master_id,kit_number,store_id)
    VALUES(NEW.organization_id,NEW.org_scenario_id,NEW.scenario_master_id,NEW.kit_number,NEW.to_store_id)
    ON CONFLICT(organization_id,org_scenario_id,kit_number)
    DO UPDATE SET store_id=EXCLUDED.store_id,scenario_master_id=EXCLUDED.scenario_master_id,updated_at=now();
  END IF;
  RETURN NEW;
END $$;
-- Match the existing mandatory master reference; SET NULL conflicted with NOT NULL.
ALTER TABLE public.kit_transfer_events DROP CONSTRAINT kit_transfer_events_scenario_master_id_fkey;
ALTER TABLE public.kit_transfer_events ADD CONSTRAINT kit_transfer_events_scenario_master_id_fkey
FOREIGN KEY(scenario_master_id) REFERENCES public.scenario_masters(id) ON DELETE RESTRICT;
COMMIT;

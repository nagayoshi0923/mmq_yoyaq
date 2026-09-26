-- 認証・項目の型検証は管理者限定API。ここでも所属と楽観ロックを強制する。
CREATE OR REPLACE FUNCTION public.save_operating_setting_overrides(
  p_organization_id uuid,
  p_scope text,
  p_target_id uuid,
  p_values jsonb,
  p_expected_revision bigint
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_scenario uuid;
  v_event uuid;
  v_revision bigint;
BEGIN
  IF p_values IS NULL OR jsonb_typeof(p_values) <> 'object'
    OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid setting update' USING ERRCODE = '22023';
  END IF;
  IF p_scope = 'organization' THEN
    IF p_target_id IS DISTINCT FROM p_organization_id
      OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
      RAISE EXCEPTION 'organization not found' USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope = 'store' THEN
    SELECT id INTO v_store FROM public.stores
      WHERE id = p_target_id AND organization_id = p_organization_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'store not found' USING ERRCODE = '42501'; END IF;
  ELSIF p_scope = 'scenario' THEN
    SELECT id INTO v_scenario FROM public.organization_scenarios
      WHERE id = p_target_id AND organization_id = p_organization_id;
    IF v_scenario IS NULL THEN RAISE EXCEPTION 'scenario not found' USING ERRCODE = '42501'; END IF;
  ELSIF p_scope = 'performance' THEN
    SELECT id INTO v_event FROM public.schedule_events
      WHERE id = p_target_id AND organization_id = p_organization_id;
    IF v_event IS NULL THEN RAISE EXCEPTION 'performance not found' USING ERRCODE = '42501'; END IF;
  ELSE
    RAISE EXCEPTION 'invalid setting scope' USING ERRCODE = '22023';
  END IF;

  IF p_expected_revision = 0 THEN
    INSERT INTO public.operating_setting_overrides
      (organization_id, store_id, organization_scenario_id, schedule_event_id, settings)
    VALUES (p_organization_id, v_store, v_scenario, v_event, p_values)
    ON CONFLICT (organization_id, store_id, organization_scenario_id, schedule_event_id) DO NOTHING
    RETURNING revision INTO v_revision;
  ELSE
    UPDATE public.operating_setting_overrides s
    SET settings = s.settings || p_values, revision = s.revision + 1, updated_at = now()
    WHERE s.organization_id = p_organization_id
      AND s.store_id IS NOT DISTINCT FROM v_store
      AND s.organization_scenario_id IS NOT DISTINCT FROM v_scenario
      AND s.schedule_event_id IS NOT DISTINCT FROM v_event
      AND s.revision = p_expected_revision
    RETURNING s.revision INTO v_revision;
  END IF;
  IF v_revision IS NULL THEN
    RAISE EXCEPTION 'settings changed; reload before saving' USING ERRCODE = '40001';
  END IF;
  RETURN v_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.save_operating_setting_overrides(uuid, text, uuid, jsonb, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_operating_setting_overrides(uuid, text, uuid, jsonb, bigint) TO service_role;

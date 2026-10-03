-- #714: 公開のキャンセル規定に出す中止判定のルールを、実際の判定と同じ設定から作るための公開の読み取り（社長判断 2026-10-04）。
-- 判定時刻（judgment_minutes_before）と追加募集の有無・条件・期限を、実際の判定（check_performances_with_recruitment_deadlines）と
-- 同じ解決順（組織共通 → 店舗 → 作品 → 公演）で店舗ごとに返す。個人情報は含まない。
CREATE OR REPLACE FUNCTION public.get_public_performance_judgment(
  p_organization_slug text, p_store_id uuid DEFAULT NULL, p_scenario_master_id uuid DEFAULT NULL, p_event_id uuid DEFAULT NULL
) RETURNS TABLE(store_id uuid, judgment_minutes integer, extension_enabled boolean, target_mode text, target_value integer, extension_deadline_minutes integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_master uuid := p_scenario_master_id; v_event_store uuid; v_os public.organization_scenarios%ROWTYPE;
  v_one_seat boolean; v_pol_missing integer; v_enabled boolean; v_mode text; v_value integer; v_deadline integer;
BEGIN
  SELECT o.id INTO v_org FROM public.organizations o WHERE o.slug=p_organization_slug AND o.is_active IS TRUE;
  IF v_org IS NULL THEN RETURN; END IF;
  IF p_event_id IS NOT NULL THEN
    SELECT se.store_id, coalesce(se.scenario_master_id,se.scenario_id) INTO v_event_store, v_master
      FROM public.schedule_events se WHERE se.id=p_event_id AND se.organization_id=v_org;
    IF NOT FOUND THEN RETURN; END IF;
  END IF;
  IF v_master IS NOT NULL THEN
    SELECT * INTO v_os FROM public.organization_scenarios os WHERE os.organization_id=v_org AND os.scenario_master_id=v_master LIMIT 1;
  END IF;
  SELECT p.one_seat_enabled, p.max_missing_participants INTO v_one_seat, v_pol_missing FROM public.performance_recruitment_policies p WHERE p.organization_id=v_org;
  SELECT c.enabled, c.mode, c.value, c.deadline_minutes INTO v_enabled, v_mode, v_value, v_deadline FROM public.organization_recruitment_settings c WHERE c.organization_id=v_org;
  RETURN QUERY
  SELECT s.id,
    (CASE WHEN p_event_id IS NOT NULL AND s.id=v_event_store
      THEN public.resolve_operating_setting(v_org,'judgment_minutes_before','240'::jsonb,NULL,NULL,p_event_id)
      ELSE public.resolve_operating_setting(v_org,'judgment_minutes_before','240'::jsonb,s.id,v_os.id,NULL) END->>'value')::integer,
    coalesce(v_one_seat,false) AND CASE WHEN v_os.recruitment_enabled_source='custom' THEN coalesce(v_os.recruitment_extension_enabled,false) ELSE coalesce(v_enabled,true) END,
    CASE WHEN v_os.recruitment_target_source='custom' THEN v_os.recruitment_target_mode ELSE coalesce(v_mode,'count') END,
    CASE WHEN v_os.recruitment_target_source='custom' THEN v_os.recruitment_target_value ELSE coalesce(v_value,v_os.recruitment_max_missing,v_pol_missing,2) END,
    CASE WHEN v_os.recruitment_deadline_source='custom' THEN v_os.recruitment_deadline_minutes ELSE coalesce(v_deadline,90) END
  FROM public.stores s
  WHERE s.organization_id=v_org AND s.status='active' AND (p_store_id IS NULL OR s.id=p_store_id);
END $$;
REVOKE ALL ON FUNCTION public.get_public_performance_judgment(text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_performance_judgment(text,uuid,uuid,uuid) TO anon,authenticated,service_role;

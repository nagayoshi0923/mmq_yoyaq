-- 貸切締切: 組織共通 → シナリオ個別指定。NULL は継承、0 は当日まで。
CREATE OR REPLACE FUNCTION public.get_effective_private_booking_deadline_days(
  p_organization_id UUID DEFAULT NULL,
  p_organization_slug TEXT DEFAULT NULL,
  p_scenario_id UUID DEFAULT NULL
)
RETURNS INTEGER LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org UUID;
  common_days INTEGER;
  custom_days INTEGER;
BEGIN
  SELECT id INTO org FROM public.organizations
  WHERE (p_organization_id IS NULL OR id = p_organization_id)
    AND (p_organization_slug IS NULL OR slug = p_organization_slug)
    AND (p_organization_id IS NOT NULL OR p_organization_slug IS NOT NULL);
  IF org IS NULL THEN RETURN 14; END IF;
  SELECT private_booking_deadline_days INTO common_days FROM public.global_settings WHERE organization_id = org;
  common_days := COALESCE(common_days, 14);
  IF p_scenario_id IS NOT NULL THEN
    SELECT os.private_booking_deadline_days INTO custom_days
    FROM public.organization_scenarios os
    WHERE os.organization_id = org
      AND (os.scenario_master_id = p_scenario_id OR os.id = p_scenario_id
        OR os.scenario_master_id = (SELECT s.scenario_master_id FROM public.scenarios s WHERE s.id = p_scenario_id AND s.organization_id = org));
    IF NOT FOUND THEN RAISE EXCEPTION 'SCENARIO_NOT_FOUND'; END IF;
    RETURN COALESCE(custom_days, common_days);
  END IF;
  -- 作品未選択の入口は、個別設定で受付可能な作品を隠さない。
  -- 作品選択後に必ずその作品の締切で再判定する。
  SELECT MIN(COALESCE(private_booking_deadline_days, common_days)) INTO custom_days
  FROM public.organization_scenarios WHERE organization_id = org AND org_status = 'available';
  RETURN COALESCE(custom_days, common_days);
END;
$$;
REVOKE ALL ON FUNCTION public.get_effective_private_booking_deadline_days(UUID,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_effective_private_booking_deadline_days(UUID,TEXT,UUID) TO anon,authenticated,service_role;

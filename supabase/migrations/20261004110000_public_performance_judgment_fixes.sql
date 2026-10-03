-- #870: 公開の中止判定の読み取りを、実際の判定と同じ条件に合わせる
-- #714: 公開のキャンセル規定に出す中止判定のルールを、実際の判定と同じ設定から作るための公開の読み取り（社長判断 2026-10-04）。
-- 判定時刻（judgment_minutes_before）と追加募集の有無・条件・期限を、実際の判定（check_performances_with_recruitment_deadlines）と
-- 同じ解決順（組織共通 → 店舗 → 作品 → 公演）で店舗ごとに返す。個人情報は含まない。
-- #870: 公開承認済みの組織だけ返す。公演の作品は organization_scenario_id を優先して解決する。
-- 追加募集を案内済みの公演は、保存済みの条件（あと何人まで・期限）を返す。
-- 期限が判定時刻と同じかそれより前なら、実際には延長されないので追加募集なしとして返す。
CREATE OR REPLACE FUNCTION public.get_public_performance_judgment(
  p_organization_slug text, p_store_id uuid DEFAULT NULL, p_scenario_master_id uuid DEFAULT NULL, p_event_id uuid DEFAULT NULL
) RETURNS TABLE(store_id uuid, judgment_minutes integer, extension_enabled boolean, target_mode text, target_value integer, extension_deadline_minutes integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_master uuid := p_scenario_master_id; v_event_store uuid; v_event_os uuid; v_event_at timestamptz;
  v_os public.organization_scenarios%ROWTYPE;
  v_one_seat boolean; v_pol_missing integer; v_enabled boolean; v_mode text; v_value integer; v_deadline integer;
  v_saved_deadline timestamptz; v_saved_missing integer;
BEGIN
  SELECT o.id INTO v_org FROM public.organizations o
    WHERE o.slug=p_organization_slug AND o.is_active IS TRUE AND o.booking_site_status='approved';
  IF v_org IS NULL THEN RETURN; END IF;
  IF p_event_id IS NOT NULL THEN
    SELECT se.store_id, se.organization_scenario_id, coalesce(se.scenario_master_id,se.scenario_id),
        (se.date::text||' '||se.start_time::text||'+09:00')::timestamptz
      INTO v_event_store, v_event_os, v_master, v_event_at
      FROM public.schedule_events se WHERE se.id=p_event_id AND se.organization_id=v_org;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT rd.deadline, rd.max_missing_participants INTO v_saved_deadline, v_saved_missing
      FROM public.performance_recruitment_deadlines rd WHERE rd.schedule_event_id=p_event_id AND rd.organization_id=v_org;
  END IF;
  IF v_event_os IS NOT NULL THEN
    SELECT * INTO v_os FROM public.organization_scenarios os WHERE os.organization_id=v_org AND os.id=v_event_os;
  ELSIF v_master IS NOT NULL THEN
    SELECT * INTO v_os FROM public.organization_scenarios os WHERE os.organization_id=v_org AND os.scenario_master_id=v_master LIMIT 1;
  END IF;
  SELECT p.one_seat_enabled, p.max_missing_participants INTO v_one_seat, v_pol_missing FROM public.performance_recruitment_policies p WHERE p.organization_id=v_org;
  SELECT c.enabled, c.mode, c.value, c.deadline_minutes INTO v_enabled, v_mode, v_value, v_deadline FROM public.organization_recruitment_settings c WHERE c.organization_id=v_org;
  RETURN QUERY
  SELECT b.sid, b.jm,
    CASE WHEN b.saved THEN true ELSE b.en AND b.dm < b.jm END,
    CASE WHEN b.saved AND v_saved_missing IS NOT NULL THEN 'count' ELSE b.tm END,
    CASE WHEN b.saved AND v_saved_missing IS NOT NULL THEN v_saved_missing ELSE b.tv END,
    CASE WHEN b.saved THEN greatest(0, floor(extract(epoch FROM (v_event_at - v_saved_deadline))/60))::integer ELSE b.dm END
  FROM (
    SELECT s.id AS sid,
      (CASE WHEN p_event_id IS NOT NULL AND s.id=v_event_store
        THEN public.resolve_operating_setting(v_org,'judgment_minutes_before','240'::jsonb,NULL,NULL,p_event_id)
        ELSE public.resolve_operating_setting(v_org,'judgment_minutes_before','240'::jsonb,s.id,v_os.id,NULL) END->>'value')::integer AS jm,
      coalesce(v_one_seat,false) AND CASE WHEN v_os.recruitment_enabled_source='custom' THEN coalesce(v_os.recruitment_extension_enabled,false) ELSE coalesce(v_enabled,true) END AS en,
      CASE WHEN v_os.recruitment_target_source='custom' THEN v_os.recruitment_target_mode ELSE coalesce(v_mode,'count') END AS tm,
      CASE WHEN v_os.recruitment_target_source='custom' THEN v_os.recruitment_target_value ELSE coalesce(v_value,v_os.recruitment_max_missing,v_pol_missing,2) END AS tv,
      CASE WHEN v_os.recruitment_deadline_source='custom' THEN v_os.recruitment_deadline_minutes ELSE coalesce(v_deadline,90) END AS dm,
      (p_event_id IS NOT NULL AND s.id=v_event_store AND v_saved_deadline IS NOT NULL) AS saved
    FROM public.stores s
    WHERE s.organization_id=v_org AND s.status='active' AND (p_store_id IS NULL OR s.id=p_store_id)
  ) b;
END $$;
REVOKE ALL ON FUNCTION public.get_public_performance_judgment(text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_performance_judgment(text,uuid,uuid,uuid) TO anon,authenticated,service_role;

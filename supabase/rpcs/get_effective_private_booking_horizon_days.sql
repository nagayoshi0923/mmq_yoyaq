-- 貸切を受け付ける範囲（今日から何日先の公演日まで申し込めるか）。I21。
-- 設定の優先順位: MMQ の既定（get_operating_setting_default、180）→ 組織 → 作品 → 公演（後のものが上書き。店舗では指定しない）。
-- 値は operating_setting_overrides のキー private_booking_horizon_days（設定画面: 設定 › 貸切予約の受付締切、作品編集、公演の個別設定。管理者だけ）。
-- p_scenario_id は作品マスタの id でも組織の作品 id でもよい。p_event_id があれば公演から作品をたどる。
-- 作品も公演も無い（作品未選択の入口: 公開カレンダー・リスト）ときは、個別指定で受け付ける作品を隠さないよう、
-- 組織の値と、公開中の作品の個別指定のうち最も長い日数を返す（作品を選んだあとに必ずその作品の値で判定し直す。受付締切と同じ考え方）。
-- 判定（保存・空き判定）は assert_private_booking_candidate_date がこの関数を作品付きで呼ぶ。画面は src/lib/privateBookingHorizon.ts。
-- 仕様の正本: docs/product-spec/貸切受付ルール.md
CREATE OR REPLACE FUNCTION public.get_effective_private_booking_horizon_days(
 p_organization_id uuid, p_scenario_id uuid DEFAULT NULL, p_event_id uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_scenario uuid; v_value jsonb; v_days integer; v_max integer;
BEGIN
 IF p_organization_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id) THEN RETURN 180; END IF;
 IF p_event_id IS NOT NULL THEN
  v_value := public.resolve_operating_setting(p_organization_id,'private_booking_horizon_days','180'::jsonb,NULL,NULL,p_event_id)->'value';
 ELSE
  IF p_scenario_id IS NOT NULL THEN
   SELECT s.id INTO v_scenario FROM public.organization_scenarios s WHERE s.organization_id=p_organization_id
    AND (s.id=p_scenario_id OR s.scenario_master_id=p_scenario_id
     OR s.scenario_master_id=(SELECT legacy.scenario_master_id FROM public.scenarios legacy WHERE legacy.id=p_scenario_id AND legacy.organization_id=p_organization_id))
   ORDER BY (s.id=p_scenario_id) DESC, s.created_at LIMIT 1;
  END IF;
  v_value := public.resolve_operating_setting(p_organization_id,'private_booking_horizon_days','180'::jsonb,NULL,v_scenario,NULL)->'value';
 END IF;
 v_days := CASE WHEN jsonb_typeof(v_value)='number' AND (v_value#>>'{}')::numeric BETWEEN 1 AND 180
  AND (v_value#>>'{}')::numeric=trunc((v_value#>>'{}')::numeric) THEN (v_value#>>'{}')::integer ELSE 180 END;
 IF p_scenario_id IS NULL AND p_event_id IS NULL THEN
  SELECT max((o.settings->>'private_booking_horizon_days')::integer) INTO v_max
  FROM public.operating_setting_overrides o JOIN public.organization_scenarios s ON s.id=o.organization_scenario_id
  WHERE o.organization_id=p_organization_id AND o.store_id IS NULL AND o.schedule_event_id IS NULL
   AND s.organization_id=p_organization_id AND s.org_status='available'
   AND jsonb_typeof(o.settings->'private_booking_horizon_days')='number'
   AND (o.settings->>'private_booking_horizon_days') ~ '^[0-9]{1,3}$'
   AND (o.settings->>'private_booking_horizon_days')::integer BETWEEN 1 AND 180;
  v_days := greatest(v_days, coalesce(v_max, v_days));
 END IF;
 RETURN v_days;
END $function$;
REVOKE ALL ON FUNCTION public.get_effective_private_booking_horizon_days(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_effective_private_booking_horizon_days(uuid,uuid,uuid) TO anon,authenticated,service_role;

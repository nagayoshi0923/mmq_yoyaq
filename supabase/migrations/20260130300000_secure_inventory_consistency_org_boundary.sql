-- =============================================================================
-- 20260130300000: 在庫整合性チェック関数の組織境界 + 認可強化（P0）
-- =============================================================================
--
-- 目的:
-- - check_and_fix_inventory_consistency / run_inventory_consistency_check が
--   organization_id を跨いでデータを返し得る（クロステナント）
--
-- 方針:
-- - orgId を引数で明示（p_organization_id）
-- - 一般呼び出しは「自組織のみ」許可（is_organization_member）
-- - admin / service_role は全組織OK（運用・Cron向け）
-- - details は JSON 配列として正しく構築（jsonb_build_array）
-- - orgId は admin/service_role のみ details に含める
--
-- 注意:
-- - Supabase SQL Editor では auth.uid() が null になるため、検証時は疑似JWT設定が必要
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_and_fix_inventory_consistency(p_organization_id UUID DEFAULT NULL)
RETURNS TABLE(
  total_checked INTEGER,
  inconsistencies_found INTEGER,
  auto_fixed INTEGER,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_checked INTEGER := 0;
  v_inconsistencies_found INTEGER := 0;
  v_auto_fixed INTEGER := 0;
  v_details JSONB := '[]'::JSONB;
  v_event_record RECORD;
  v_actual_count INTEGER;
  v_stored_count INTEGER;
  v_difference INTEGER;
  v_max_capacity INTEGER;
  v_corrected_count INTEGER;
  v_is_service_role BOOLEAN := (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  v_is_admin BOOLEAN := is_org_admin();
  v_can_cross_tenant BOOLEAN := FALSE;
BEGIN
  v_can_cross_tenant := v_is_service_role OR v_is_admin;

  -- 🔒 認可: admin/service_role 以外は organization_id 必須 + メンバーのみ
  IF NOT v_can_cross_tenant THEN
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'organization_id_required' USING ERRCODE = 'P0001';
    END IF;
    IF NOT is_organization_member(p_organization_id) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 対象: 過去30日〜未来90日（非キャンセル）
  FOR v_event_record IN
    SELECT 
      se.id,
      se.date,
      se.start_time,
      se.current_participants,
      se.max_participants,
      se.capacity,
      se.organization_id,
      s.title as scenario_title,
      st.name as store_name
    FROM schedule_events se
    LEFT JOIN scenarios s ON se.scenario_id = s.id
    LEFT JOIN stores st ON se.store_id = st.id
    WHERE se.date >= CURRENT_DATE - INTERVAL '30 days'
      AND se.date <= CURRENT_DATE + INTERVAL '90 days'
      AND se.is_cancelled = false
      AND (
        p_organization_id IS NULL
        OR se.organization_id = p_organization_id
      )
    ORDER BY se.date DESC
  LOOP
    v_total_checked := v_total_checked + 1;

    -- 実際の予約数（他RPCと同条件）
    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_actual_count
    FROM reservations
    WHERE schedule_event_id = v_event_record.id
      AND status IN ('pending', 'confirmed', 'gm_confirmed');

    v_stored_count := COALESCE(v_event_record.current_participants, 0);
    v_difference := v_stored_count - v_actual_count;

    v_max_capacity := COALESCE(v_event_record.max_participants, v_event_record.capacity);
    v_corrected_count := LEAST(v_actual_count, v_max_capacity);

    IF v_difference <> 0 THEN
      v_inconsistencies_found := v_inconsistencies_found + 1;

      v_details := v_details || jsonb_build_array(
        jsonb_build_object(
          'event_id', v_event_record.id,
          'date', v_event_record.date,
          'start_time', v_event_record.start_time,
          'scenario_title', v_event_record.scenario_title,
          'store_name', v_event_record.store_name,
          'stored_count', v_stored_count,
          'actual_count', v_actual_count,
          'corrected_count', v_corrected_count,
          'max_capacity', v_max_capacity,
          'difference', v_difference,
          'is_overbooked', v_actual_count > v_max_capacity,
          'organization_id', CASE WHEN v_can_cross_tenant THEN v_event_record.organization_id ELSE NULL END
        )
      );

      UPDATE schedule_events
      SET current_participants = v_corrected_count,
          updated_at = NOW()
      WHERE id = v_event_record.id;

      v_auto_fixed := v_auto_fixed + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_total_checked, v_inconsistencies_found, v_auto_fixed, v_details;
END;
$$;

COMMENT ON FUNCTION public.check_and_fix_inventory_consistency(UUID) IS
'在庫整合性をチェックし、不整合があれば自動修正する。
一般呼び出しは p_organization_id 必須（自組織のみ）。
admin/service_role は p_organization_id NULL で全組織対象。';


CREATE OR REPLACE FUNCTION public.run_inventory_consistency_check(p_organization_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_result RECORD;
  v_execution_time_ms INTEGER;
  v_response JSONB;
  v_is_service_role BOOLEAN := (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  v_is_admin BOOLEAN := is_org_admin();
  v_can_cross_tenant BOOLEAN := FALSE;
BEGIN
  v_can_cross_tenant := v_is_service_role OR v_is_admin;

  -- 🔒 認可: admin/service_role 以外は organization_id 必須 + メンバーのみ
  IF NOT v_can_cross_tenant THEN
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'organization_id_required' USING ERRCODE = 'P0001';
    END IF;
    IF NOT is_organization_member(p_organization_id) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  v_start_time := clock_timestamp();

  SELECT * INTO v_result
  FROM public.check_and_fix_inventory_consistency(p_organization_id);

  v_end_time := clock_timestamp();
  v_execution_time_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER;

  INSERT INTO inventory_consistency_logs (
    total_checked,
    inconsistencies_found,
    auto_fixed,
    details,
    execution_time_ms
  ) VALUES (
    v_result.total_checked,
    v_result.inconsistencies_found,
    v_result.auto_fixed,
    v_result.details,
    v_execution_time_ms
  );

  v_response := jsonb_build_object(
    'success', true,
    'total_checked', v_result.total_checked,
    'inconsistencies_found', v_result.inconsistencies_found,
    'auto_fixed', v_result.auto_fixed,
    'execution_time_ms', v_execution_time_ms,
    'details', v_result.details
  );

  RETURN v_response;
END;
$$;

COMMENT ON FUNCTION public.run_inventory_consistency_check(UUID) IS
'在庫整合性チェックを実行し、結果をログに記録する。
一般呼び出しは p_organization_id 必須（自組織のみ）。
admin/service_role は p_organization_id NULL で全組織対象。';


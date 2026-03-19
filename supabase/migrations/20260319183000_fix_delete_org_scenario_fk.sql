-- ============================================================
-- delete_org_scenario RPC を修正
-- schedule_events の外部キー参照を先に NULL にしてから削除
-- ============================================================

CREATE OR REPLACE FUNCTION delete_org_scenario(
  p_scenario_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_org_id UUID;
  v_user_org_id UUID;
  v_user_id UUID;
  v_title TEXT;
  v_event_count INT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', '認証されていません');
  END IF;

  -- ユーザーの組織IDを取得
  SELECT organization_id INTO v_user_org_id
  FROM users WHERE id = v_user_id LIMIT 1;
  
  IF v_user_org_id IS NULL THEN
    SELECT organization_id INTO v_user_org_id
    FROM staff WHERE user_id = v_user_id LIMIT 1;
  END IF;
  
  -- シナリオ情報を取得
  SELECT os.organization_id, sm.title 
  INTO v_org_id, v_title
  FROM organization_scenarios os
  LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
  WHERE os.id = p_scenario_id;
  
  IF v_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'シナリオが見つかりません');
  END IF;
  
  -- 権限チェック
  IF v_user_org_id IS NULL OR (v_org_id != v_user_org_id AND NOT is_license_admin()) THEN
    RETURN json_build_object(
      'success', false, 
      'error', '権限がありません',
      'debug', json_build_object('user_id', v_user_id, 'user_org_id', v_user_org_id, 'scenario_org_id', v_org_id)
    );
  END IF;
  
  -- schedule_events の organization_scenario_id を NULL に（外部キー制約を回避）
  UPDATE schedule_events
  SET organization_scenario_id = NULL
  WHERE organization_scenario_id = p_scenario_id;
  
  GET DIAGNOSTICS v_event_count = ROW_COUNT;
  
  -- organization_scenarios を削除
  DELETE FROM organization_scenarios WHERE id = p_scenario_id;
  
  RETURN json_build_object(
    'success', true, 
    'title', v_title,
    'unlinked_events', v_event_count
  );
END;
$$;

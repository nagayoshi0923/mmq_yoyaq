-- ============================================================
-- organization_scenarios の更新・削除用 RPC 関数
-- RLS をバイパスして確実に操作できるようにする
-- 作成日: 2026-03-19
-- ============================================================

-- シナリオのステータス更新
CREATE OR REPLACE FUNCTION update_org_scenario_status(
  p_scenario_id UUID,
  p_new_status TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_org_id UUID;
  v_result JSON;
BEGIN
  -- ユーザーの組織IDを取得
  SELECT get_user_organization_id() INTO v_user_org_id;
  
  -- シナリオの組織IDを取得
  SELECT organization_id INTO v_org_id
  FROM organization_scenarios
  WHERE id = p_scenario_id;
  
  -- シナリオが存在しない
  IF v_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'シナリオが見つかりません');
  END IF;
  
  -- 権限チェック: 同じ組織 OR ライセンス管理者
  IF v_user_org_id IS NULL OR (v_org_id != v_user_org_id AND NOT is_license_admin()) THEN
    RETURN json_build_object(
      'success', false, 
      'error', '権限がありません',
      'debug', json_build_object('user_org_id', v_user_org_id, 'scenario_org_id', v_org_id)
    );
  END IF;
  
  -- ステータス更新
  UPDATE organization_scenarios
  SET org_status = p_new_status,
      updated_at = NOW()
  WHERE id = p_scenario_id;
  
  -- 結果を返す
  SELECT json_build_object(
    'success', true,
    'id', id,
    'org_status', org_status
  ) INTO v_result
  FROM organization_scenarios
  WHERE id = p_scenario_id;
  
  RETURN v_result;
END;
$$;

-- シナリオの解除（削除）
CREATE OR REPLACE FUNCTION delete_org_scenario(
  p_scenario_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_org_id UUID;
  v_title TEXT;
BEGIN
  -- ユーザーの組織IDを取得
  SELECT get_user_organization_id() INTO v_user_org_id;
  
  -- シナリオの情報を取得
  SELECT os.organization_id, sm.title 
  INTO v_org_id, v_title
  FROM organization_scenarios os
  LEFT JOIN scenario_masters sm ON os.scenario_master_id = sm.id
  WHERE os.id = p_scenario_id;
  
  -- シナリオが存在しない
  IF v_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'シナリオが見つかりません');
  END IF;
  
  -- 権限チェック: 同じ組織 OR ライセンス管理者
  IF v_user_org_id IS NULL OR (v_org_id != v_user_org_id AND NOT is_license_admin()) THEN
    RETURN json_build_object(
      'success', false, 
      'error', '権限がありません',
      'debug', json_build_object('user_org_id', v_user_org_id, 'scenario_org_id', v_org_id)
    );
  END IF;
  
  -- 削除
  DELETE FROM organization_scenarios
  WHERE id = p_scenario_id;
  
  RETURN json_build_object('success', true, 'title', v_title);
END;
$$;

COMMENT ON FUNCTION update_org_scenario_status(UUID, TEXT) IS 
  '組織シナリオのステータスを更新。SECURITY DEFINER で RLS をバイパス。';
COMMENT ON FUNCTION delete_org_scenario(UUID) IS 
  '組織シナリオを削除（解除）。SECURITY DEFINER で RLS をバイパス。';

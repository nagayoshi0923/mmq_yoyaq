-- manual_external_performances のupsert用RPC関数
-- SECURITY DEFINER でRLSをバイパスし、確実にupsertを実行

CREATE OR REPLACE FUNCTION upsert_manual_external_performance(
  p_organization_id UUID,
  p_scenario_id UUID,
  p_year INTEGER,
  p_month INTEGER,
  p_performance_count INTEGER,
  p_updated_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_id UUID;
BEGIN
  -- 呼び出し元のorganization_idを検証（セキュリティチェック）
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: organization mismatch';
  END IF;

  -- 0の場合は削除
  IF p_performance_count = 0 THEN
    DELETE FROM manual_external_performances
    WHERE organization_id = p_organization_id
      AND scenario_id = p_scenario_id
      AND year = p_year
      AND month = p_month;
    
    RETURN jsonb_build_object('action', 'deleted', 'count', 0);
  END IF;

  -- UPSERT実行
  INSERT INTO manual_external_performances (
    organization_id,
    scenario_id,
    year,
    month,
    performance_count,
    updated_by,
    updated_at
  ) VALUES (
    p_organization_id,
    p_scenario_id,
    p_year,
    p_month,
    p_performance_count,
    p_updated_by,
    NOW()
  )
  ON CONFLICT (organization_id, scenario_id, year, month)
  DO UPDATE SET
    performance_count = EXCLUDED.performance_count,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'action', 'upserted',
    'id', v_id,
    'count', p_performance_count
  );
END;
$$;

COMMENT ON FUNCTION upsert_manual_external_performance IS 
'他社公演数の保存（upsert）。RLSをバイパスして確実に実行';

-- 既存の認証済みユーザーが実行可能
GRANT EXECUTE ON FUNCTION upsert_manual_external_performance TO authenticated;

DO $$ 
BEGIN
  RAISE NOTICE '✅ upsert_manual_external_performance RPC関数を作成しました';
END $$;

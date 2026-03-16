-- scenario_masters の report_display_name を更新するRPC関数
-- scenario_masters にはUPDATEのRLSポリシーがないため、SECURITY DEFINER で対応

CREATE OR REPLACE FUNCTION update_report_display_name(
  p_author_name TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 認証チェック
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- scenario_masters の report_display_name を更新
  UPDATE scenario_masters
  SET report_display_name = p_display_name
  WHERE author = p_author_name;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_count,
    'author', p_author_name,
    'display_name', p_display_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION update_report_display_name IS '作者の報告用表示名を一括更新（RLSバイパス）';
GRANT EXECUTE ON FUNCTION update_report_display_name TO authenticated;

-- スキーマキャッシュをリロード
SELECT pg_notify('pgrst', 'reload schema');

DO $$ 
BEGIN
  RAISE NOTICE '✅ update_report_display_name RPC関数を作成しました';
END $$;

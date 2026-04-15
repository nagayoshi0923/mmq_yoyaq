-- license_organization_name 専用の更新RPC（upsert_authorのオーバーロード問題を回避）
-- 単一の専用関数として作成することでPostgRESTキャッシュ競合を避ける

CREATE OR REPLACE FUNCTION set_author_organization_name(
  p_author_name TEXT,
  p_organization_name TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- authorsテーブルにupsert
  INSERT INTO authors (name, license_organization_name, notes, updated_at)
  VALUES (p_author_name, p_organization_name, p_notes, NOW())
  ON CONFLICT (name)
  DO UPDATE SET
    license_organization_name = p_organization_name,
    notes = COALESCE(p_notes, authors.notes),
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'author_name', p_author_name,
    'organization_name', p_organization_name
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION set_author_organization_name(TEXT, TEXT, TEXT)
  IS '作者のライセンス組織名（会社名）を設定する専用RPC（RLSをバイパス）';

GRANT EXECUTE ON FUNCTION set_author_organization_name(TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE '✅ set_author_organization_name RPC を作成しました';
END $$;

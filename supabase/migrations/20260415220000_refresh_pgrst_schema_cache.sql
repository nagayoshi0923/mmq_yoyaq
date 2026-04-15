-- PostgRESTスキーマキャッシュを強制リフレッシュ
-- upsert_author の新シグネチャ（4パラメータ）がキャッシュに反映されていない問題を解消

-- 既存の全upsert_authorを一旦確認・再適用
-- 念のため再度 DROP & RECREATE
DROP FUNCTION IF EXISTS upsert_author(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS upsert_author(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION upsert_author(
  p_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_license_organization_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_action TEXT;
BEGIN
  INSERT INTO authors (name, email, notes, license_organization_name, updated_at)
  VALUES (p_name, p_email, p_notes, p_license_organization_name, NOW())
  ON CONFLICT (name)
  DO UPDATE SET
    email = COALESCE(EXCLUDED.email, authors.email),
    notes = COALESCE(EXCLUDED.notes, authors.notes),
    license_organization_name = COALESCE(EXCLUDED.license_organization_name, authors.license_organization_name),
    updated_at = NOW()
  RETURNING id INTO v_id;

  IF EXISTS (SELECT 1 FROM authors WHERE name = p_name AND created_at = updated_at) THEN
    v_action := 'created';
  ELSE
    v_action := 'updated';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'name', p_name,
    'action', v_action
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION upsert_author(TEXT, TEXT, TEXT, TEXT) IS '作者情報のupsert（RLSをバイパス）';
GRANT EXECUTE ON FUNCTION upsert_author(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- スキーマキャッシュを強制リロード
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE '✅ upsert_author を再作成し、PostgRESTスキーマキャッシュをリフレッシュしました';
END $$;

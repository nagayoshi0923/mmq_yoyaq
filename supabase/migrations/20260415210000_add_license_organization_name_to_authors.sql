-- authors テーブルに license_organization_name カラムを追加
-- 同じメアドを持つ作者グループ（＝同じ会社）の表示名として使用

ALTER TABLE authors
  ADD COLUMN IF NOT EXISTS license_organization_name TEXT;

COMMENT ON COLUMN authors.license_organization_name
  IS 'ライセンス管理画面でのグループ表示名（会社名など）。同じメアドの作者は同じ値を持つ。';

-- 旧シグネチャを削除してから新しいシグネチャで再作成
DROP FUNCTION IF EXISTS upsert_author(TEXT, TEXT, TEXT);

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
GRANT EXECUTE ON FUNCTION upsert_author TO authenticated;

-- get_author_by_name を更新（license_organization_name を返す）
CREATE OR REPLACE FUNCTION get_author_by_name(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'name', name,
    'email', email,
    'notes', notes,
    'license_organization_name', license_organization_name,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO v_result
  FROM authors
  WHERE name = p_name;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('found', false);
  ELSE
    RETURN v_result || jsonb_build_object('found', true);
  END IF;
END;
$$;

COMMENT ON FUNCTION get_author_by_name IS '名前で作者を検索（RLSをバイパス）';
GRANT EXECUTE ON FUNCTION get_author_by_name TO authenticated;

-- get_all_authors を更新（license_organization_name を返す）
CREATE OR REPLACE FUNCTION get_all_authors()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'email', email,
        'notes', notes,
        'license_organization_name', license_organization_name,
        'created_at', created_at,
        'updated_at', updated_at
      ) ORDER BY name
    ) FROM authors),
    '[]'::JSONB
  );
END;
$$;

COMMENT ON FUNCTION get_all_authors IS '全作者を取得（RLSをバイパス）';
GRANT EXECUTE ON FUNCTION get_all_authors TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

DO $$
BEGIN
  RAISE NOTICE '✅ authors.license_organization_name カラムを追加し、RPC関数を更新しました';
END $$;

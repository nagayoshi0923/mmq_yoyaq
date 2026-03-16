-- authors テーブルのupsert用RPC関数
-- SECURITY DEFINER でRLSをバイパスし、確実にupsertを実行

CREATE OR REPLACE FUNCTION upsert_author(
  p_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
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
  -- UPSERT実行（nameはユニーク）
  INSERT INTO authors (name, email, notes, updated_at)
  VALUES (p_name, p_email, p_notes, NOW())
  ON CONFLICT (name)
  DO UPDATE SET
    email = COALESCE(EXCLUDED.email, authors.email),
    notes = COALESCE(EXCLUDED.notes, authors.notes),
    updated_at = NOW()
  RETURNING id INTO v_id;

  -- 新規作成か更新かを判定
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

COMMENT ON FUNCTION upsert_author IS '作者情報のupsert（RLSをバイパス）';

-- 認証済みユーザーが実行可能
GRANT EXECUTE ON FUNCTION upsert_author TO authenticated;

-- 作者情報を取得するRPC関数（RLSをバイパス）
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

-- 全作者を取得するRPC関数（RLSをバイパス）
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

-- スキーマキャッシュをリロード
SELECT pg_notify('pgrst', 'reload schema');

DO $$ 
BEGIN
  RAISE NOTICE '✅ authors 用のRPC関数を作成しました';
END $$;

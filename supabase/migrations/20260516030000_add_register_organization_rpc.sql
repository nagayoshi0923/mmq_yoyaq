-- =============================================================================
-- 組織セルフ登録用 SECURITY DEFINER RPC
-- =============================================================================
-- 背景:
--   organizations テーブルの INSERT は is_admin() 必須だが、
--   新規登録フローでは「組織がないと admin になれない」という鶏と卵の問題がある。
--   SECURITY DEFINER 関数として定義し anon から呼び出し可能にすることで解消する。
--
-- セキュリティ考慮:
--   - スラグ重複チェックをRPC内で行い、重複時は例外を返す
--   - organizations への直接INSERT権限は引き続き anon に付与しない
--   - レート制限は将来的に rate_limit_log テーブルで追加可能
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. 組織登録 RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_organization_for_signup(
  p_name          TEXT,
  p_slug          TEXT,
  p_contact_email TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- 入力バリデーション
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_name: 組織名は必須です';
  END IF;

  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RAISE EXCEPTION 'invalid_slug: 識別子は必須です';
  END IF;

  IF p_slug !~ '^[a-z0-9][a-z0-9\-]{0,29}$' THEN
    RAISE EXCEPTION 'invalid_slug_format: 識別子は半角英数字とハイフンのみ使用できます';
  END IF;

  -- スラグ重複チェック
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'slug_already_exists: この識別子は既に使用されています';
  END IF;

  -- 組織を作成
  INSERT INTO public.organizations (
    name,
    slug,
    plan,
    contact_email,
    is_active,
    is_license_manager,
    settings
  )
  VALUES (
    trim(p_name),
    p_slug,
    'free',
    COALESCE(nullif(trim(p_contact_email), ''), NULL),
    true,
    false,
    '{}'::jsonb
  )
  RETURNING id INTO v_org_id;

  RETURN json_build_object(
    'id',   v_org_id,
    'slug', p_slug,
    'name', trim(p_name)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. スラグ使用可能チェック RPC（入力中のリアルタイムチェック用）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_organization_slug_available(
  p_slug TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE slug = p_slug
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. 権限付与（anon・authenticated 両方から呼び出し可能）
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.register_organization_for_signup(TEXT, TEXT, TEXT)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_organization_slug_available(TEXT)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 完了通知
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '✅ register_organization_for_signup RPC を作成しました';
  RAISE NOTICE '   - anon/authenticated から呼び出し可能';
  RAISE NOTICE '   - スラグ重複・形式バリデーション付き';
  RAISE NOTICE '✅ check_organization_slug_available RPC を作成しました';
END $$;

-- =============================================================================
-- register_organization_for_signup RPC 拡張: 代表店舗の情報も同時に登録
-- =============================================================================
-- 背景:
--   OrgSignup (/start) では initialize_organization_data() トリガーが
--   「臨時会場 1〜5」を自動生成するが、ユーザーが運営する実店舗は
--   登録されない。手動で /stores から追加する必要があり UX が悪い。
--
--   代表店舗 1 件を組織登録と同時に必須項目として作成できるよう RPC を拡張する。
--   臨時会場 5 件はそのまま残す（既存挙動）。
--
-- 変更内容:
--   - register_organization_for_signup に p_store_name / p_store_address /
--     p_store_phone の 3 パラメータを追加（すべて optional）
--   - p_store_name が指定されていれば、組織作成直後に stores へ 1 件 INSERT
--   - 旧シグネチャ（3 引数版）の関数は DROP（呼び出し側は新シグネチャに統一）
-- =============================================================================

-- 旧シグネチャ（3 引数）を削除
DROP FUNCTION IF EXISTS public.register_organization_for_signup(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.register_organization_for_signup(
  p_name          TEXT,
  p_slug          TEXT,
  p_contact_email TEXT,
  p_store_name    TEXT DEFAULT NULL,
  p_store_address TEXT DEFAULT NULL,
  p_store_phone   TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id        UUID;
  v_store_name    TEXT;
  v_short_name    TEXT;
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_name: 組織名は必須です';
  END IF;

  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RAISE EXCEPTION 'invalid_slug: 識別子は必須です';
  END IF;

  IF p_slug !~ '^[a-z0-9][a-z0-9\-]{0,29}$' THEN
    RAISE EXCEPTION 'invalid_slug_format: 識別子は半角英数字とハイフンのみ使用できます';
  END IF;

  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'slug_already_exists: この識別子は既に使用されています';
  END IF;

  INSERT INTO public.organizations (
    name, slug, plan, contact_email, is_active, is_license_manager, settings
  )
  VALUES (
    trim(p_name), p_slug, 'free',
    COALESCE(nullif(trim(p_contact_email), ''), NULL),
    true, false, '{}'::jsonb
  )
  RETURNING id INTO v_org_id;

  -- 代表店舗を作成（指定されていれば）
  -- ※ initialize_organization_data() トリガーが「臨時会場 1〜5」を別途作るのは継続
  IF p_store_name IS NOT NULL AND trim(p_store_name) != '' THEN
    v_store_name := trim(p_store_name);
    -- short_name は NOT NULL なので名前から作る（先頭6文字、空なら名前そのもの）
    v_short_name := COALESCE(NULLIF(left(v_store_name, 6), ''), v_store_name);

    INSERT INTO public.stores (
      name, short_name, address, phone_number,
      organization_id, status, capacity, rooms, color,
      opening_date, is_temporary,
      created_at, updated_at
    )
    VALUES (
      v_store_name,
      v_short_name,
      NULLIF(trim(COALESCE(p_store_address, '')), ''),
      NULLIF(trim(COALESCE(p_store_phone, '')), ''),
      v_org_id,
      'active',
      6,        -- capacity デフォルト
      1,        -- rooms デフォルト
      '#E60012', -- color デフォルト（テーマカラー）
      CURRENT_DATE,
      false,    -- is_temporary = false（代表店舗）
      NOW(), NOW()
    );
  END IF;

  RETURN json_build_object(
    'id',   v_org_id,
    'slug', p_slug,
    'name', trim(p_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_organization_for_signup(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ register_organization_for_signup 拡張: 代表店舗の同時登録に対応';
END $$;

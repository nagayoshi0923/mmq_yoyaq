-- =============================================================================
-- 既存ユーザーが新規組織の管理者になるための RPC
-- =============================================================================
-- 用途:
--   /start 登録ページでログイン済みユーザーが組織を作成する際に使用。
--   handle_new_user トリガーは signUp 時にしか動かないため、
--   既存ユーザー向けに別 RPC で role 昇格と staff レコード作成を行う。
--
-- セキュリティ:
--   - authenticated ロールのみ実行可能（anon 不可）
--   - auth.uid() で本人確認
--   - 既に organization_id が設定済みの場合はエラー（重複登録防止）
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_organization_as_admin(
  p_org_id    UUID,
  p_admin_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_email     TEXT;
  v_org_slug  TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated: ログインが必要です';
  END IF;

  -- 組織の存在確認
  SELECT slug INTO v_org_slug
  FROM public.organizations
  WHERE id = p_org_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: 指定された組織が見つかりません';
  END IF;

  -- 既に別の組織に所属していないか確認
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_user_id
      AND organization_id IS NOT NULL
      AND organization_id != p_org_id
  ) THEN
    RAISE EXCEPTION 'already_in_org: このアカウントは既に別の組織に所属しています';
  END IF;

  -- メールアドレスを取得
  SELECT email INTO v_email FROM public.users WHERE id = v_user_id;

  -- users レコードを admin に昇格・組織紐付け
  UPDATE public.users
  SET
    role            = 'admin',
    organization_id = p_org_id,
    updated_at      = NOW()
  WHERE id = v_user_id;

  -- staff レコードを作成（未作成の場合のみ）
  INSERT INTO public.staff (
    name, email, user_id, organization_id,
    role, status, stores, ng_days,
    want_to_learn, available_scenarios, availability,
    experience, special_scenarios
  ) VALUES (
    COALESCE(NULLIF(trim(p_admin_name), ''), split_part(v_email, '@', 1)),
    v_email,
    v_user_id,
    p_org_id,
    ARRAY['管理者']::TEXT[],
    'active',
    '{}', '{}', '{}', '{}', '{}', 0, '{}'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    role            = EXCLUDED.role,
    updated_at      = NOW();

  RETURN json_build_object(
    'org_id',   p_org_id,
    'org_slug', v_org_slug
  );
END;
$$;

-- authenticated のみ実行可能（anon は不可）
GRANT EXECUTE ON FUNCTION public.claim_organization_as_admin(UUID, TEXT) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ claim_organization_as_admin RPC を作成しました';
  RAISE NOTICE '   - 既存ログイン済みユーザーを新規組織の admin に昇格';
  RAISE NOTICE '   - staff レコードも自動作成';
  RAISE NOTICE '   - 重複組織所属チェック付き';
END $$;

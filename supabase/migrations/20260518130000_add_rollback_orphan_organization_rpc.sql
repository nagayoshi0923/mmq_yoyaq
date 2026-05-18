-- =============================================================================
-- OrgSignup orphan 組織自動削除 RPC: rollback_orphan_organization
-- =============================================================================
-- 背景:
--   /start 組織自己登録フローは下記の順に処理する:
--     1. register_organization_for_signup RPC → 組織 + 代表店舗を作成
--     2. supabase.auth.signUp → handle_new_user トリガーが users / staff /
--        customers を作成し、組織と紐づける
--
--   signUp が失敗 (SMTP エラー / 重複メアド / ネットワーク等) すると、
--   2 で作るはずだったユーザー紐付けが行われず、組織だけが孤立する。
--
--   現状のフロント側 rollbackOrganization() は logger.warn するだけで
--   実際の削除を行っていない (SECURITY DEFINER で作った組織を anon が
--   直接 DELETE できないため)。結果、テスト試行や本番運用で signUp が失敗する
--   たびに orphan 組織が増え続け、手動掃除が必要になっていた。
--
-- 修正内容:
--   フロントから anon で呼べる SECURITY DEFINER 関数を追加。
--   不正利用を防ぐため下記の条件を厳格にチェックする:
--     - 組織の作成から 10 分以内であること (古い組織を消されない)
--     - public.users に紐づくレコードが無いこと (admin が確定してない孤立状態)
--     - public.staff に紐づくレコードが無いこと (二重保険)
--
--   条件を満たすとき stores / organization_settings / global_settings /
--   organizations を順に削除する。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rollback_orphan_organization(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_at  TIMESTAMPTZ;
  v_user_count  INTEGER;
  v_staff_count INTEGER;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arg: p_org_id is required';
  END IF;

  -- 対象組織の存在確認 + 作成時刻取得
  SELECT created_at INTO v_created_at
  FROM public.organizations
  WHERE id = p_org_id;

  IF v_created_at IS NULL THEN
    -- 既に削除済み or 存在しない → idempotent に成功扱い
    RETURN TRUE;
  END IF;

  -- 安全条件 1: 作成から 10 分以内
  IF v_created_at < NOW() - INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'org_too_old: 作成から 10 分以上経過した組織は rollback できません';
  END IF;

  -- 安全条件 2: ユーザーが紐づいてない
  SELECT COUNT(*) INTO v_user_count
  FROM public.users
  WHERE organization_id = p_org_id;

  IF v_user_count > 0 THEN
    RAISE EXCEPTION 'org_has_users: ユーザーが紐づいている組織は rollback できません';
  END IF;

  -- 安全条件 3: スタッフが紐づいてない (二重保険)
  SELECT COUNT(*) INTO v_staff_count
  FROM public.staff
  WHERE organization_id = p_org_id;

  IF v_staff_count > 0 THEN
    RAISE EXCEPTION 'org_has_staff: スタッフが紐づいている組織は rollback できません';
  END IF;

  -- 削除実行 (initialize_organization_data() が作る stores / settings を順に除去)
  DELETE FROM public.stores                WHERE organization_id = p_org_id;
  DELETE FROM public.organization_settings WHERE organization_id = p_org_id;
  DELETE FROM public.global_settings       WHERE organization_id = p_org_id;
  DELETE FROM public.organizations         WHERE id = p_org_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rollback_orphan_organization(UUID)
  TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ rollback_orphan_organization RPC を追加';
  RAISE NOTICE '   - /start signUp 失敗時に orphan 組織を自動削除可能に';
  RAISE NOTICE '   - 安全条件: 作成 10 分以内 + ユーザー/スタッフ未紐付け';
END $$;

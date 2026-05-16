-- =============================================================================
-- handle_new_user トリガーを組織自己登録フローに対応させる
-- =============================================================================
-- 背景:
--   新規組織登録（/start）では signUp 時に user_metadata として
--   { organization_id, invited_as: 'admin', admin_name } を渡す。
--   従来のトリガーはこれを無視していたため:
--     - users.organization_id が NULL になる
--     - staff レコードが作成されない
--     - users/staff の手動 INSERT はRLSに弾かれる
--
-- 変更内容:
--   1. user_metadata.organization_id を読み取り users.organization_id に設定
--   2. invited_as='admin' かつ organization_id が設定されている場合、
--      staff レコードを自動作成（SECURITY DEFINER でRLSをバイパス）
--
-- 既存フローへの影響:
--   - 既存スタッフ招待フロー: user_metadata に organization_id を渡さないため変化なし
--     （invitationsApi.ts が signUp 後に手動で users/staff を upsert する既存実装を維持）
--   - 顧客登録: invited_as が null のため変化なし
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   app_role := 'customer';
  v_org_id UUID;
  v_name   TEXT;
BEGIN
  -- user_metadata から組織自己登録用の情報を読む
  v_org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
  v_name   := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'admin_name', '')), '');

  -- invited_as によるロール判定
  IF (NEW.raw_user_meta_data->>'invited_as') IS NOT NULL THEN
    CASE (NEW.raw_user_meta_data->>'invited_as')
      WHEN 'staff'         THEN v_role := 'staff';
      WHEN 'admin'         THEN v_role := 'admin';
      WHEN 'license_admin' THEN v_role := 'license_admin';
      ELSE                      v_role := 'customer';
    END CASE;
  END IF;

  -- users テーブルに挿入（organization_id を含む）
  -- ON CONFLICT: organization_id は新しい値があれば上書き（招待フローの上書き upsert を妨げない）
  INSERT INTO public.users (id, email, role, organization_id, created_at, updated_at)
  VALUES (NEW.id, NEW.email, v_role, v_org_id, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    role            = EXCLUDED.role,
    organization_id = COALESCE(EXCLUDED.organization_id, users.organization_id),
    updated_at      = NOW();

  -- 組織自己登録フローのみ: staff レコードを自動作成
  -- 条件: invited_as='admin' かつ user_metadata に organization_id が設定されている
  IF v_role = 'admin' AND v_org_id IS NOT NULL THEN
    INSERT INTO public.staff (
      name,
      email,
      user_id,
      organization_id,
      role,
      status,
      stores,
      ng_days,
      want_to_learn,
      available_scenarios,
      availability,
      experience,
      special_scenarios
    ) VALUES (
      COALESCE(v_name, split_part(NEW.email, '@', 1)),
      NEW.email,
      NEW.id,
      v_org_id,
      ARRAY['管理者']::TEXT[],
      'active',
      '{}'::TEXT[],
      '{}'::TEXT[],
      '{}'::TEXT[],
      '{}'::TEXT[],
      '{}'::TEXT[],
      0,
      '{}'::TEXT[]
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- トリガー内のエラーで auth.users 作成がロールバックされないよう、
  -- エラーをログに残して続行する
  RAISE WARNING 'handle_new_user: エラーが発生しました (user_id=%, error=%)', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 完了通知
DO $$
BEGIN
  RAISE NOTICE '✅ handle_new_user トリガーを更新しました';
  RAISE NOTICE '   - user_metadata.organization_id を users テーブルに設定';
  RAISE NOTICE '   - invited_as=admin かつ organization_id 設定時に staff レコードを自動作成';
  RAISE NOTICE '   - 既存の招待フロー・顧客登録フローへの影響なし';
END $$;

-- ========================================
-- 🔒 セキュリティ修正: メールアドレスベースの自動admin付与を削除
-- 
-- 脆弱性: メールアドレスに "admin" を含むと自動的にadmin権限が付与される
-- 例: attacker-admin-test@gmail.com → admin権限を取得
-- 
-- 修正: invited_as メタデータに基づくロール付与のみ許可
-- ========================================

-- A. トリガー関数を更新（メールベースのロール付与を削除）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role := 'customer';
BEGIN
  -- Edge Functionから招待された場合のみ、user_metadataを確認
  -- 🔒 メールアドレスに基づくロール付与は行わない（セキュリティ上の理由）
  IF (NEW.raw_user_meta_data->>'invited_as') IS NOT NULL THEN
    CASE (NEW.raw_user_meta_data->>'invited_as')
      WHEN 'staff' THEN
        user_role := 'staff';
      WHEN 'admin' THEN
        user_role := 'admin';
      WHEN 'license_admin' THEN
        user_role := 'license_admin';
      ELSE
        user_role := 'customer';
    END CASE;
  END IF;
  -- 🔒 削除: メールアドレスに 'admin' や 'staff' を含む場合の自動付与
  -- これはセキュリティ上の脆弱性であるため削除

  -- usersテーブルにレコードを挿入
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    -- 既存ユーザーの場合はロールを変更しない（明示的な変更のみ許可）
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- B. 監査ログに記録
DO $$
BEGIN
  RAISE NOTICE '✅ セキュリティ修正: メールアドレスベースの自動admin付与を削除しました';
  RAISE NOTICE '   - 新規ユーザーはデフォルトで customer ロールになります';
  RAISE NOTICE '   - admin/staff への昇格は invited_as メタデータまたは明示的な更新のみ';
END $$;

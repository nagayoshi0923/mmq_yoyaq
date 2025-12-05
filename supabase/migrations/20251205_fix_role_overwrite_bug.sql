-- ========================================
-- ロール上書きバグ修正
-- ========================================
-- 問題: 既存ユーザーがログイン/セッション更新するたびに
--       ロールがcustomerに上書きされてしまう
-- 
-- 原因: ON CONFLICT DO UPDATE で常にロールを上書きしていた
-- 
-- 修正: invited_as メタデータがある場合（招待時）のみロールを更新
--       通常ログイン時は既存のロールを維持する

-- トリガー関数を修正
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role := 'customer';
  invited_as_value TEXT;
BEGIN
  -- Edge Functionから招待された場合は、user_metadataを確認（最優先）
  invited_as_value := NEW.raw_user_meta_data->>'invited_as';
  
  IF invited_as_value IS NOT NULL THEN
    CASE invited_as_value
      WHEN 'staff' THEN
        user_role := 'staff';
      WHEN 'admin' THEN
        user_role := 'admin';
      ELSE
        user_role := 'customer';
    END CASE;
  -- メールアドレスに 'admin' が含まれている場合は admin ロールを付与
  ELSIF NEW.email LIKE '%admin%' THEN
    user_role := 'admin';
  -- メールアドレスに 'staff' が含まれている場合は staff ロールを付与
  ELSIF NEW.email LIKE '%staff%' THEN
    user_role := 'staff';
  END IF;

  -- usersテーブルにレコードを挿入または更新
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    -- 🔴 修正: 招待時（invited_as がある場合）のみロールを更新
    -- 通常ログイン/セッション更新時は既存のロールを維持
    role = CASE 
        WHEN invited_as_value IS NOT NULL THEN EXCLUDED.role
        ELSE public.users.role  -- 既存のロールを維持
    END,
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- エラーが発生しても、auth.usersの作成は続行させる
    RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 確認メッセージ
SELECT 
  '✅ ロール上書きバグを修正しました' AS status,
  '招待時のみロールが更新され、通常ログイン時は既存のロールが維持されます。' AS detail;


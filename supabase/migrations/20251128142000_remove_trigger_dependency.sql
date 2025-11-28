-- ========================================
-- トリガー依存を削除し、明示的なユーザー作成に変更
-- ========================================
-- 問題: トリガーが失敗するとusersテーブルにレコードが作成されない
-- 
-- 解決策: 
-- 1. トリガー関数を改善（エラーが発生しても問題ないように）
-- 2. アプリケーション側で明示的にusersテーブルにレコードを作成する（二重作成防止）

-- トリガー関数を改善（エラーが発生してもauth.usersの作成は続行）
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

  -- usersテーブルにレコードを挿入または更新（確実に作成）
  -- ON CONFLICTで二重作成を防止
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    -- 既存レコードがある場合も、招待時はロールを更新
    role = EXCLUDED.role,
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- エラーが発生しても、auth.usersの作成は続行させる
    -- アプリケーション側で明示的に作成するため、エラーを無視
    RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 確認メッセージ
SELECT 
  '✅ トリガー関数を改善しました' AS status,
  'エラーが発生してもauth.usersの作成は続行されます。アプリケーション側でも明示的にusersテーブルにレコードを作成してください。' AS detail;


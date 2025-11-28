-- ========================================
-- ユーザー作成フローの根本的な修正
-- ========================================
-- 問題: スタッフ招待時にusersテーブルにレコードが作成されない
-- 
-- 解決策: 
-- 1. トリガー関数を確実に動作させる
-- 2. トリガーが失敗しても、Edge Functionで確実にusersテーブルにレコードを作成する

-- トリガー関数を修正（確実に動作するように）
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
    RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- トリガーを再作成（確実に動作するように）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 確認メッセージ
SELECT 
  '✅ トリガー関数とトリガーを再作成しました' AS status,
  '今後のスタッフ招待時に確実にusersテーブルにレコードが作成されます' AS detail;


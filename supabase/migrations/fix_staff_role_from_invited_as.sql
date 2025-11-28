-- ========================================
-- スタッフ招待時のロール設定を修正（今後の招待用）
-- ========================================
-- 問題: スタッフ招待時にuser_metadata.invited_as='staff'が設定されているが、
--       トリガーが正しく動作せず、usersテーブルのroleが'customer'になってしまう
-- 
-- 解決策: トリガー関数を修正して、invited_asを確実に参照するようにする

-- トリガー関数を修正（invited_asを確実に参照・最優先）
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
  -- raw_user_meta_data->>'invited_as' を確認
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
    -- 既存レコードがある場合も、招待時はロールを更新
    role = EXCLUDED.role,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- トリガーが存在することを確認（存在しない場合は作成）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created' 
    AND tgrelid = 'auth.users'::regclass
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
    
    RAISE NOTICE 'トリガーを作成しました';
  ELSE
    RAISE NOTICE 'トリガーは既に存在します';
  END IF;
END $$;

-- 確認メッセージ
SELECT 
  '✅ トリガー関数を修正しました' AS status,
  '今後のスタッフ招待時に正しくstaffロールが付与されます' AS detail;


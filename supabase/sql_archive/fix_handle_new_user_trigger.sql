-- トリガーを修正して、スタッフ招待時のロールを正しく設定
-- Edge Functionが設定した user_metadata.invited_as を確認する

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role := 'customer';
BEGIN
  -- Edge Functionから招待された場合は、user_metadataを確認
  IF (NEW.raw_user_meta_data->>'invited_as') IS NOT NULL THEN
    -- invited_as が設定されている場合はそれを使用
    CASE (NEW.raw_user_meta_data->>'invited_as')
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
    -- 既存レコードがある場合も、招待時はロールを更新
    role = EXCLUDED.role,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- 成功メッセージ
SELECT '✅ handle_new_user トリガーを修正しました' AS status,
       'スタッフ招待時に正しいロールが設定されます' AS detail;


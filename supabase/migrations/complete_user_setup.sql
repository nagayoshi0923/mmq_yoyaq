-- ========================================
-- 完全セットアップ：トリガー + RLS（修正版）
-- ========================================

-- A. トリガー関数を作成/更新
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
    CASE (NEW.raw_user_meta_data->>'invited_as')
      WHEN 'staff' THEN
        user_role := 'staff';
      WHEN 'admin' THEN
        user_role := 'admin';
      ELSE
        user_role := 'customer';
    END CASE;
  ELSIF NEW.email LIKE '%admin%' THEN
    user_role := 'admin';
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
    role = EXCLUDED.role,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- B. 既存のトリガーを削除
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- C. 新しいトリガーを作成
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- D. RLSポリシーを更新（既存のポリシーも削除）
DROP POLICY IF EXISTS "users_update_self" ON public.users;
DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;

CREATE POLICY "users_update_self_or_admin" ON public.users
  FOR UPDATE
  USING (
    id = auth.uid() OR
    public.is_staff_or_admin() OR
    auth.role() = 'service_role'
  );

-- E. 既存のauth.usersをusersテーブルに追加（まだない場合）
INSERT INTO public.users (id, email, role, created_at, updated_at)
SELECT 
  au.id,
  au.email,
  CASE 
    WHEN au.email LIKE '%admin%' THEN 'admin'::app_role
    WHEN au.email LIKE '%staff%' THEN 'staff'::app_role
    WHEN au.raw_user_meta_data->>'invited_as' = 'staff' THEN 'staff'::app_role
    WHEN au.raw_user_meta_data->>'invited_as' = 'admin' THEN 'admin'::app_role
    ELSE 'customer'::app_role
  END as role,
  au.created_at,
  NOW()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u WHERE u.id = au.id
)
ON CONFLICT (id) DO UPDATE SET
  role = CASE 
    WHEN (SELECT email FROM auth.users WHERE id = EXCLUDED.id) LIKE '%admin%' THEN 'admin'::app_role
    WHEN (SELECT email FROM auth.users WHERE id = EXCLUDED.id) LIKE '%staff%' THEN 'staff'::app_role
    WHEN (SELECT raw_user_meta_data->>'invited_as' FROM auth.users WHERE id = EXCLUDED.id) = 'staff' THEN 'staff'::app_role
    WHEN (SELECT raw_user_meta_data->>'invited_as' FROM auth.users WHERE id = EXCLUDED.id) = 'admin' THEN 'admin'::app_role
    ELSE EXCLUDED.role
  END,
  updated_at = NOW();

-- F. 確認
SELECT 
  '✅ トリガーとRLSポリシーを設定しました' AS status,
  COUNT(*) || ' 件のユーザーを処理しました' AS detail
FROM public.users;

-- G. 結果を表示
SELECT 
  au.email as auth_email,
  u.email as users_email,
  u.role,
  au.raw_user_meta_data->>'invited_as' as invited_as
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
ORDER BY au.created_at DESC
LIMIT 10;


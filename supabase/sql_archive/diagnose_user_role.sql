-- ========================================
-- 詳細診断：なぜロールが顧客になるのか
-- ========================================

-- 1. 最新のユーザーを詳しく確認
SELECT 
  '【最新ユーザーの詳細】' as section,
  au.id,
  au.email,
  au.created_at,
  au.confirmed_at,
  au.email_confirmed_at,
  au.raw_user_meta_data,
  au.raw_user_meta_data->>'invited_as' as invited_as,
  au.raw_user_meta_data->>'full_name' as full_name,
  u.role as users_role,
  u.created_at as users_created_at,
  u.updated_at as users_updated_at
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
ORDER BY au.created_at DESC
LIMIT 3;

-- 2. トリガーが正しく設置されているか確認
SELECT 
  '【トリガー設置状況】' as section,
  event_object_schema || '.' || event_object_table as target_table,
  trigger_name,
  action_timing || ' ' || event_manipulation as when_what,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 3. handle_new_user関数のソースコードを確認
SELECT 
  '【トリガー関数の内容】' as section,
  routine_name,
  LEFT(routine_definition, 200) || '...' as function_code_preview
FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name = 'handle_new_user';

-- 4. usersテーブルのポリシーを全て確認
SELECT 
  '【usersテーブルのRLSポリシー】' as section,
  policyname,
  cmd,
  CASE 
    WHEN cmd = 'SELECT' THEN 'SELECT (読取)'
    WHEN cmd = 'INSERT' THEN 'INSERT (作成)'
    WHEN cmd = 'UPDATE' THEN 'UPDATE (更新)'
    WHEN cmd = 'DELETE' THEN 'DELETE (削除)'
    ELSE cmd
  END as operation,
  permissive,
  COALESCE(qual::text, '(なし)') as using_clause,
  COALESCE(with_check::text, '(なし)') as with_check_clause
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'users'
ORDER BY cmd, policyname;

-- 5. テスト：手動でロールを更新してみる
DO $$
DECLARE
  test_user_id UUID;
  test_email TEXT;
BEGIN
  -- 最新のユーザーを取得
  SELECT id, email INTO test_user_id, test_email
  FROM auth.users
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF test_user_id IS NOT NULL THEN
    -- ロールをstaffに更新
    UPDATE public.users
    SET role = 'staff'::app_role,
        updated_at = NOW()
    WHERE id = test_user_id;
    
    RAISE NOTICE '【手動更新テスト】ユーザー % (%) のロールをstaffに更新しました', test_email, test_user_id;
  END IF;
END $$;

-- 6. 更新後の状態を確認
SELECT 
  '【手動更新後の状態】' as section,
  au.email,
  u.role,
  u.updated_at
FROM auth.users au
JOIN public.users u ON au.id = u.id
ORDER BY au.created_at DESC
LIMIT 3;


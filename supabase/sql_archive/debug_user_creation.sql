-- ユーザー作成の問題をデバッグ

-- 1. トリガーが正しく設置されているか確認
SELECT 
  trigger_name,
  event_manipulation,
  event_object_schema,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users' AND event_object_schema = 'auth';

-- 2. handle_new_user関数が存在するか確認
SELECT 
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_name = 'handle_new_user' AND routine_schema = 'public';

-- 3. 最近作成されたauth.usersを確認
SELECT 
  au.id,
  au.email,
  au.created_at,
  au.raw_user_meta_data->>'invited_as' as invited_as,
  u.role as users_role,
  u.created_at as users_created_at
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
ORDER BY au.created_at DESC
LIMIT 10;

-- 4. usersテーブルのRLSポリシーを確認
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'users' AND schemaname = 'public';


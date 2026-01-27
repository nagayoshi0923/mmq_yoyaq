-- mai.mine0202@gmail.com (user_id: e248135f-d531-4c48-8ca4-cd06bb3bc23c) の詳細確認

-- 1. auth.users テーブル（Supabase認証）
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at
FROM auth.users 
WHERE id = 'e248135f-d531-4c48-8ca4-cd06bb3bc23c'
   OR email = 'mai.mine0202@gmail.com';

-- 2. users テーブル（アプリケーション側）
SELECT 
  id,
  email,
  role,
  organization_id,
  created_at
FROM users 
WHERE id = 'e248135f-d531-4c48-8ca4-cd06bb3bc23c'
   OR email = 'mai.mine0202@gmail.com';

-- 3. staff テーブル（スタッフ情報）- ★ここが重要
SELECT 
  id,
  name,
  user_id,
  email,
  role,
  organization_id,
  stores,
  created_at
FROM staff 
WHERE user_id = 'e248135f-d531-4c48-8ca4-cd06bb3bc23c'
   OR email = 'mai.mine0202@gmail.com';

-- 4. customers テーブル（顧客情報）
SELECT 
  id,
  user_id,
  name,
  email,
  phone,
  organization_id
FROM customers
WHERE user_id = 'e248135f-d531-4c48-8ca4-cd06bb3bc23c'
   OR email = 'mai.mine0202@gmail.com';

-- 5. RLSポリシーの確認（staff テーブル）
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'staff';


-- 現在のユーザーをusersテーブルに追加
-- mai.nagayoshi@gmail.com を管理者として登録

-- 既存のユーザーデータを確認
SELECT 'Current auth users:' as info;
SELECT id, email, created_at FROM auth.users;

-- usersテーブルの現在のデータを確認
SELECT 'Current users table:' as info;
SELECT * FROM users;

-- mai.nagayoshi@gmail.com のauth.users IDを取得して、usersテーブルに追加
INSERT INTO users (id, email, role)
SELECT 
  au.id,
  au.email,
  'admin'::app_role
FROM auth.users au
WHERE au.email = 'mai.nagayoshi@gmail.com'
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  updated_at = NOW();

-- 結果確認
SELECT 'Updated users table:' as info;
SELECT * FROM users;

-- ユーザーアクセス問題の修正

-- 1. 現在のauth.usersの状況を確認
SELECT 'Current auth.users:' as info;
SELECT id, email, created_at FROM auth.users WHERE email = 'mai.nagayoshi@gmail.com';

-- 2. usersテーブルの状況を確認
SELECT 'Current users table:' as info;
SELECT id, email, role FROM users WHERE email = 'mai.nagayoshi@gmail.com';

-- 3. mai.nagayoshi@gmail.com用のusersレコードを作成/更新
INSERT INTO users (id, email, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'mai.nagayoshi@gmail.com'),
  'mai.nagayoshi@gmail.com',
  'admin'
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = EXCLUDED.role;

-- 4. staffテーブルのuser_idを正しく設定
UPDATE staff 
SET user_id = (SELECT id FROM auth.users WHERE email = 'mai.nagayoshi@gmail.com')
WHERE email = 'tanaka@mmq.example.com' OR name = '田中 太郎';

-- 5. 確認クエリ
SELECT 'Final verification:' as info;
SELECT 
  u.email as auth_email,
  users.email as users_email,
  users.role,
  s.name as staff_name,
  s.user_id
FROM auth.users u
LEFT JOIN users ON users.id = u.id
LEFT JOIN staff s ON s.user_id = u.id
WHERE u.email = 'mai.nagayoshi@gmail.com';

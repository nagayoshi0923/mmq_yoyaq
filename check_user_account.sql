-- mai.mine0202@gmail.com のアカウント状態を確認

-- 1. users テーブル（アプリケーション側のユーザー情報）
SELECT 
  id,
  email,
  role,
  organization_id,
  created_at
FROM users 
WHERE email = 'mai.mine0202@gmail.com';

-- 2. customers テーブル（顧客情報）
SELECT 
  c.id,
  c.user_id,
  c.name,
  c.email,
  c.phone,
  c.organization_id
FROM customers c
WHERE c.email = 'mai.mine0202@gmail.com'
   OR c.user_id IN (SELECT id FROM users WHERE email = 'mai.mine0202@gmail.com');

-- 3. staff テーブル（スタッフ情報）
SELECT 
  id,
  name,
  user_id,
  email,
  role
FROM staff 
WHERE email = 'mai.mine0202@gmail.com'
   OR user_id IN (SELECT id FROM users WHERE email = 'mai.mine0202@gmail.com');

-- 4. reservations（このユーザーの予約）
SELECT 
  COUNT(*) as reservation_count,
  status
FROM reservations r
WHERE r.customer_id IN (
  SELECT c.id FROM customers c WHERE c.email = 'mai.mine0202@gmail.com'
)
GROUP BY status;


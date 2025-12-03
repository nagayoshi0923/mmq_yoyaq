-- スタッフ一覧の全員にスタッフロールを追加するSQL
-- staffテーブルにuser_idが設定されている全員のusersテーブルのroleをstaffに更新

-- 1. まず対象を確認（実行前の確認用）
SELECT 
  s.id as staff_id,
  s.name as staff_name,
  s.user_id,
  u.email,
  u.role as current_role
FROM staff s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.user_id IS NOT NULL;

-- 2. スタッフロールを付与（adminは除く）
UPDATE users
SET role = 'staff', updated_at = NOW()
WHERE id IN (
  SELECT user_id 
  FROM staff 
  WHERE user_id IS NOT NULL
)
AND role != 'admin';  -- adminロールは変更しない

-- 3. 結果を確認
SELECT 
  s.id as staff_id,
  s.name as staff_name,
  s.user_id,
  u.email,
  u.role as updated_role
FROM staff s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.user_id IS NOT NULL;


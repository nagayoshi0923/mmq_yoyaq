-- ============================================================
-- 認証認可データ整合性チェックスクリプト
-- ============================================================
-- 
-- usersテーブルとstaffテーブルの整合性をチェックします。
-- 以下の不整合を検出します：
-- 1. staffロールだがstaffテーブルに紐付けがない
-- 2. staffテーブルにuser_idがあるがusersテーブルに存在しない
-- 3. staffテーブルにemailがあるがusersテーブルに存在しない
-- 4. usersテーブルとstaffテーブルでemailが一致しない
--
-- 実行方法:
--   psql -h <host> -U <user> -d <database> -f check_auth_integrity.sql
--   または Supabase SQL Editor で実行
-- ============================================================

-- ===========================
-- 1. staffロールだがstaffテーブルに紐付けがない（幽霊スタッフ）
-- ===========================
SELECT 
  '🔴 幽霊スタッフ' as issue_type,
  u.id as user_id,
  u.email,
  u.role,
  'users.role = staff だが staffテーブルに紐付けがない' as description
FROM users u
LEFT JOIN staff s ON s.user_id = u.id
WHERE u.role = 'staff'
  AND s.id IS NULL
ORDER BY u.email;

-- ===========================
-- 2. staffテーブルにuser_idがあるがusersテーブルに存在しない
-- ===========================
SELECT 
  '🔴 孤立したstaffレコード（user_id参照エラー）' as issue_type,
  s.id as staff_id,
  s.name,
  s.email,
  s.user_id,
  'staff.user_id が usersテーブルに存在しない' as description
FROM staff s
WHERE s.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = s.user_id
  )
ORDER BY s.email;

-- ===========================
-- 3. staffテーブルにemailがあるがusersテーブルに存在しない（紐付け可能）
-- ===========================
SELECT 
  '🟡 紐付け可能なstaffレコード' as issue_type,
  s.id as staff_id,
  s.name,
  s.email,
  s.user_id,
  'staff.email が usersテーブルに存在するが user_id が未設定' as description,
  u.id as matching_user_id,
  u.role as matching_user_role
FROM staff s
LEFT JOIN users u ON LOWER(u.email) = LOWER(s.email)
WHERE s.user_id IS NULL
  AND s.email IS NOT NULL
  AND s.email != ''
  AND u.id IS NOT NULL
ORDER BY s.email;

-- ===========================
-- 4. usersテーブルとstaffテーブルでemailが一致しない
-- ===========================
SELECT 
  '🟡 email不一致' as issue_type,
  u.id as user_id,
  u.email as user_email,
  u.role,
  s.id as staff_id,
  s.email as staff_email,
  s.name as staff_name,
  'users.email と staff.email が一致しない' as description
FROM users u
INNER JOIN staff s ON s.user_id = u.id
WHERE LOWER(u.email) != LOWER(s.email)
  AND s.email IS NOT NULL
  AND s.email != ''
ORDER BY u.email;

-- ===========================
-- 5. 整合性サマリー
-- ===========================
SELECT 
  '📊 整合性サマリー' as summary_type,
  COUNT(*) FILTER (WHERE issue_type = '🔴 幽霊スタッフ') as 幽霊スタッフ数,
  COUNT(*) FILTER (WHERE issue_type = '🔴 孤立したstaffレコード（user_id参照エラー）') as 孤立staff数,
  COUNT(*) FILTER (WHERE issue_type = '🟡 紐付け可能なstaffレコード') as 紐付け可能数,
  COUNT(*) FILTER (WHERE issue_type = '🟡 email不一致') as email不一致数
FROM (
  SELECT '🔴 幽霊スタッフ' as issue_type
  FROM users u
  LEFT JOIN staff s ON s.user_id = u.id
  WHERE u.role = 'staff' AND s.id IS NULL
  
  UNION ALL
  
  SELECT '🔴 孤立したstaffレコード（user_id参照エラー）' as issue_type
  FROM staff s
  WHERE s.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id)
  
  UNION ALL
  
  SELECT '🟡 紐付け可能なstaffレコード' as issue_type
  FROM staff s
  LEFT JOIN users u ON LOWER(u.email) = LOWER(s.email)
  WHERE s.user_id IS NULL
    AND s.email IS NOT NULL
    AND s.email != ''
    AND u.id IS NOT NULL
  
  UNION ALL
  
  SELECT '🟡 email不一致' as issue_type
  FROM users u
  INNER JOIN staff s ON s.user_id = u.id
  WHERE LOWER(u.email) != LOWER(s.email)
    AND s.email IS NOT NULL
    AND s.email != ''
) summary;

-- ===========================
-- 6. 正常な紐付けの確認
-- ===========================
SELECT 
  '✅ 正常な紐付け' as status,
  COUNT(*) as 正常な紐付け数
FROM users u
INNER JOIN staff s ON s.user_id = u.id
WHERE u.role = 'staff'
  AND (s.email IS NULL OR LOWER(u.email) = LOWER(s.email));


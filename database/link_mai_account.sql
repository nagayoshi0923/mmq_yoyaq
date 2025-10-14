-- mai.nagayoshi@gmail.com アカウントとスタッフを紐づける
-- 
-- ⚠️ 事前に add_user_id_to_staff.sql を実行してください
--
-- ユーザー情報:
-- email: mai.nagayoshi@gmail.com
-- user_id: 472c8556-f296-4a76-bb8d-f4010156cb6f
-- 
-- スタッフID: 422c7438-a84e-4b60-8d90-0b6ee35b61b1

-- ステップ1: スタッフにユーザーIDを紐づける
UPDATE staff
SET 
  user_id = '472c8556-f296-4a76-bb8d-f4010156cb6f',
  updated_at = NOW()
WHERE id = '422c7438-a84e-4b60-8d90-0b6ee35b61b1';

-- ステップ2: ユーザーをadminに設定
UPDATE users
SET 
  role = 'admin',
  updated_at = NOW()
WHERE id = '472c8556-f296-4a76-bb8d-f4010156cb6f';

-- 確認
SELECT 
  '✅ mai.nagayoshi@gmail.com アカウントの紐づけが完了しました' as status;

-- 紐づけ結果の詳細確認
SELECT 
  '紐づけ結果' as category,
  s.id as staff_id,
  s.name as スタッフ名,
  s.line_name as LINE名,
  u.id as user_id,
  u.email as メールアドレス,
  u.role as ユーザー権限,
  array_to_string(s.role, ', ') as スタッフ役割,
  s.status as スタッフステータス
FROM staff s
INNER JOIN users u ON s.user_id = u.id
WHERE s.id = '422c7438-a84e-4b60-8d90-0b6ee35b61b1';


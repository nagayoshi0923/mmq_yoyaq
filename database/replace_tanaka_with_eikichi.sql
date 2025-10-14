-- 田中太郎を削除して、えいきちに置き換える
-- 
-- 既存の「田中太郎」というサンプルデータを削除し、
-- 「えいきち」のデータを正しく設定します

-- ステップ1: 田中太郎のデータを確認
SELECT 
  'ステップ1: 削除前の確認' as action,
  id,
  name,
  line_name,
  array_to_string(role, ', ') as roles
FROM staff
WHERE name LIKE '%田中%' OR name LIKE '%太郎%';

-- ステップ2a: 関連するshift_submissionsを削除
DELETE FROM shift_submissions
WHERE staff_id IN (
  SELECT id FROM staff WHERE name LIKE '%田中%' OR name LIKE '%太郎%'
);

SELECT '✅ 田中太郎の関連データ（shift_submissions）を削除しました' as status;

-- ステップ2b: 関連するstaff_scenario_assignmentsを削除
DELETE FROM staff_scenario_assignments
WHERE staff_id IN (
  SELECT id FROM staff WHERE name LIKE '%田中%' OR name LIKE '%太郎%'
);

SELECT '✅ 田中太郎の関連データ（staff_scenario_assignments）を削除しました' as status;

-- ステップ2c: 田中太郎を削除
DELETE FROM staff
WHERE name LIKE '%田中%' OR name LIKE '%太郎%';

SELECT '✅ 田中太郎を削除しました' as status;

-- ステップ3: えいきちのデータを確認・更新
-- えいきちが存在する場合は更新、存在しない場合は挿入
INSERT INTO staff (
  id,
  name,
  line_name,
  x_account,
  stores,
  ng_days,
  want_to_learn,
  role,
  notes,
  status,
  user_id
) VALUES (
  '422c7438-a84e-4b60-8d90-0b6ee35b61b1',
  'えいきち',
  'まい（えいきち）',
  NULL,
  '{}',
  '{}',
  '{}',
  '{admin}',
  '社長',
  'active',
  '472c8556-f296-4a76-bb8d-f4010156cb6f'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  line_name = EXCLUDED.line_name,
  x_account = EXCLUDED.x_account,
  stores = EXCLUDED.stores,
  ng_days = EXCLUDED.ng_days,
  want_to_learn = EXCLUDED.want_to_learn,
  role = EXCLUDED.role,
  notes = EXCLUDED.notes,
  status = EXCLUDED.status,
  user_id = EXCLUDED.user_id,
  updated_at = NOW();

SELECT '✅ えいきちのデータを設定しました' as status;

-- ステップ4: 最終確認
SELECT 
  'ステップ4: 最終確認' as action,
  s.id,
  s.name as スタッフ名,
  s.line_name as LINE名,
  array_to_string(s.role, ', ') as 役割,
  s.notes as 備考,
  u.email as メールアドレス,
  u.role as ユーザー権限
FROM staff s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.name = 'えいきち';

-- 管理者一覧の確認
SELECT 
  '管理者一覧' as category,
  name as スタッフ名,
  line_name as LINE名,
  notes as 備考
FROM staff
WHERE 'admin' = ANY(role)
ORDER BY name;


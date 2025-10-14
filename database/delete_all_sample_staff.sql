-- 全てのサンプルスタッフを削除する（田中太郎、佐藤花子など）
-- 
-- ⚠️ 警告: このSQLを実行すると、サンプルスタッフとその関連データが永久に削除されます

-- ===========================
-- ステップ1: 削除対象の確認
-- ===========================

SELECT 
  'ステップ1: 削除対象のサンプルスタッフ' as action,
  id,
  name,
  line_name,
  array_to_string(role, ', ') as roles,
  notes
FROM staff
WHERE 
  name LIKE '%田中%' 
  OR name LIKE '%佐藤%'
  OR name LIKE '%鈴木%'
  OR name LIKE '%高橋%'
  OR name LIKE '%太郎%'
  OR name LIKE '%花子%'
  OR name LIKE '%一郎%'
  OR name LIKE '%美咲%'
  OR id IN (
    '550e8400-e29b-41d4-a716-446655440101',
    '550e8400-e29b-41d4-a716-446655440102',
    '550e8400-e29b-41d4-a716-446655440103',
    '550e8400-e29b-41d4-a716-446655440104'
  )
ORDER BY name;

-- ===========================
-- ステップ2: 関連データを削除
-- ===========================

-- shift_submissionsの削除
DELETE FROM shift_submissions
WHERE staff_id IN (
  SELECT id FROM staff 
  WHERE 
    name LIKE '%田中%' 
    OR name LIKE '%佐藤%'
    OR name LIKE '%鈴木%'
    OR name LIKE '%高橋%'
    OR name LIKE '%太郎%'
    OR name LIKE '%花子%'
    OR name LIKE '%一郎%'
    OR name LIKE '%美咲%'
    OR id IN (
      '550e8400-e29b-41d4-a716-446655440101',
      '550e8400-e29b-41d4-a716-446655440102',
      '550e8400-e29b-41d4-a716-446655440103',
      '550e8400-e29b-41d4-a716-446655440104'
    )
);

SELECT '✅ shift_submissionsの関連データを削除しました' as status;

-- staff_scenario_assignmentsの削除
DELETE FROM staff_scenario_assignments
WHERE staff_id IN (
  SELECT id FROM staff 
  WHERE 
    name LIKE '%田中%' 
    OR name LIKE '%佐藤%'
    OR name LIKE '%鈴木%'
    OR name LIKE '%高橋%'
    OR name LIKE '%太郎%'
    OR name LIKE '%花子%'
    OR name LIKE '%一郎%'
    OR name LIKE '%美咲%'
    OR id IN (
      '550e8400-e29b-41d4-a716-446655440101',
      '550e8400-e29b-41d4-a716-446655440102',
      '550e8400-e29b-41d4-a716-446655440103',
      '550e8400-e29b-41d4-a716-446655440104'
    )
);

SELECT '✅ staff_scenario_assignmentsの関連データを削除しました' as status;

-- gm_availabilityの削除（テーブルが存在する場合のみ）
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'gm_availability'
  ) THEN
    DELETE FROM gm_availability
    WHERE staff_id IN (
      SELECT id FROM staff 
      WHERE 
        name LIKE '%田中%' 
        OR name LIKE '%佐藤%'
        OR name LIKE '%鈴木%'
        OR name LIKE '%高橋%'
        OR name LIKE '%太郎%'
        OR name LIKE '%花子%'
        OR name LIKE '%一郎%'
        OR name LIKE '%美咲%'
        OR id IN (
          '550e8400-e29b-41d4-a716-446655440101',
          '550e8400-e29b-41d4-a716-446655440102',
          '550e8400-e29b-41d4-a716-446655440103',
          '550e8400-e29b-41d4-a716-446655440104'
        )
    );
    RAISE NOTICE 'gm_availabilityの関連データを削除しました';
  ELSE
    RAISE NOTICE 'gm_availabilityテーブルは存在しません（スキップ）';
  END IF;
END $$;

-- ===========================
-- ステップ3: スタッフ本体を削除
-- ===========================

DELETE FROM staff
WHERE 
  name LIKE '%田中%' 
  OR name LIKE '%佐藤%'
  OR name LIKE '%鈴木%'
  OR name LIKE '%高橋%'
  OR name LIKE '%太郎%'
  OR name LIKE '%花子%'
  OR name LIKE '%一郎%'
  OR name LIKE '%美咲%'
  OR id IN (
    '550e8400-e29b-41d4-a716-446655440101',
    '550e8400-e29b-41d4-a716-446655440102',
    '550e8400-e29b-41d4-a716-446655440103',
    '550e8400-e29b-41d4-a716-446655440104'
  );

SELECT '✅ サンプルスタッフを削除しました' as status;

-- ===========================
-- ステップ4: 削除結果の確認
-- ===========================

SELECT 
  '削除完了' as status,
  COUNT(*) as 残りのスタッフ数
FROM staff;

-- 現在のスタッフ一覧
SELECT 
  name as スタッフ名,
  line_name as LINE名,
  array_to_string(role, ', ') as 役割,
  status as ステータス
FROM staff
ORDER BY 
  CASE 
    WHEN 'admin' = ANY(role) THEN 1
    WHEN 'manager' = ANY(role) THEN 2
    WHEN 'gm' = ANY(role) THEN 3
    ELSE 4
  END,
  name;


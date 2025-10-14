-- 退職済み（inactive）のスタッフを削除するSQL
-- 
-- ⚠️ 警告: このSQLを実行すると、退職済みスタッフとその関連データが永久に削除されます

-- ===========================
-- ステップ1: 削除対象の確認
-- ===========================

SELECT 
  'ステップ1: 削除対象の退職済みスタッフ' as action,
  id,
  name as スタッフ名,
  line_name as LINE名,
  array_to_string(role, ', ') as 役割,
  status as ステータス,
  created_at as 登録日,
  updated_at as 更新日
FROM staff
WHERE status = 'inactive'
ORDER BY name;

-- ===========================
-- ステップ2: 関連データ数の確認
-- ===========================

SELECT 
  'shift_submissions' as テーブル名,
  COUNT(*) as 削除されるレコード数
FROM shift_submissions
WHERE staff_id IN (SELECT id FROM staff WHERE status = 'inactive')
UNION ALL
SELECT 
  'staff_scenario_assignments',
  COUNT(*)
FROM staff_scenario_assignments
WHERE staff_id IN (SELECT id FROM staff WHERE status = 'inactive')
UNION ALL
SELECT 
  'staff本体',
  COUNT(*)
FROM staff
WHERE status = 'inactive';

-- ===========================
-- ステップ3: 関連データの削除
-- ===========================

-- ⚠️ 以下を実行すると削除されます

-- shift_submissionsの削除
DELETE FROM shift_submissions
WHERE staff_id IN (
  SELECT id FROM staff WHERE status = 'inactive'
);

SELECT '✅ shift_submissionsの関連データを削除しました' as status;

-- staff_scenario_assignmentsの削除
DELETE FROM staff_scenario_assignments
WHERE staff_id IN (
  SELECT id FROM staff WHERE status = 'inactive'
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
      SELECT id FROM staff WHERE status = 'inactive'
    );
    RAISE NOTICE 'gm_availabilityの関連データを削除しました';
  ELSE
    RAISE NOTICE 'gm_availabilityテーブルは存在しません（スキップ）';
  END IF;
END $$;

-- ===========================
-- ステップ4: スタッフ本体の削除
-- ===========================

DELETE FROM staff
WHERE status = 'inactive';

SELECT '✅ 退職済みスタッフを削除しました' as status;

-- ===========================
-- ステップ5: 削除結果の確認
-- ===========================

SELECT 
  '削除完了' as status,
  COUNT(*) as 残りのスタッフ数,
  COUNT(*) FILTER (WHERE status = 'active') as アクティブ,
  COUNT(*) FILTER (WHERE status = 'on-leave') as 休職中,
  COUNT(*) FILTER (WHERE status = 'inactive') as 退職済み
FROM staff;

-- 現在のスタッフ一覧
SELECT 
  name as スタッフ名,
  line_name as LINE名,
  array_to_string(role, ', ') as 役割,
  status as ステータス
FROM staff
ORDER BY 
  status,
  CASE 
    WHEN 'admin' = ANY(role) THEN 1
    WHEN 'manager' = ANY(role) THEN 2
    WHEN 'gm' = ANY(role) THEN 3
    ELSE 4
  END,
  name;


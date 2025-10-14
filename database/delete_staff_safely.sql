-- スタッフを安全に削除するSQL
-- 
-- 外部キー制約があるため、関連データも一緒に削除する必要があります
-- 
-- 使い方:
-- 1. 削除したいスタッフのIDまたは名前を確認
-- 2. 以下のSQLのスタッフ名を変更して実行

-- ===========================
-- ステップ1: 削除対象の確認
-- ===========================

-- 削除したいスタッフの情報を確認
SELECT 
  id,
  name as スタッフ名,
  line_name as LINE名,
  array_to_string(role, ', ') as 役割,
  status as ステータス,
  created_at as 登録日
FROM staff
WHERE 
  name = '削除したいスタッフ名'  -- ここを変更
  -- OR id = 'スタッフID'
ORDER BY name;

-- ===========================
-- ステップ2: 関連データの確認
-- ===========================

-- shift_submissionsでの参照を確認
SELECT 
  'shift_submissions' as テーブル名,
  COUNT(*) as 参照数
FROM shift_submissions
WHERE staff_id IN (
  SELECT id FROM staff WHERE name = '削除したいスタッフ名'  -- ここを変更
);

-- staff_scenario_assignmentsでの参照を確認
SELECT 
  'staff_scenario_assignments' as テーブル名,
  COUNT(*) as 参照数
FROM staff_scenario_assignments
WHERE staff_id IN (
  SELECT id FROM staff WHERE name = '削除したいスタッフ名'  -- ここを変更
);

-- schedule_eventsでの参照を確認（gms配列）
SELECT 
  'schedule_events (gms配列)' as テーブル名,
  COUNT(*) as 参照数
FROM schedule_events
WHERE '削除したいスタッフ名' = ANY(gms);  -- ここを変更

-- reservationsでの参照を確認
SELECT 
  'reservations (assigned_staff)' as テーブル名,
  COUNT(*) as 参照数
FROM reservations
WHERE '削除したいスタッフ名' = ANY(assigned_staff);  -- ここを変更

-- ===========================
-- ステップ3: 関連データの削除
-- ===========================

-- ⚠️ 警告: 以下を実行すると、データが永久に削除されます
-- 必ずバックアップを取ってから実行してください

-- shift_submissionsの削除
DELETE FROM shift_submissions
WHERE staff_id IN (
  SELECT id FROM staff WHERE name = '削除したいスタッフ名'  -- ここを変更
);

SELECT '✅ shift_submissionsの関連データを削除しました' as status;

-- staff_scenario_assignmentsの削除
DELETE FROM staff_scenario_assignments
WHERE staff_id IN (
  SELECT id FROM staff WHERE name = '削除したいスタッフ名'  -- ここを変更
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
      SELECT id FROM staff WHERE name = '削除したいスタッフ名'
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
WHERE name = '削除したいスタッフ名';  -- ここを変更

SELECT '✅ スタッフを削除しました' as status;

-- ===========================
-- ステップ5: 削除結果の確認
-- ===========================

SELECT 
  '削除完了' as status,
  COUNT(*) as 残りのスタッフ数
FROM staff;

-- 削除したスタッフがいないことを確認
SELECT 
  COUNT(*) as 削除したスタッフの残存数
FROM staff
WHERE name = '削除したいスタッフ名';  -- ここを変更
-- 結果が0であればOK

/*
=============================
複数のスタッフを一括削除する場合
=============================

-- 例: サンプルスタッフを全て削除
DELETE FROM shift_submissions
WHERE staff_id IN (
  SELECT id FROM staff 
  WHERE name IN ('田中太郎', '佐藤花子', '鈴木一郎', '高橋美咲')
);

DELETE FROM staff_scenario_assignments
WHERE staff_id IN (
  SELECT id FROM staff 
  WHERE name IN ('田中太郎', '佐藤花子', '鈴木一郎', '高橋美咲')
);

DELETE FROM staff
WHERE name IN ('田中太郎', '佐藤花子', '鈴木一郎', '高橋美咲');

=============================
IDで削除する場合
=============================

DELETE FROM shift_submissions
WHERE staff_id = 'スタッフのUUID';

DELETE FROM staff_scenario_assignments
WHERE staff_id = 'スタッフのUUID';

DELETE FROM staff
WHERE id = 'スタッフのUUID';

=============================
条件で一括削除する場合
=============================

-- 例: 退職済み（inactive）のスタッフを削除
DELETE FROM shift_submissions
WHERE staff_id IN (
  SELECT id FROM staff WHERE status = 'inactive'
);

DELETE FROM staff_scenario_assignments
WHERE staff_id IN (
  SELECT id FROM staff WHERE status = 'inactive'
);

DELETE FROM staff
WHERE status = 'inactive';
*/


-- スタッフの関連データを確認するSQL
-- 削除前に、どのテーブルで参照されているかを確認

-- 田中太郎のIDを取得
WITH target_staff AS (
  SELECT id, name 
  FROM staff 
  WHERE name LIKE '%田中%' OR name LIKE '%太郎%'
)
SELECT 
  '対象スタッフ' as category,
  id,
  name
FROM target_staff;

-- shift_submissionsでの参照を確認
SELECT 
  'shift_submissions' as テーブル名,
  COUNT(*) as 参照数,
  STRING_AGG(DISTINCT s.name, ', ') as スタッフ名
FROM shift_submissions ss
INNER JOIN staff s ON ss.staff_id = s.id
WHERE s.name LIKE '%田中%' OR s.name LIKE '%太郎%';

-- staff_scenario_assignmentsでの参照を確認
SELECT 
  'staff_scenario_assignments' as テーブル名,
  COUNT(*) as 参照数,
  STRING_AGG(DISTINCT s.name, ', ') as スタッフ名
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
WHERE s.name LIKE '%田中%' OR s.name LIKE '%太郎%';

-- schedule_eventsでの参照を確認（gms配列に名前が含まれる場合）
SELECT 
  'schedule_events' as テーブル名,
  COUNT(*) as 参照数
FROM schedule_events
WHERE '田中 太郎' = ANY(gms) OR '田中太郎' = ANY(gms);

-- reservationsでの参照を確認（assigned_staff配列に名前が含まれる場合）
SELECT 
  'reservations (assigned_staff)' as テーブル名,
  COUNT(*) as 参照数
FROM reservations
WHERE '田中 太郎' = ANY(assigned_staff) OR '田中太郎' = ANY(assigned_staff);

-- reservationsでの参照を確認（gm_staffに名前が含まれる場合）
SELECT 
  'reservations (gm_staff)' as テーブル名,
  COUNT(*) as 参照数
FROM reservations
WHERE gm_staff LIKE '%田中%' OR gm_staff LIKE '%太郎%';

-- すべてのサンプルスタッフの関連データを確認
SELECT 
  '全サンプルスタッフの参照サマリー' as category,
  s.name as スタッフ名,
  (SELECT COUNT(*) FROM shift_submissions WHERE staff_id = s.id) as shift_submissions数,
  (SELECT COUNT(*) FROM staff_scenario_assignments WHERE staff_id = s.id) as scenario_assignments数
FROM staff s
WHERE 
  s.name LIKE '%田中%' 
  OR s.name LIKE '%佐藤%'
  OR s.name LIKE '%鈴木%'
  OR s.name LIKE '%高橋%'
  OR s.name LIKE '%太郎%'
  OR s.name LIKE '%花子%'
  OR s.name LIKE '%一郎%'
  OR s.name LIKE '%美咲%'
ORDER BY s.name;


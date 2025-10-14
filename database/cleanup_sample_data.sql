-- サンプルデータのクリーンアップ
-- デモ用の「田中太郎」「佐藤花子」などのサンプルスタッフを削除

-- ステップ1: 削除対象のサンプルスタッフを確認
SELECT 
  'ステップ1: 削除対象の確認' as action,
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
ORDER BY name;

-- ステップ2a: サンプルスタッフの関連データを削除（shift_submissions）
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
);

SELECT '✅ 関連データ（shift_submissions）を削除しました' as status;

-- ステップ2b: サンプルスタッフの関連データを削除（staff_scenario_assignments）
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
);

SELECT '✅ 関連データ（staff_scenario_assignments）を削除しました' as status;

-- ステップ2c: gm_availabilityの削除（テーブルが存在する場合のみ）
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
    );
    RAISE NOTICE 'gm_availabilityの関連データを削除しました';
  ELSE
    RAISE NOTICE 'gm_availabilityテーブルは存在しません（スキップ）';
  END IF;
END $$;

-- ステップ2d: サンプルスタッフを削除
DELETE FROM staff
WHERE 
  name LIKE '%田中%' 
  OR name LIKE '%佐藤%'
  OR name LIKE '%鈴木%'
  OR name LIKE '%高橋%'
  OR name LIKE '%太郎%'
  OR name LIKE '%花子%'
  OR name LIKE '%一郎%'
  OR name LIKE '%美咲%';

-- 削除結果
SELECT 
  '✅ サンプルスタッフを削除しました' as status,
  COUNT(*) as 残りのスタッフ数
FROM staff;

-- ステップ3: 残っているスタッフの確認
SELECT 
  'ステップ3: 現在のスタッフ一覧' as action,
  name as スタッフ名,
  line_name as LINE名,
  array_to_string(role, ', ') as 役割,
  CASE 
    WHEN user_id IS NOT NULL THEN '紐づけ済み'
    ELSE '未紐づけ'
  END as アカウント紐づけ,
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


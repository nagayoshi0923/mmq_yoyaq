-- 間違ったGMフラグを修正
-- 
-- 問題: 体験済みのみのスタッフが can_main_gm = true になっている
-- 解決: 体験済みのみに変更する

-- ===========================
-- ⚠️ 警告
-- ===========================
-- このSQLは全てのGMアサインメントをリセットします
-- 実行前に必ずバックアップを取ってください
--
-- または、正しいGMアサインメントデータを
-- import_all_gm_assignments_part*.sql から再インポートしてください

-- ===========================
-- オプション1: 特定シナリオのみ修正（流年の例）
-- ===========================

-- 流年: 正しいGMは えりん、れいにー、イワセモリシ、あんころ のみ

-- 1. まず流年の全スタッフを体験済みのみに設定
UPDATE staff_scenario_assignments ssa
SET 
  can_main_gm = false,
  can_sub_gm = false,
  is_experienced = true,
  can_gm_at = NULL
FROM scenarios sc
WHERE ssa.scenario_id = sc.id
  AND sc.title = '流年';

-- 2. 正しいGMスタッフのみGM可能に設定
UPDATE staff_scenario_assignments ssa
SET 
  can_main_gm = true,
  can_sub_gm = false,
  is_experienced = false,
  can_gm_at = NOW()
FROM staff s, scenarios sc
WHERE ssa.staff_id = s.id
  AND ssa.scenario_id = sc.id
  AND sc.title = '流年'
  AND s.name IN ('えりん', 'れいにー', 'イワセモリシ', 'あんころ');

SELECT '✅ 流年のGMアサインメントを修正しました' as status;

-- ===========================
-- 確認クエリ
-- ===========================

SELECT 
  s.name as スタッフ名,
  CASE 
    WHEN ssa.can_main_gm = true THEN 'メインGM可能'
    WHEN ssa.can_sub_gm = true THEN 'サブGM可能'
    WHEN ssa.is_experienced = true THEN '体験済みのみ'
    ELSE '未設定'
  END as 状態
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = '流年'
ORDER BY 
  CASE 
    WHEN ssa.can_main_gm = true THEN 1
    WHEN ssa.can_sub_gm = true THEN 2
    WHEN ssa.is_experienced = true THEN 3
    ELSE 4
  END,
  s.name;

-- ===========================
-- オプション2: 全データをリセットして再インポート（推奨）
-- ===========================

-- 全てのGMアサインメントを削除
-- DELETE FROM staff_scenario_assignments;

-- その後、正しいデータを再インポート
-- database/import_all_gm_assignments.sql を実行
-- database/import_all_gm_assignments_part2.sql を実行
-- ... part6まで実行

-- ===========================
-- オプション3: インポートSQLを修正
-- ===========================

/*
問題の原因:
import_all_gm_assignments.sql で、体験済みのスタッフに対して
間違って can_main_gm = true が設定されている可能性があります。

解決策:
1. 正しいGMアサインメントリストを確認
2. import_all_gm_assignments.sql を修正
3. 再インポート
*/


-- 全GMアサインメント一括実行スクリプト
-- 
-- このファイルをSupabaseのSQL Editorで実行すると、
-- 全6パートを一度に実行できます（推奨しません、段階的実行を推奨）

-- ===========================
-- 事前確認
-- ===========================

-- 必要なテーブルとカラムが存在するか確認
SELECT 
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_scenario_assignments') as table_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_scenario_assignments' AND column_name = 'can_main_gm') as can_main_gm_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_scenario_assignments' AND column_name = 'can_sub_gm') as can_sub_gm_exists,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scenarios' AND column_name = 'requires_sub_gm') as requires_sub_gm_exists;

-- シナリオとスタッフの数を確認
SELECT 
  (SELECT COUNT(*) FROM scenarios) as シナリオ数,
  (SELECT COUNT(*) FROM staff) as スタッフ数;

-- ===========================
-- 実行方法
-- ===========================

/*
推奨実行方法:

1. 段階的に実行（安全）
   a. import_all_gm_assignments.sql（パート1）を実行
   b. 確認: SELECT COUNT(*) FROM staff_scenario_assignments;
   c. import_all_gm_assignments_part2.sql を実行
   d. 以下同様にパート3~6を実行

2. 一括実行（上級者向け）
   全6ファイルの内容を順番にコピー&ペーストして一度に実行
   
   注意: エラーが発生した場合、どのパートでエラーが起きたか
   特定しづらくなります。

実行後の確認:

-- 総アサイン数
SELECT COUNT(*) as total_assignments FROM staff_scenario_assignments;

-- スタッフ別のGM可能シナリオ数トップ10
SELECT 
  s.name,
  COUNT(*) as gm_scenarios
FROM staff s
INNER JOIN staff_scenario_assignments ssa ON s.id = ssa.staff_id
WHERE ssa.can_main_gm = true
GROUP BY s.name
ORDER BY COUNT(*) DESC
LIMIT 10;

-- シナリオ別のGM可能スタッフ数トップ10
SELECT 
  sc.title,
  COUNT(*) as gm_count
FROM scenarios sc
INNER JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
WHERE ssa.can_main_gm = true
GROUP BY sc.title
ORDER BY COUNT(*) DESC
LIMIT 10;
*/


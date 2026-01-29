-- ============================================================
-- シナリオマスタテーブルの存在確認
-- Supabase SQL Editor で実行してください
-- ============================================================

-- 1. テーブルの存在確認
SELECT 
  'scenario_masters' as table_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'scenario_masters'
  ) as exists;

SELECT 
  'organization_scenarios' as table_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'organization_scenarios'
  ) as exists;

-- 2. テーブルが存在する場合、件数を確認
SELECT 'scenario_masters件数' as description, COUNT(*) as count FROM scenario_masters;
SELECT 'organization_scenarios件数' as description, COUNT(*) as count FROM organization_scenarios;
SELECT 'scenarios件数（旧）' as description, COUNT(*) as count FROM scenarios;

-- 3. ビューの存在確認
SELECT 
  'organization_scenarios_with_master' as view_name,
  EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' AND table_name = 'organization_scenarios_with_master'
  ) as exists;

-- 4. テーブルのカラム一覧（テーブルが存在する場合）
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'scenario_masters'
ORDER BY ordinal_position;

-- ============================================================
-- 結果の解釈
-- ============================================================
-- - scenario_masters が false → テーブル未作成、移行が必要
-- - scenario_masters が true で件数 0 → テーブルはあるがデータ未移行
-- - scenario_masters が true で件数 > 0 → データ移行済み
-- ============================================================





-- GMアサインメントの状態を確認するSQL
-- 
-- 現在登録されているGMアサインメントの詳細を確認し、
-- 体験済みだけのスタッフがGMとして表示されている問題を調査

-- ===========================
-- カラムの存在確認
-- ===========================

SELECT 
  'カラムの確認' as category,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'staff_scenario_assignments'
  AND column_name IN ('can_main_gm', 'can_sub_gm', 'is_experienced', 'staff_id', 'scenario_id')
ORDER BY column_name;

-- ===========================
-- 現在のデータ状態を確認
-- ===========================

-- 全体のサマリー
SELECT 
  '全体サマリー' as category,
  COUNT(*) as 総レコード数,
  COUNT(*) FILTER (WHERE can_main_gm = true) as メインGM可能,
  COUNT(*) FILTER (WHERE can_sub_gm = true) as サブGM可能,
  COUNT(*) FILTER (WHERE is_experienced = true) as 体験済みのみ,
  COUNT(*) FILTER (WHERE can_main_gm IS NULL) as can_main_gm未設定,
  COUNT(*) FILTER (WHERE can_sub_gm IS NULL) as can_sub_gm未設定,
  COUNT(*) FILTER (WHERE is_experienced IS NULL) as is_experienced未設定
FROM staff_scenario_assignments;

-- ===========================
-- シナリオ別の状態確認（サンプル）
-- ===========================

SELECT 
  sc.title as シナリオ名,
  s.name as スタッフ名,
  COALESCE(ssa.can_main_gm, false) as メインGM,
  COALESCE(ssa.can_sub_gm, false) as サブGM,
  COALESCE(ssa.is_experienced, false) as 体験済み,
  CASE 
    WHEN ssa.can_main_gm = true OR ssa.can_sub_gm = true THEN 'GM可能'
    WHEN ssa.is_experienced = true THEN '体験済みのみ'
    WHEN ssa.can_main_gm IS NULL THEN 'カラム未設定'
    ELSE '未設定'
  END as 状態
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
ORDER BY sc.title, s.name
LIMIT 50;

-- ===========================
-- 問題のあるレコードを特定
-- ===========================

-- can_main_gm, can_sub_gm カラムがNULLまたは存在しないレコード
SELECT 
  '問題: カラムがNULLまたは未設定' as 問題,
  COUNT(*) as レコード数,
  STRING_AGG(DISTINCT sc.title, ', ') as 影響シナリオ例
FROM staff_scenario_assignments ssa
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE 
  ssa.can_main_gm IS NULL 
  OR ssa.can_sub_gm IS NULL
LIMIT 10;

-- ===========================
-- 解決策の確認
-- ===========================

/*
問題のパターンと解決策:

パターン1: can_main_gm, can_sub_gm カラムが存在しない
→ 解決: redesign_gm_system_v3.sql を実行してカラムを追加

パターン2: カラムは存在するが、全てNULL
→ 解決: デフォルト値をfalseに設定
   UPDATE staff_scenario_assignments 
   SET can_main_gm = false, can_sub_gm = false, is_experienced = false
   WHERE can_main_gm IS NULL;

パターン3: カラムは存在するが、全てfalse
→ 解決: 正しいGMアサインメントデータをインポート
   import_all_gm_assignments.sql 等を実行

パターン4: 旧システムのデータが残っている
→ 解決: 一度全削除してから新しいデータをインポート
   DELETE FROM staff_scenario_assignments;
   その後、import_all_gm_assignments.sql を実行
*/

-- ===========================
-- 現在のシステムで使用しているAPIの動作確認
-- ===========================

-- ScenarioManagement.tsxで使用しているクエリをシミュレート
-- （can_main_gm または can_sub_gm がtrueのスタッフのみ取得）
SELECT 
  'API動作確認: GM可能なスタッフのみ' as category,
  sc.title as シナリオ名,
  COUNT(*) as GM可能人数,
  STRING_AGG(s.name, ', ' ORDER BY s.name) as GM可能スタッフ
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
GROUP BY sc.title
ORDER BY COUNT(*) DESC
LIMIT 20;

-- 体験済みのみのスタッフ（GM不可能）
SELECT 
  'API動作確認: 体験済みのみ（GM不可）' as category,
  sc.title as シナリオ名,
  COUNT(*) as 体験済み人数,
  STRING_AGG(s.name, ', ' ORDER BY s.name) as 体験済みスタッフ
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE 
  (ssa.can_main_gm = false OR ssa.can_main_gm IS NULL)
  AND (ssa.can_sub_gm = false OR ssa.can_sub_gm IS NULL)
  AND ssa.is_experienced = true
GROUP BY sc.title
ORDER BY COUNT(*) DESC
LIMIT 20;


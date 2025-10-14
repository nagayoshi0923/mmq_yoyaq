-- 誤ったGMアサインメントデータを確認
-- 
-- 問題: 体験済みのみのスタッフが can_main_gm = true になっている

-- ===========================
-- 流年シナリオの確認
-- ===========================

-- 正しいGM: えりん、れいにー、モリシ、あんころ（4人）
-- データベースに登録されている全員（13人）を確認

SELECT 
  s.name as スタッフ名,
  ssa.can_main_gm as メインGM可能,
  ssa.can_sub_gm as サブGM可能,
  ssa.is_experienced as 体験済み,
  CASE 
    WHEN s.name IN ('えりん', 'れいにー', 'イワセモリシ', 'あんころ') THEN '✅ 正しいGM'
    ELSE '❌ 体験済みのみ（間違ってGM可能になっている）'
  END as 正誤
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = '流年'
  AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
ORDER BY 
  CASE 
    WHEN s.name IN ('えりん', 'れいにー', 'イワセモリシ', 'あんころ') THEN 1
    ELSE 2
  END,
  s.name;

-- ===========================
-- 修正が必要なレコード数の確認
-- ===========================

SELECT 
  '修正が必要なレコード' as カテゴリ,
  COUNT(*) as レコード数
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = '流年'
  AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
  AND s.name NOT IN ('えりん', 'れいにー', 'イワセモリシ', 'あんころ');

-- ===========================
-- 間違ってGM可能になっているスタッフリスト
-- ===========================

SELECT 
  sc.title as シナリオ名,
  s.name as スタッフ名,
  '体験済みのみに修正すべき' as アクション
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = '流年'
  AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
  AND s.name NOT IN ('えりん', 'れいにー', 'イワセモリシ', 'あんころ')
ORDER BY s.name;


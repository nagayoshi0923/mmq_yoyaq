-- 特定のシナリオのGMアサインメントを詳しく確認
-- フロントエンドで表示されている「体験済みだけのスタッフ」を特定

-- ===========================
-- 流年の全アサインメント
-- ===========================

SELECT 
  'シナリオ: 流年' as category,
  s.name as スタッフ名,
  COALESCE(ssa.can_main_gm, false) as メインGM可能,
  COALESCE(ssa.can_sub_gm, false) as サブGM可能,
  COALESCE(ssa.is_experienced, false) as 体験済みのみ,
  CASE 
    WHEN ssa.can_main_gm = true THEN '✅ メインGM'
    WHEN ssa.can_sub_gm = true THEN '✅ サブGM'
    WHEN ssa.is_experienced = true THEN '❌ 体験済みのみ（表示しない）'
    ELSE '❓ 未設定'
  END as 状態,
  ssa.assigned_at as 登録日時
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
LEFT JOIN staff s ON ssa.staff_id = s.id
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
-- API のクエリをシミュレート
-- ===========================

-- これがフロントエンドのassignmentApi.getScenarioAssignments()と同じ
SELECT 
  'API結果: 流年のGM可能スタッフ' as category,
  s.name as スタッフ名,
  ssa.can_main_gm,
  ssa.can_sub_gm
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = '流年'
  AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
ORDER BY s.name;

-- ===========================
-- 体験済みのみのスタッフ（表示されるべきでない）
-- ===========================

SELECT 
  '⚠️ 体験済みのみ（表示されるべきでない）' as category,
  s.name as スタッフ名,
  sc.title as シナリオ名
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE 
  (ssa.can_main_gm = false OR ssa.can_main_gm IS NULL)
  AND (ssa.can_sub_gm = false OR ssa.can_sub_gm IS NULL)
  AND ssa.is_experienced = true
  AND sc.title IN ('流年', '荒廃のマリス', 'アンドロイドは愛を知らない')
ORDER BY sc.title, s.name;

-- ===========================
-- 全シナリオのGM人数チェック
-- ===========================

SELECT 
  sc.title as シナリオ名,
  COUNT(*) FILTER (WHERE ssa.can_main_gm = true OR ssa.can_sub_gm = true) as GM可能人数,
  COUNT(*) FILTER (WHERE ssa.is_experienced = true AND (ssa.can_main_gm IS NULL OR ssa.can_main_gm = false) AND (ssa.can_sub_gm IS NULL OR ssa.can_sub_gm = false)) as 体験済みのみ人数,
  COUNT(*) as 全アサインメント数
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
GROUP BY sc.title
HAVING COUNT(*) > 0
ORDER BY sc.title;


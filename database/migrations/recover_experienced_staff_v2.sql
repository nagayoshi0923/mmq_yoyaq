-- ============================================================
-- 体験済みスタッフ 診断 + 強制復旧 v2
-- ============================================================

-- ===== 診断 =====

-- 1. staff_scenario_assignments の is_experienced=true 総数
SELECT '1. is_experienced=true 総レコード数: ' || COUNT(*) as diag
FROM staff_scenario_assignments WHERE is_experienced = true;

-- 2. そのうち scenarios テーブルとマッピングできるもの
SELECT '2. scenarios経由でマッピング可能: ' || COUNT(*) as diag
FROM staff_scenario_assignments ssa
JOIN scenarios s ON s.id = ssa.scenario_id
WHERE ssa.is_experienced = true AND s.scenario_master_id IS NOT NULL;

-- 3. そのうち scenario_master_id がNULLのもの（マッピング不可）
SELECT '3. scenario_master_id NULL（マッピング不可）: ' || COUNT(*) as diag
FROM staff_scenario_assignments ssa
JOIN scenarios s ON s.id = ssa.scenario_id
WHERE ssa.is_experienced = true AND s.scenario_master_id IS NULL;

-- 4. scenarios にすらJOINできないもの（orphan records）
SELECT '4. scenariosテーブルにJOIN不可: ' || COUNT(*) as diag
FROM staff_scenario_assignments ssa
LEFT JOIN scenarios s ON s.id = ssa.scenario_id
WHERE ssa.is_experienced = true AND s.id IS NULL;

-- 5. organization_scenarios の experienced_staff 設定済み数
SELECT '5. org_scenarios experienced_staff設定済み: ' || COUNT(*) as diag
FROM organization_scenarios 
WHERE experienced_staff IS NOT NULL AND experienced_staff != '{}' AND array_length(experienced_staff, 1) > 0;

-- ===== 修正: scenario_master_id が NULL のシナリオを修正 =====
-- scenarios.title でマッチして scenario_master_id を設定
UPDATE scenarios s
SET scenario_master_id = sm.id
FROM scenario_masters sm
WHERE s.scenario_master_id IS NULL
  AND s.title = sm.title;

SELECT '修正: scenario_master_id NULLを修復した件数: ' || COUNT(*) as result
FROM scenarios WHERE scenario_master_id IS NOT NULL;

-- ===== 復旧: 全ソースから experienced_staff を再構築 =====

WITH exp_via_scenarios AS (
  SELECT 
    s.scenario_master_id,
    ssa.organization_id,
    st.name
  FROM staff_scenario_assignments ssa
  JOIN scenarios s ON s.id = ssa.scenario_id
  JOIN staff st ON st.id = ssa.staff_id
  WHERE ssa.is_experienced = true
    AND s.scenario_master_id IS NOT NULL
    AND st.name IS NOT NULL AND st.name != ''
),
exp_via_masters AS (
  SELECT 
    ssa.scenario_id as scenario_master_id,
    ssa.organization_id,
    st.name
  FROM staff_scenario_assignments ssa
  JOIN staff st ON st.id = ssa.staff_id
  WHERE ssa.is_experienced = true
    AND st.name IS NOT NULL AND st.name != ''
    AND EXISTS (SELECT 1 FROM scenario_masters sm WHERE sm.id = ssa.scenario_id)
),
-- タイトルベースのマッチ（scenario_master_id がNULLでもタイトルで紐付け）
exp_via_title AS (
  SELECT 
    sm.id as scenario_master_id,
    ssa.organization_id,
    st.name
  FROM staff_scenario_assignments ssa
  JOIN scenarios s ON s.id = ssa.scenario_id
  JOIN staff st ON st.id = ssa.staff_id
  JOIN scenario_masters sm ON sm.title = s.title
  WHERE ssa.is_experienced = true
    AND st.name IS NOT NULL AND st.name != ''
),
-- 全組織に展開（organization_scenarios に存在する組み合わせのみ）
exp_all_orgs AS (
  SELECT DISTINCT
    os.scenario_master_id,
    os.organization_id,
    sub.name
  FROM (
    SELECT scenario_master_id, name FROM exp_via_scenarios
    UNION
    SELECT scenario_master_id, name FROM exp_via_masters
    UNION
    SELECT scenario_master_id, name FROM exp_via_title
  ) sub
  JOIN organization_scenarios os ON os.scenario_master_id = sub.scenario_master_id
),
merged AS (
  SELECT 
    scenario_master_id,
    organization_id,
    ARRAY_AGG(DISTINCT name ORDER BY name) as exp_list
  FROM exp_all_orgs
  GROUP BY scenario_master_id, organization_id
)
UPDATE organization_scenarios os
SET 
  experienced_staff = m.exp_list,
  updated_at = NOW()
FROM merged m
WHERE os.scenario_master_id = m.scenario_master_id
  AND os.organization_id = m.organization_id;

-- ===== 結果確認 =====
SELECT '復旧後 experienced_staff設定済み: ' || COUNT(*) || ' シナリオ' as result
FROM organization_scenarios 
WHERE experienced_staff IS NOT NULL AND experienced_staff != '{}' AND array_length(experienced_staff, 1) > 0;

-- 詳細
SELECT 
  sm.title,
  array_length(os.experienced_staff, 1) as 体験済み人数,
  array_to_string(os.experienced_staff, ', ') as 体験済みスタッフ
FROM organization_scenarios os
JOIN scenario_masters sm ON sm.id = os.scenario_master_id
WHERE os.experienced_staff IS NOT NULL AND array_length(os.experienced_staff, 1) > 0
ORDER BY array_length(os.experienced_staff, 1) DESC;

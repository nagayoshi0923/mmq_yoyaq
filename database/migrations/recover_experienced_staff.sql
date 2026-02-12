-- ============================================================
-- 体験済みスタッフデータ復旧
-- staff_scenario_assignments のデータは触っていないので残っている
-- ============================================================

-- まず現状確認
SELECT 'staff_scenario_assignments is_experienced=true 件数: ' || COUNT(*) as check1
FROM staff_scenario_assignments WHERE is_experienced = true;

SELECT 'organization_scenarios experienced_staff設定済み: ' || COUNT(*) as check2
FROM organization_scenarios 
WHERE experienced_staff IS NOT NULL AND experienced_staff != '{}' AND array_length(experienced_staff, 1) > 0;

-- ============================================================
-- 復旧: staff_scenario_assignments → organization_scenarios
-- scenarios テーブル経由で全マッピングを取得
-- ============================================================

-- STEP 1: scenarios.id → scenario_master_id のマッピングで体験済みを取得
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
-- STEP 2: scenario_id が直接 scenario_masters.id のケース
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
-- STEP 3: scenario_id が scenarios.id で、同じscenarios.idを持つ他のorg_idも含める
-- （organization_idが異なるケースへの対応）
exp_all_orgs AS (
  SELECT 
    s.scenario_master_id,
    os.organization_id,
    st.name
  FROM staff_scenario_assignments ssa
  JOIN scenarios s ON s.id = ssa.scenario_id
  JOIN staff st ON st.id = ssa.staff_id
  JOIN organization_scenarios os ON os.scenario_master_id = s.scenario_master_id
  WHERE ssa.is_experienced = true
    AND s.scenario_master_id IS NOT NULL
    AND st.name IS NOT NULL AND st.name != ''
),
-- 全ソース統合
all_exp AS (
  SELECT scenario_master_id, organization_id, name FROM exp_via_scenarios
  UNION
  SELECT scenario_master_id, organization_id, name FROM exp_via_masters
  UNION
  SELECT scenario_master_id, organization_id, name FROM exp_all_orgs
),
merged AS (
  SELECT 
    scenario_master_id,
    organization_id,
    ARRAY_AGG(DISTINCT name ORDER BY name) as exp_list
  FROM all_exp
  GROUP BY scenario_master_id, organization_id
)
UPDATE organization_scenarios os
SET 
  experienced_staff = m.exp_list,
  updated_at = NOW()
FROM merged m
WHERE os.scenario_master_id = m.scenario_master_id
  AND os.organization_id = m.organization_id;

-- 結果確認
SELECT 'recovered experienced_staff: ' || COUNT(*) || ' scenarios' as result
FROM organization_scenarios 
WHERE experienced_staff IS NOT NULL AND experienced_staff != '{}' AND array_length(experienced_staff, 1) > 0;

-- 詳細確認（上位20件）
SELECT 
  sm.title,
  os.experienced_staff,
  array_length(os.experienced_staff, 1) as count
FROM organization_scenarios os
JOIN scenario_masters sm ON sm.id = os.scenario_master_id
WHERE os.experienced_staff IS NOT NULL AND array_length(os.experienced_staff, 1) > 0
ORDER BY array_length(os.experienced_staff, 1) DESC
LIMIT 20;

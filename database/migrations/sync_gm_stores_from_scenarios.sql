-- scenarios テーブルから organization_scenarios に GM/店舗/体験済み情報をコピー
-- 作成日: 2026-01-22
-- 概要: 旧UIで設定された available_gms, available_stores, experienced_staff を新UIに反映

-- 確認用：現在のデータ状況
-- SELECT 
--   s.title,
--   s.available_gms AS old_gms,
--   os.available_gms AS new_gms,
--   s.available_stores AS old_stores,
--   os.available_stores AS new_stores
-- FROM scenarios s
-- JOIN organization_scenarios os ON os.scenario_master_id = s.scenario_master_id
-- WHERE s.available_gms IS NOT NULL OR s.available_stores IS NOT NULL
-- LIMIT 20;

-- ========================================
-- STEP 1: available_gms をコピー
-- ========================================
UPDATE organization_scenarios os
SET available_gms = s.available_gms
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
  AND s.available_gms IS NOT NULL
  AND array_length(s.available_gms, 1) > 0
  AND (os.available_gms IS NULL OR array_length(os.available_gms, 1) = 0 OR array_length(os.available_gms, 1) IS NULL);

-- ========================================
-- STEP 2: available_stores をコピー
-- ========================================
UPDATE organization_scenarios os
SET available_stores = s.available_stores
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
  AND s.available_stores IS NOT NULL
  AND array_length(s.available_stores, 1) > 0
  AND (os.available_stores IS NULL OR array_length(os.available_stores, 1) = 0 OR array_length(os.available_stores, 1) IS NULL);

-- ========================================
-- STEP 3: experienced_staff をコピー
-- ========================================
UPDATE organization_scenarios os
SET experienced_staff = s.experienced_staff
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
  AND s.experienced_staff IS NOT NULL
  AND array_length(s.experienced_staff, 1) > 0
  AND (os.experienced_staff IS NULL OR array_length(os.experienced_staff, 1) = 0 OR array_length(os.experienced_staff, 1) IS NULL);

-- ========================================
-- STEP 4: gm_count をコピー
-- ========================================
UPDATE organization_scenarios os
SET gm_count = s.gm_count
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
  AND s.gm_count IS NOT NULL
  AND s.gm_count > 0
  AND (os.gm_count IS NULL OR os.gm_count = 0);

-- ========================================
-- STEP 5: gm_costs をコピー
-- ========================================
UPDATE organization_scenarios os
SET gm_costs = s.gm_costs
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
  AND s.gm_costs IS NOT NULL
  AND jsonb_array_length(s.gm_costs) > 0
  AND (os.gm_costs IS NULL OR jsonb_array_length(os.gm_costs) = 0);

-- ========================================
-- STEP 6: license_amount をコピー
-- ========================================
UPDATE organization_scenarios os
SET license_amount = s.license_amount
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
  AND s.license_amount IS NOT NULL
  AND s.license_amount > 0
  AND (os.license_amount IS NULL OR os.license_amount = 0);

-- ========================================
-- STEP 7: gm_test_license_amount をコピー
-- ========================================
UPDATE organization_scenarios os
SET gm_test_license_amount = s.gm_test_license_amount
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND os.organization_id = s.organization_id
  AND s.gm_test_license_amount IS NOT NULL
  AND s.gm_test_license_amount > 0
  AND (os.gm_test_license_amount IS NULL OR os.gm_test_license_amount = 0);

-- 確認用クエリ（実行後）
-- SELECT 
--   sm.title,
--   os.available_gms,
--   os.available_stores,
--   os.experienced_staff,
--   os.gm_count,
--   os.license_amount
-- FROM organization_scenarios os
-- JOIN scenario_masters sm ON sm.id = os.scenario_master_id
-- WHERE os.available_gms IS NOT NULL OR os.available_stores IS NOT NULL
-- ORDER BY sm.title
-- LIMIT 30;


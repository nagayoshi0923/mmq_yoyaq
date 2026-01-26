-- organization_scenariosにscenariosのライセンス金額をコピー
-- scenariosテーブルに保存されていたライセンス関連データを
-- organization_scenariosテーブルに移行する

-- 1. まず現在の状態を確認
SELECT 
  'scenarios' as table_name,
  COUNT(*) as total,
  COUNT(license_amount) as has_license_amount
FROM scenarios
UNION ALL
SELECT 
  'organization_scenarios' as table_name,
  COUNT(*) as total,
  COUNT(license_amount) as has_license_amount
FROM organization_scenarios;

-- 2. scenariosからorganization_scenariosにライセンス金額をコピー
-- scenario_master_idで紐付け
UPDATE organization_scenarios os
SET 
  license_amount = COALESCE(os.license_amount, s.license_amount),
  gm_test_license_amount = COALESCE(os.gm_test_license_amount, s.gm_test_license_amount),
  franchise_license_amount = COALESCE(os.franchise_license_amount, s.franchise_license_amount),
  franchise_gm_test_license_amount = COALESCE(os.franchise_gm_test_license_amount, s.franchise_gm_test_license_amount),
  external_license_amount = COALESCE(os.external_license_amount, s.external_license_amount),
  external_gm_test_license_amount = COALESCE(os.external_gm_test_license_amount, s.external_gm_test_license_amount)
FROM scenarios s
WHERE os.scenario_master_id = s.scenario_master_id
  AND (
    os.license_amount IS NULL 
    OR os.gm_test_license_amount IS NULL
    OR os.franchise_license_amount IS NULL
    OR os.franchise_gm_test_license_amount IS NULL
    OR os.external_license_amount IS NULL
    OR os.external_gm_test_license_amount IS NULL
  );

-- 3. 結果を確認
SELECT 
  os.id,
  sm.title,
  os.license_amount,
  os.gm_test_license_amount,
  os.franchise_license_amount,
  os.external_license_amount
FROM organization_scenarios os
JOIN scenario_masters sm ON os.scenario_master_id = sm.id
WHERE os.license_amount IS NOT NULL
LIMIT 10;


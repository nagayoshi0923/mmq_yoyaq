-- =============================================================================
-- staff_scenario_assignments の organization_id NULL を修正
-- =============================================================================
-- 問題: organization_id が NULL のレコードが残っており、全組織から見える状態
-- 修正: NULL をすべてクインズワルツに紐付け、NOT NULL 制約を追加
-- =============================================================================

-- STEP 1: 現状確認
SELECT 'Before: Total records' as label, COUNT(*) as cnt FROM staff_scenario_assignments
UNION ALL
SELECT 'Before: organization_id IS NULL', COUNT(*) FROM staff_scenario_assignments WHERE organization_id IS NULL
UNION ALL
SELECT 'Before: organization_id IS NOT NULL', COUNT(*) FROM staff_scenario_assignments WHERE organization_id IS NOT NULL;

-- STEP 2: NULL レコードをクインズワルツ (a0000000-0000-0000-0000-000000000001) に更新
UPDATE staff_scenario_assignments
SET organization_id = 'a0000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- STEP 3: 更新結果の確認
SELECT 'After: organization_id IS NULL', COUNT(*) as cnt
FROM staff_scenario_assignments
WHERE organization_id IS NULL;

-- STEP 4: NOT NULL 制約を追加（今後 NULL が入らないようにする）
ALTER TABLE staff_scenario_assignments
  ALTER COLUMN organization_id SET NOT NULL;

-- STEP 5: 確認
SELECT 'Done: All records now have organization_id' as status,
       COUNT(*) as total_records
FROM staff_scenario_assignments;

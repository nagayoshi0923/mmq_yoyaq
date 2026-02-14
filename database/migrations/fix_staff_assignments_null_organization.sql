-- =============================================================================
-- staff_scenario_assignments への統合マイグレーション
-- =============================================================================
-- 概要:
--   1. organization_scenarios の available_gms / gm_assignments / experienced_staff
--      にしかないデータを staff_scenario_assignments に補完
--   2. organization_id が NULL のレコードをクインズワルツに修正
--   3. organization_id に NOT NULL 制約を追加
-- =============================================================================

-- ===========================================
-- STEP 0: 統合前の状態確認
-- ===========================================
SELECT '=== 統合前の状態 ===' as step;

SELECT 'staff_scenario_assignments: ' || COUNT(*) as total FROM staff_scenario_assignments;
SELECT '  うち GM可能: ' || COUNT(*) as gm FROM staff_scenario_assignments WHERE can_main_gm = true OR can_sub_gm = true;
SELECT '  うち 体験済みのみ: ' || COUNT(*) as exp FROM staff_scenario_assignments WHERE is_experienced = true AND can_main_gm = false AND can_sub_gm = false;
SELECT '  うち org_id NULL: ' || COUNT(*) as null_org FROM staff_scenario_assignments WHERE organization_id IS NULL;

SELECT 'organization_scenarios で available_gms あり: ' || COUNT(*) as org_gm
FROM organization_scenarios WHERE available_gms IS NOT NULL AND available_gms != '{}' AND array_length(available_gms, 1) > 0;

SELECT 'organization_scenarios で experienced_staff あり: ' || COUNT(*) as org_exp
FROM organization_scenarios WHERE experienced_staff IS NOT NULL AND experienced_staff != '{}' AND array_length(experienced_staff, 1) > 0;

SELECT 'organization_scenarios で gm_assignments あり: ' || COUNT(*) as org_gma
FROM organization_scenarios WHERE gm_assignments IS NOT NULL AND gm_assignments != '[]'::jsonb;

-- ===========================================
-- STEP 1: 差分の確認（INSERT前にどれだけ漏れがあるか）
-- ===========================================
SELECT '=== 差分確認 ===' as step;

-- 1a. available_gms にいるが staff_scenario_assignments にいないGM
SELECT 'available_gms のみに存在するGM:' as label;
SELECT os.organization_id, os.scenario_master_id, g.gm_name, st.id as staff_id
FROM organization_scenarios os
CROSS JOIN LATERAL unnest(os.available_gms) AS g(gm_name)
JOIN staff st ON st.name = g.gm_name AND st.organization_id = os.organization_id
WHERE os.available_gms IS NOT NULL
  AND array_length(os.available_gms, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM staff_scenario_assignments ssa
    WHERE ssa.staff_id = st.id
      AND ssa.scenario_id = os.scenario_master_id
  );

-- 1b. gm_assignments (JSONB) にいるが staff_scenario_assignments にいないGM
SELECT 'gm_assignments のみに存在するGM:' as label;
SELECT os.organization_id, os.scenario_master_id,
       gma->>'staff_name' as staff_name,
       gma->>'staff_id' as staff_id
FROM organization_scenarios os
CROSS JOIN LATERAL jsonb_array_elements(os.gm_assignments) AS gma
WHERE os.gm_assignments IS NOT NULL
  AND os.gm_assignments != '[]'::jsonb
  AND (gma->>'staff_id') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM staff_scenario_assignments ssa
    WHERE ssa.staff_id = (gma->>'staff_id')::uuid
      AND ssa.scenario_id = os.scenario_master_id
  );

-- 1c. experienced_staff にいるが staff_scenario_assignments にいないスタッフ
SELECT 'experienced_staff のみに存在するスタッフ:' as label;
SELECT os.organization_id, os.scenario_master_id, e.exp_name, st.id as staff_id
FROM organization_scenarios os
CROSS JOIN LATERAL unnest(os.experienced_staff) AS e(exp_name)
JOIN staff st ON st.name = e.exp_name AND st.organization_id = os.organization_id
WHERE os.experienced_staff IS NOT NULL
  AND array_length(os.experienced_staff, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM staff_scenario_assignments ssa
    WHERE ssa.staff_id = st.id
      AND ssa.scenario_id = os.scenario_master_id
  );

-- ===========================================
-- STEP 2: available_gms から不足分を補完
-- ===========================================
SELECT '=== STEP 2: available_gms から補完 ===' as step;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, organization_id, can_main_gm, can_sub_gm, is_experienced, assigned_at)
SELECT DISTINCT
  st.id,
  os.scenario_master_id,
  os.organization_id,
  true,   -- available_gms に入っている = GM可能
  false,
  false,
  NOW()
FROM organization_scenarios os
CROSS JOIN LATERAL unnest(os.available_gms) AS g(gm_name)
JOIN staff st ON st.name = g.gm_name AND st.organization_id = os.organization_id
WHERE os.available_gms IS NOT NULL
  AND array_length(os.available_gms, 1) > 0
  AND os.scenario_master_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM staff_scenario_assignments ssa
    WHERE ssa.staff_id = st.id
      AND ssa.scenario_id = os.scenario_master_id
  )
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET
  can_main_gm = GREATEST(staff_scenario_assignments.can_main_gm, EXCLUDED.can_main_gm),
  organization_id = COALESCE(staff_scenario_assignments.organization_id, EXCLUDED.organization_id);

SELECT 'available_gms 補完完了' as result;

-- ===========================================
-- STEP 3: gm_assignments (JSONB) から不足分を補完
-- ===========================================
SELECT '=== STEP 3: gm_assignments から補完 ===' as step;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, organization_id, can_main_gm, can_sub_gm, is_experienced, assigned_at)
SELECT DISTINCT
  (gma->>'staff_id')::uuid,
  os.scenario_master_id,
  os.organization_id,
  COALESCE((gma->>'can_main_gm')::boolean, true),
  COALESCE((gma->>'can_sub_gm')::boolean, false),
  COALESCE((gma->>'is_experienced')::boolean, false),
  NOW()
FROM organization_scenarios os
CROSS JOIN LATERAL jsonb_array_elements(os.gm_assignments) AS gma
WHERE os.gm_assignments IS NOT NULL
  AND os.gm_assignments != '[]'::jsonb
  AND (gma->>'staff_id') IS NOT NULL
  AND os.scenario_master_id IS NOT NULL
  -- staff_id が実在するか確認
  AND EXISTS (SELECT 1 FROM staff WHERE id = (gma->>'staff_id')::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM staff_scenario_assignments ssa
    WHERE ssa.staff_id = (gma->>'staff_id')::uuid
      AND ssa.scenario_id = os.scenario_master_id
  )
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET
  can_main_gm = GREATEST(staff_scenario_assignments.can_main_gm, EXCLUDED.can_main_gm),
  can_sub_gm = GREATEST(staff_scenario_assignments.can_sub_gm, EXCLUDED.can_sub_gm),
  is_experienced = GREATEST(staff_scenario_assignments.is_experienced, EXCLUDED.is_experienced),
  organization_id = COALESCE(staff_scenario_assignments.organization_id, EXCLUDED.organization_id);

SELECT 'gm_assignments 補完完了' as result;

-- ===========================================
-- STEP 4: experienced_staff から不足分を補完
-- ===========================================
SELECT '=== STEP 4: experienced_staff から補完 ===' as step;

INSERT INTO staff_scenario_assignments (staff_id, scenario_id, organization_id, can_main_gm, can_sub_gm, is_experienced, assigned_at)
SELECT DISTINCT
  st.id,
  os.scenario_master_id,
  os.organization_id,
  false,
  false,
  true,   -- experienced_staff に入っている = 体験済み
  NOW()
FROM organization_scenarios os
CROSS JOIN LATERAL unnest(os.experienced_staff) AS e(exp_name)
JOIN staff st ON st.name = e.exp_name AND st.organization_id = os.organization_id
WHERE os.experienced_staff IS NOT NULL
  AND array_length(os.experienced_staff, 1) > 0
  AND os.scenario_master_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM staff_scenario_assignments ssa
    WHERE ssa.staff_id = st.id
      AND ssa.scenario_id = os.scenario_master_id
  )
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET
  is_experienced = GREATEST(staff_scenario_assignments.is_experienced, EXCLUDED.is_experienced),
  organization_id = COALESCE(staff_scenario_assignments.organization_id, EXCLUDED.organization_id);

SELECT 'experienced_staff 補完完了' as result;

-- ===========================================
-- STEP 5: organization_id が NULL のレコードをクインズワルツに修正
-- ===========================================
SELECT '=== STEP 5: NULL organization_id 修正 ===' as step;

UPDATE staff_scenario_assignments
SET organization_id = 'a0000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

SELECT 'NULL → クインズワルツ: ' || COUNT(*) || ' 件修正' as result
FROM staff_scenario_assignments
WHERE organization_id = 'a0000000-0000-0000-0000-000000000001';

-- ===========================================
-- STEP 6: NOT NULL 制約を追加
-- ===========================================
SELECT '=== STEP 6: NOT NULL 制約追加 ===' as step;

ALTER TABLE staff_scenario_assignments
  ALTER COLUMN organization_id SET NOT NULL;

-- ===========================================
-- STEP 7: 統合後の状態確認
-- ===========================================
SELECT '=== 統合後の状態 ===' as step;

SELECT 'staff_scenario_assignments: ' || COUNT(*) as total FROM staff_scenario_assignments;
SELECT '  うち GM可能: ' || COUNT(*) as gm FROM staff_scenario_assignments WHERE can_main_gm = true OR can_sub_gm = true;
SELECT '  うち 体験済みのみ: ' || COUNT(*) as exp FROM staff_scenario_assignments WHERE is_experienced = true AND can_main_gm = false AND can_sub_gm = false;
SELECT '  うち org_id NULL: ' || COUNT(*) as null_org FROM staff_scenario_assignments WHERE organization_id IS NULL;

-- マッチしなかった名前があれば表示（手動確認用）
SELECT '=== スタッフ名マッチしなかった available_gms ===' as step;
SELECT DISTINCT g.gm_name, os.organization_id
FROM organization_scenarios os
CROSS JOIN LATERAL unnest(os.available_gms) AS g(gm_name)
WHERE os.available_gms IS NOT NULL
  AND array_length(os.available_gms, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM staff st
    WHERE st.name = g.gm_name AND st.organization_id = os.organization_id
  );

SELECT '=== スタッフ名マッチしなかった experienced_staff ===' as step;
SELECT DISTINCT e.exp_name, os.organization_id
FROM organization_scenarios os
CROSS JOIN LATERAL unnest(os.experienced_staff) AS e(exp_name)
WHERE os.experienced_staff IS NOT NULL
  AND array_length(os.experienced_staff, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM staff st
    WHERE st.name = e.exp_name AND st.organization_id = os.organization_id
  );

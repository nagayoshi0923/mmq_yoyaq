-- organization_scenarios_with_master ビューを修正
-- 作成日: 2026-03-12
-- 概要: 
--   1. organization_scenarios.available_gms / experienced_staff のデータを 
--      staff_scenario_assignments に統合（不足分のみ追加、重複はスキップ）
--   2. ビューを staff_scenario_assignments から動的に取得するように修正
--      これにより、シナリオ編集ダイアログでの担当GM変更がリスト表示に即時反映される

-- =============================================================================
-- STEP 1: organization_scenarios.available_gms から staff_scenario_assignments に統合
-- =============================================================================

-- 1a. available_gms から不足分を補完（名前ベースでスタッフを検索）
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, organization_id, can_main_gm, can_sub_gm, is_experienced, assigned_at)
SELECT DISTINCT
  st.id,
  os.scenario_master_id,
  os.organization_id,
  true,   -- available_gms に入っている = GM可能
  true,   -- サブGMも可能とする
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
  can_sub_gm = GREATEST(staff_scenario_assignments.can_sub_gm, EXCLUDED.can_sub_gm),
  organization_id = COALESCE(staff_scenario_assignments.organization_id, EXCLUDED.organization_id);

-- 1b. gm_assignments (JSONB) から不足分を補完
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, organization_id, can_main_gm, can_sub_gm, is_experienced, assigned_at)
SELECT DISTINCT
  (gma->>'staff_id')::uuid,
  os.scenario_master_id,
  os.organization_id,
  COALESCE((gma->>'can_main_gm')::boolean, true),
  COALESCE((gma->>'can_sub_gm')::boolean, true),
  COALESCE((gma->>'is_experienced')::boolean, false),
  NOW()
FROM organization_scenarios os
CROSS JOIN LATERAL jsonb_array_elements(os.gm_assignments) AS gma
WHERE os.gm_assignments IS NOT NULL
  AND os.gm_assignments != '[]'::jsonb
  AND (gma->>'staff_id') IS NOT NULL
  AND os.scenario_master_id IS NOT NULL
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

-- =============================================================================
-- STEP 2: organization_scenarios.experienced_staff から staff_scenario_assignments に統合
-- =============================================================================

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

-- =============================================================================
-- STEP 2b: staff.special_scenarios から staff_scenario_assignments に統合
-- =============================================================================

-- staff テーブルの special_scenarios にあるシナリオIDを統合
-- special_scenarios は TEXT[] 型なので、UUID にキャストが必要
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, organization_id, can_main_gm, can_sub_gm, is_experienced, assigned_at)
SELECT DISTINCT
  st.id,
  scenario_id::uuid,
  st.organization_id,
  true,   -- special_scenarios に入っている = GM可能
  true,   -- サブGMも可能とする
  false,
  NOW()
FROM staff st
CROSS JOIN LATERAL unnest(st.special_scenarios) AS scenario_id
WHERE st.special_scenarios IS NOT NULL
  AND array_length(st.special_scenarios, 1) > 0
  AND st.organization_id IS NOT NULL
  -- scenario_id が有効なUUID形式かつ scenario_masters に存在するか確認
  AND scenario_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM scenario_masters sm WHERE sm.id = scenario_id::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM staff_scenario_assignments ssa
    WHERE ssa.staff_id = st.id
      AND ssa.scenario_id = scenario_id::uuid
  )
ON CONFLICT (staff_id, scenario_id) DO UPDATE SET
  can_main_gm = GREATEST(staff_scenario_assignments.can_main_gm, EXCLUDED.can_main_gm),
  can_sub_gm = GREATEST(staff_scenario_assignments.can_sub_gm, EXCLUDED.can_sub_gm),
  organization_id = COALESCE(staff_scenario_assignments.organization_id, EXCLUDED.organization_id);

-- =============================================================================
-- STEP 2c: staff.experienced_scenarios から staff_scenario_assignments に統合
-- =============================================================================
-- NOTE: staff.experienced_scenarios カラムが存在する場合のみ実行
-- 本番環境にはこのカラムがないためスキップ
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'staff' AND column_name = 'experienced_scenarios'
  ) THEN
    INSERT INTO staff_scenario_assignments (staff_id, scenario_id, organization_id, can_main_gm, can_sub_gm, is_experienced, assigned_at)
    SELECT DISTINCT
      st.id,
      scenario_id::uuid,
      st.organization_id,
      false,
      false,
      true,
      NOW()
    FROM staff st
    CROSS JOIN LATERAL unnest(st.experienced_scenarios) AS scenario_id
    WHERE st.experienced_scenarios IS NOT NULL
      AND array_length(st.experienced_scenarios, 1) > 0
      AND st.organization_id IS NOT NULL
      AND scenario_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND EXISTS (SELECT 1 FROM scenario_masters sm WHERE sm.id = scenario_id::uuid)
      AND NOT EXISTS (
        SELECT 1 FROM staff_scenario_assignments ssa
        WHERE ssa.staff_id = st.id
          AND ssa.scenario_id = scenario_id::uuid
      )
    ON CONFLICT (staff_id, scenario_id) DO UPDATE SET
      is_experienced = GREATEST(staff_scenario_assignments.is_experienced, EXCLUDED.is_experienced),
      organization_id = COALESCE(staff_scenario_assignments.organization_id, EXCLUDED.organization_id);
    RAISE NOTICE 'staff.experienced_scenarios からデータを統合しました';
  ELSE
    RAISE NOTICE 'staff.experienced_scenarios カラムが存在しないためスキップ';
  END IF;
END $$;

-- =============================================================================
-- STEP 3: ビューを再作成（staff_scenario_assignments から動的に取得）
-- =============================================================================

-- 既存のビューを削除
DROP VIEW IF EXISTS public.organization_scenarios_with_master;

-- 修正されたビューを作成
CREATE VIEW public.organization_scenarios_with_master AS
SELECT
  os.scenario_master_id AS id,
  os.id AS org_scenario_id,
  os.organization_id,
  os.scenario_master_id,
  os.slug,
  os.org_status AS status,
  os.org_status,
  COALESCE(os.override_title, sm.title) AS title,
  COALESCE(os.override_author, sm.author) AS author,
  sm.author_email,
  sm.author_id,
  COALESCE(os.custom_key_visual_url, sm.key_visual_url) AS key_visual_url,
  COALESCE(os.custom_description, sm.description) AS description,
  COALESCE(os.custom_synopsis, sm.synopsis) AS synopsis,
  COALESCE(os.custom_caution, sm.caution) AS caution,
  COALESCE(os.override_player_count_min, sm.player_count_min) AS player_count_min,
  COALESCE(os.override_player_count_max, sm.player_count_max) AS player_count_max,
  COALESCE(os.duration, sm.official_duration) AS duration,
  os.weekend_duration,
  COALESCE(os.override_genre, sm.genre) AS genre,
  COALESCE(os.override_difficulty, sm.difficulty) AS difficulty,
  COALESCE(os.override_has_pre_reading, sm.has_pre_reading) AS has_pre_reading,
  sm.release_date,
  sm.official_site_url,
  sm.required_items AS required_props,
  os.participation_fee,
  os.gm_test_participation_fee,
  os.participation_costs,
  os.flexible_pricing,
  os.use_flexible_pricing,
  os.license_amount,
  os.gm_test_license_amount,
  os.franchise_license_amount,
  os.franchise_gm_test_license_amount,
  os.gm_costs,
  os.gm_count,
  os.gm_assignments,
  
  -- 担当GM: staff_scenario_assignments から動的に取得（can_main_gm または can_sub_gm が true のスタッフ）
  COALESCE(
    (SELECT ARRAY_AGG(st.name ORDER BY st.name)
     FROM public.staff_scenario_assignments ssa
     JOIN public.staff st ON st.id = ssa.staff_id
     WHERE ssa.scenario_id = os.scenario_master_id
       AND ssa.organization_id = os.organization_id
       AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
    ), ARRAY[]::TEXT[]
  ) AS available_gms,
  
  -- 体験済みスタッフ: staff_scenario_assignments から動的に取得
  -- （is_experienced = true かつ 担当GMではないスタッフ）
  COALESCE(
    (SELECT ARRAY_AGG(st.name ORDER BY st.name)
     FROM public.staff_scenario_assignments ssa
     JOIN public.staff st ON st.id = ssa.staff_id
     WHERE ssa.scenario_id = os.scenario_master_id
       AND ssa.organization_id = os.organization_id
       AND ssa.is_experienced = true
       AND COALESCE(ssa.can_main_gm, false) = false
       AND COALESCE(ssa.can_sub_gm, false) = false
    ), ARRAY[]::TEXT[]
  ) AS experienced_staff,
  
  os.available_stores,
  os.production_cost,
  os.production_costs,
  os.depreciation_per_performance,
  os.extra_preparation_time,
  (
    SELECT COUNT(*)::INTEGER
    FROM public.schedule_events se
    WHERE se.scenario_master_id = os.scenario_master_id
      AND se.organization_id = os.organization_id
      AND se.date <= CURRENT_DATE
      AND se.is_cancelled IS NOT TRUE
      AND se.category != 'offsite'
  ) AS play_count,
  os.notes,
  os.created_at,
  os.updated_at,
  sm.master_status,
  os.pricing_patterns,
  TRUE AS is_shared,
  'normal'::TEXT AS scenario_type,
  0::DECIMAL AS rating,
  COALESCE(os.kit_count, 1) AS kit_count,
  '[]'::JSONB AS license_rewards,
  COALESCE(os.is_recommended, FALSE) AS is_recommended,
  os.survey_url,
  COALESCE(os.survey_enabled, FALSE) AS survey_enabled,
  COALESCE(os.characters, '[]'::JSONB) AS characters
FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id;

COMMENT ON VIEW public.organization_scenarios_with_master IS 
  '組織シナリオとマスタを結合したビュー。担当GM・体験済みスタッフはstaff_scenario_assignmentsから動的に取得';

-- =============================================================================
-- 完了通知
-- =============================================================================
DO $$
DECLARE
  gm_count INTEGER;
  exp_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO gm_count FROM staff_scenario_assignments WHERE can_main_gm = true OR can_sub_gm = true;
  SELECT COUNT(*) INTO exp_count FROM staff_scenario_assignments WHERE is_experienced = true;
  
  RAISE NOTICE '✅ マイグレーション完了:';
  RAISE NOTICE '   - organization_scenarios のデータを staff_scenario_assignments に統合';
  RAISE NOTICE '   - GM可能レコード数: %', gm_count;
  RAISE NOTICE '   - 体験済みレコード数: %', exp_count;
  RAISE NOTICE '   - ビューを staff_scenario_assignments から動的取得に変更';
END $$;

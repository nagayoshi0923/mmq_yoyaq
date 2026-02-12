-- ============================================================
-- 旧テーブル → 新テーブル データ同期マイグレーション
-- 実行日: 2026-02-12
-- 概要: scenarios / staff_scenario_assignments のデータを
--        scenario_masters / organization_scenarios に移行
-- ============================================================

-- ============================================================
-- 1. scenario_masters へ scenarios のマスタフィールドを同期
--    （旧テーブルで更新されたデータを新テーブルに反映）
-- ============================================================
UPDATE scenario_masters sm
SET 
  title = COALESCE(s.title, sm.title),
  author = COALESCE(s.author, sm.author),
  key_visual_url = COALESCE(s.key_visual_url, sm.key_visual_url),
  description = COALESCE(s.description, sm.description),
  player_count_min = COALESCE(s.player_count_min, sm.player_count_min),
  player_count_max = COALESCE(s.player_count_max, sm.player_count_max),
  official_duration = COALESCE(s.duration, sm.official_duration),
  genre = COALESCE(s.genre, sm.genre),
  difficulty = COALESCE(s.difficulty::TEXT, sm.difficulty),
  updated_at = NOW()
FROM scenarios s
WHERE s.scenario_master_id = sm.id;

-- 確認
SELECT 'scenario_masters同期完了: ' || COUNT(*) || '件' as result
FROM scenario_masters sm
JOIN scenarios s ON s.scenario_master_id = sm.id;

-- ============================================================
-- 2. organization_scenarios へ画像・説明を同期
--    （scenarios の key_visual_url → custom_key_visual_url）
-- ============================================================
UPDATE organization_scenarios os
SET 
  custom_key_visual_url = COALESCE(os.custom_key_visual_url, s.key_visual_url),
  updated_at = NOW()
FROM scenarios s
WHERE s.scenario_master_id = os.scenario_master_id
  AND s.organization_id = os.organization_id
  AND os.custom_key_visual_url IS NULL
  AND s.key_visual_url IS NOT NULL;

SELECT 'organization_scenarios画像同期完了' as result;

-- ============================================================
-- 3. available_gms (担当GM名) を同期
--    staff_scenario_assignments → organization_scenarios.available_gms
-- ============================================================

-- 3a. scenarios.id 経由のマッピング
WITH gm_names AS (
  SELECT 
    s.scenario_master_id,
    ssa.organization_id,
    ARRAY_AGG(DISTINCT st.name ORDER BY st.name) as gm_list
  FROM staff_scenario_assignments ssa
  JOIN scenarios s ON s.id = ssa.scenario_id
  JOIN staff st ON st.id = ssa.staff_id
  WHERE (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
    AND s.scenario_master_id IS NOT NULL
    AND st.name IS NOT NULL
  GROUP BY s.scenario_master_id, ssa.organization_id
),
-- 3b. scenario_master_id 直接参照のマッピング
gm_names_direct AS (
  SELECT 
    ssa.scenario_id as scenario_master_id,
    ssa.organization_id,
    ARRAY_AGG(DISTINCT st.name ORDER BY st.name) as gm_list
  FROM staff_scenario_assignments ssa
  JOIN staff st ON st.id = ssa.staff_id
  WHERE (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
    AND st.name IS NOT NULL
    AND ssa.scenario_id IN (SELECT id FROM scenario_masters)
  GROUP BY ssa.scenario_id, ssa.organization_id
),
-- 統合（全レコードを1行ずつに展開してから再集約）
all_gm_rows AS (
  SELECT scenario_master_id, organization_id, unnest(gm_list) as name FROM gm_names
  UNION
  SELECT scenario_master_id, organization_id, unnest(gm_list) as name FROM gm_names_direct
),
merged_gms AS (
  SELECT 
    scenario_master_id,
    organization_id,
    ARRAY_AGG(DISTINCT name ORDER BY name) as merged_gm_list
  FROM all_gm_rows
  GROUP BY scenario_master_id, organization_id
)
UPDATE organization_scenarios os
SET 
  available_gms = mg.merged_gm_list,
  updated_at = NOW()
FROM merged_gms mg
WHERE os.scenario_master_id = mg.scenario_master_id
  AND os.organization_id = mg.organization_id;

SELECT 'available_gms同期完了: ' || COUNT(*) || '件' as result
FROM organization_scenarios WHERE available_gms IS NOT NULL AND available_gms != '{}';

-- ============================================================
-- 4. experienced_staff (体験済み) を同期
--    staff_scenario_assignments → organization_scenarios.experienced_staff
-- ============================================================

WITH exp_names AS (
  SELECT 
    s.scenario_master_id,
    ssa.organization_id,
    ARRAY_AGG(DISTINCT st.name ORDER BY st.name) as exp_list
  FROM staff_scenario_assignments ssa
  JOIN scenarios s ON s.id = ssa.scenario_id
  JOIN staff st ON st.id = ssa.staff_id
  WHERE ssa.is_experienced = true
    AND s.scenario_master_id IS NOT NULL
    AND st.name IS NOT NULL
  GROUP BY s.scenario_master_id, ssa.organization_id
),
exp_names_direct AS (
  SELECT 
    ssa.scenario_id as scenario_master_id,
    ssa.organization_id,
    ARRAY_AGG(DISTINCT st.name ORDER BY st.name) as exp_list
  FROM staff_scenario_assignments ssa
  JOIN staff st ON st.id = ssa.staff_id
  WHERE ssa.is_experienced = true
    AND st.name IS NOT NULL
    AND ssa.scenario_id IN (SELECT id FROM scenario_masters)
  GROUP BY ssa.scenario_id, ssa.organization_id
),
all_exp_rows AS (
  SELECT scenario_master_id, organization_id, unnest(exp_list) as name FROM exp_names
  UNION
  SELECT scenario_master_id, organization_id, unnest(exp_list) as name FROM exp_names_direct
),
merged_exp AS (
  SELECT 
    scenario_master_id,
    organization_id,
    ARRAY_AGG(DISTINCT name ORDER BY name) as merged_exp_list
  FROM all_exp_rows
  GROUP BY scenario_master_id, organization_id
)
UPDATE organization_scenarios os
SET 
  experienced_staff = me.merged_exp_list,
  updated_at = NOW()
FROM merged_exp me
WHERE os.scenario_master_id = me.scenario_master_id
  AND os.organization_id = me.organization_id;

SELECT 'experienced_staff同期完了: ' || COUNT(*) || '件' as result
FROM organization_scenarios WHERE experienced_staff IS NOT NULL AND experienced_staff != '{}';

-- ============================================================
-- 5. gm_assignments (JSONB) を同期
--    staff_scenario_assignments → organization_scenarios.gm_assignments
-- ============================================================

WITH gm_json AS (
  SELECT 
    s.scenario_master_id,
    ssa.organization_id,
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'staff_name', st.name,
        'staff_id', st.id::text,
        'can_main_gm', ssa.can_main_gm,
        'can_sub_gm', ssa.can_sub_gm,
        'is_experienced', ssa.is_experienced
      )
    ) as assignments
  FROM staff_scenario_assignments ssa
  JOIN scenarios s ON s.id = ssa.scenario_id
  JOIN staff st ON st.id = ssa.staff_id
  WHERE (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
    AND s.scenario_master_id IS NOT NULL
    AND st.name IS NOT NULL
  GROUP BY s.scenario_master_id, ssa.organization_id
),
gm_json_direct AS (
  SELECT 
    ssa.scenario_id as scenario_master_id,
    ssa.organization_id,
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'staff_name', st.name,
        'staff_id', st.id::text,
        'can_main_gm', ssa.can_main_gm,
        'can_sub_gm', ssa.can_sub_gm,
        'is_experienced', ssa.is_experienced
      )
    ) as assignments
  FROM staff_scenario_assignments ssa
  JOIN staff st ON st.id = ssa.staff_id
  WHERE (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
    AND st.name IS NOT NULL
    AND ssa.scenario_id IN (SELECT id FROM scenario_masters)
  GROUP BY ssa.scenario_id, ssa.organization_id
)
UPDATE organization_scenarios os
SET 
  gm_assignments = COALESCE(gj.assignments, gjd.assignments)::jsonb,
  updated_at = NOW()
FROM 
  (SELECT scenario_master_id, organization_id, assignments FROM gm_json) gj
FULL OUTER JOIN 
  (SELECT scenario_master_id, organization_id, assignments FROM gm_json_direct) gjd
  ON gj.scenario_master_id = gjd.scenario_master_id 
  AND gj.organization_id = gjd.organization_id
WHERE os.scenario_master_id = COALESCE(gj.scenario_master_id, gjd.scenario_master_id)
  AND os.organization_id = COALESCE(gj.organization_id, gjd.organization_id);

SELECT 'gm_assignments同期完了: ' || COUNT(*) || '件' as result
FROM organization_scenarios WHERE gm_assignments IS NOT NULL AND gm_assignments != '[]'::jsonb;

-- ============================================================
-- 6. extra_preparation_time の旧デフォルト(30)をクリア
-- ============================================================
UPDATE organization_scenarios
SET extra_preparation_time = NULL
WHERE extra_preparation_time = 30;

UPDATE scenarios
SET extra_preparation_time = NULL
WHERE extra_preparation_time = 30;

SELECT 'extra_preparation_time(30)クリア完了' as result;

-- ============================================================
-- 最終確認
-- ============================================================
SELECT 
  'シナリオ総数: ' || (SELECT COUNT(*) FROM organization_scenarios) as total,
  'GM設定済み: ' || (SELECT COUNT(*) FROM organization_scenarios WHERE available_gms IS NOT NULL AND available_gms != '{}') as with_gms,
  '体験済み設定済み: ' || (SELECT COUNT(*) FROM organization_scenarios WHERE experienced_staff IS NOT NULL AND experienced_staff != '{}') as with_exp,
  '画像設定済み: ' || (SELECT COUNT(*) FROM organization_scenarios WHERE custom_key_visual_url IS NOT NULL) as with_image;

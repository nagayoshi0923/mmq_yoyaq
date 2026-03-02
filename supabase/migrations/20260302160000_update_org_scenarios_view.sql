-- organization_scenarios_with_master ビューを更新
-- 作成日: 2026-03-02
-- 概要: Scenario型と互換性のある全カラムを含むビューに更新

DROP VIEW IF EXISTS public.organization_scenarios_with_master;

CREATE OR REPLACE VIEW public.organization_scenarios_with_master AS
SELECT
  -- IDはscenario_master_idを使用（scenarios.idの代わり）
  os.scenario_master_id AS id,
  os.id AS org_scenario_id,
  os.organization_id,
  os.scenario_master_id,
  os.slug,
  
  -- ステータス
  os.org_status AS status,
  
  -- マスタ情報（組織設定があればそちらを優先）
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
  sm.weekend_duration,
  COALESCE(os.override_genre, sm.genre) AS genre,
  COALESCE(os.override_difficulty, sm.difficulty)::INTEGER AS difficulty,
  COALESCE(os.override_has_pre_reading, sm.has_pre_reading) AS has_pre_reading,
  sm.release_date,
  sm.official_site_url,
  sm.required_items AS required_props,
  
  -- 組織固有設定
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
  os.available_gms,
  os.experienced_staff,
  os.available_stores,
  os.production_cost,
  os.production_costs,
  os.depreciation_per_performance,
  os.extra_preparation_time,
  os.play_count,
  os.notes,
  
  -- メタ情報
  os.created_at,
  os.updated_at,
  
  -- マスタステータス
  sm.master_status,
  
  -- 互換性フィールド
  TRUE AS is_shared,
  'normal'::TEXT AS scenario_type,
  0::DECIMAL AS rating,
  1 AS kit_count,
  '[]'::JSONB AS license_rewards

FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id;

COMMENT ON VIEW public.organization_scenarios_with_master IS 
  '組織シナリオとマスタを結合したビュー。Scenario型と互換性あり';

-- 確認
DO $$
DECLARE
  view_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO view_count FROM organization_scenarios_with_master;
  RAISE NOTICE 'organization_scenarios_with_master ビュー更新完了: %件', view_count;
END $$;

-- organization_scenarios_with_master ビューを更新
-- 追加カラム: license_amount, available_gms, experienced_staff, available_stores, gm_costs など
-- 作成日: 2026-01-09

-- 既存のビューを更新
CREATE OR REPLACE VIEW public.organization_scenarios_with_master AS
SELECT
  os.id,
  os.organization_id,
  os.scenario_master_id,
  os.slug,
  os.org_status,
  os.pricing_patterns,
  os.gm_assignments,
  os.created_at,
  os.updated_at,
  
  -- マスタ情報（組織設定があればそちらを優先）
  sm.title,
  sm.author,
  sm.author_id,
  COALESCE(os.custom_key_visual_url, sm.key_visual_url) AS key_visual_url,
  COALESCE(os.custom_description, sm.description) AS description,
  COALESCE(os.custom_synopsis, sm.synopsis) AS synopsis,
  COALESCE(os.custom_caution, sm.caution) AS caution,
  sm.player_count_min,
  sm.player_count_max,
  COALESCE(os.duration, sm.official_duration) AS duration,
  sm.genre,
  sm.difficulty,
  os.participation_fee,
  os.extra_preparation_time,
  
  -- マスタのステータス
  sm.master_status,

  -- ========== 追加: 組織設定項目 ==========
  -- ライセンス料
  os.license_amount,
  os.gm_test_license_amount,
  os.franchise_license_amount,
  os.franchise_gm_test_license_amount,
  
  -- GM関連
  os.available_gms,
  os.experienced_staff,
  os.gm_costs,
  os.gm_count,
  
  -- 店舗・制作関連
  os.available_stores,
  os.production_costs,
  os.depreciation_per_performance,
  
  -- その他
  os.gm_test_participation_fee,
  os.play_count,
  os.notes

FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id;

COMMENT ON VIEW public.organization_scenarios_with_master IS '組織シナリオとマスタを結合したビュー。組織固有設定があればそちらを優先。GM・ライセンス情報も含む';

-- 確認
SELECT 'View updated successfully' as result;


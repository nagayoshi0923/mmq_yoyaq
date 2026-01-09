-- ============================================================
-- 旧scenariosテーブルからorganization_scenariosへのデータ同期
-- 作成日: 2026-01-09
-- 概要: scenariosテーブルにある組織固有データをorganization_scenariosに移行
-- ============================================================

-- ============================================================
-- 1. 既存のorganization_scenariosレコードを更新
--    (scenariosテーブルからの追加カラムを同期)
-- ============================================================

UPDATE organization_scenarios os
SET
  -- ライセンス関連
  license_amount = s.license_amount,
  gm_test_license_amount = s.gm_test_license_amount,
  franchise_license_amount = s.franchise_license_amount,
  franchise_gm_test_license_amount = s.franchise_gm_test_license_amount,
  
  -- GM関連
  available_gms = s.available_gms,
  -- experienced_staff はscenariosテーブルにないのでスキップ
  gm_count = s.gm_count,
  gm_costs = s.gm_costs,
  
  -- 店舗・制作関連
  available_stores = s.available_stores,
  production_costs = s.production_costs,
  depreciation_per_performance = s.depreciation_per_performance,
  
  -- 料金関連
  gm_test_participation_fee = s.gm_test_participation_fee,
  participation_costs = s.participation_costs,
  
  -- その他
  play_count = s.play_count,
  
  -- 更新日時
  updated_at = NOW()
FROM scenarios s
WHERE (os.scenario_master_id = s.scenario_master_id OR os.scenario_master_id = s.id)
  AND os.organization_id = s.organization_id;

-- 更新件数を確認
SELECT 'Updated organization_scenarios: ' || COUNT(*) as result 
FROM organization_scenarios;

-- ============================================================
-- 2. organization_scenariosに存在しないレコードを新規挿入
--    ※ scenario_master_id が設定されていて、scenario_masters に存在するもののみ
-- ============================================================

INSERT INTO organization_scenarios (
  organization_id,
  scenario_master_id,
  slug,
  duration,
  participation_fee,
  extra_preparation_time,
  org_status,
  -- pricing_patterns はscenariosテーブルにないのでデフォルト値
  gm_assignments,
  -- 追加カラム
  license_amount,
  gm_test_license_amount,
  franchise_license_amount,
  franchise_gm_test_license_amount,
  available_gms,
  -- experienced_staff はscenariosテーブルにないのでスキップ
  gm_count,
  gm_costs,
  available_stores,
  production_costs,
  depreciation_per_performance,
  gm_test_participation_fee,
  participation_costs,
  play_count,
  created_at,
  updated_at
)
SELECT
  s.organization_id,
  COALESCE(s.scenario_master_id, s.id),  -- scenario_master_id があればそれを使用、なければ scenarios.id
  s.slug,
  s.duration,
  s.participation_fee,
  COALESCE(s.extra_preparation_time, 0),
  CASE 
    WHEN s.status = 'available' THEN 'available'
    WHEN s.status = 'maintenance' THEN 'unavailable'
    ELSE 'unavailable'
  END,
  -- pricing_patterns はscenariosテーブルにないのでデフォルト値
  COALESCE(s.gm_assignments, '[]'::jsonb),
  -- 追加カラム
  s.license_amount,
  s.gm_test_license_amount,
  s.franchise_license_amount,
  s.franchise_gm_test_license_amount,
  s.available_gms,
  -- experienced_staff はscenariosテーブルにないのでスキップ
  s.gm_count,
  COALESCE(s.gm_costs, '[]'::jsonb),
  s.available_stores,
  COALESCE(s.production_costs, '[]'::jsonb),
  s.depreciation_per_performance,
  s.gm_test_participation_fee,
  COALESCE(s.participation_costs, '[]'::jsonb),
  s.play_count,
  s.created_at,
  s.updated_at
FROM scenarios s
WHERE s.organization_id IS NOT NULL
  -- scenario_master_id または s.id が scenario_masters に存在するもののみ
  AND EXISTS (
    SELECT 1 FROM scenario_masters sm 
    WHERE sm.id = COALESCE(s.scenario_master_id, s.id)
  )
  AND NOT EXISTS (
    SELECT 1 FROM organization_scenarios os 
    WHERE os.scenario_master_id = COALESCE(s.scenario_master_id, s.id)
      AND os.organization_id = s.organization_id
  )
ON CONFLICT (organization_id, scenario_master_id) DO NOTHING;

-- 新規挿入件数を確認
SELECT 'Total organization_scenarios after insert: ' || COUNT(*) as result 
FROM organization_scenarios;

-- ============================================================
-- 3. 同期結果の確認
-- ============================================================

-- データが入っているカラムの確認
SELECT 
  'organization_scenarios data check' as info,
  COUNT(*) as total,
  COUNT(license_amount) as with_license,
  COUNT(CASE WHEN array_length(available_gms, 1) > 0 THEN 1 END) as with_gms,
  COUNT(CASE WHEN array_length(available_stores, 1) > 0 THEN 1 END) as with_stores,
  COUNT(play_count) as with_play_count
FROM organization_scenarios;

-- サンプルデータ確認（最初の5件）
SELECT 
  osm.title,
  os.org_status,
  os.participation_fee,
  os.license_amount,
  array_length(os.available_gms, 1) as gm_count,
  array_length(os.experienced_staff, 1) as experienced_count,
  array_length(os.available_stores, 1) as store_count
FROM organization_scenarios os
JOIN organization_scenarios_with_master osm ON osm.id = os.id
ORDER BY osm.title
LIMIT 10;

-- ============================================================
-- 4. ビューを更新（追加カラムを含める）
-- ============================================================

-- 既存のビューを削除してから再作成
DROP VIEW IF EXISTS public.organization_scenarios_with_master;

CREATE VIEW public.organization_scenarios_with_master AS
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

  -- ========== 組織設定項目 ==========
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

-- 完了メッセージ
SELECT 'Sync completed successfully!' as result;


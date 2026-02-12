-- organization_scenarios_with_master ビューの play_count 計算を修正
-- 作成日: 2026-02-12
-- 概要: play_count が未来の公演もカウントしていた問題を修正
--       「累計公演回数（実績）」なので、過去の公演（date <= CURRENT_DATE）のみをカウントするように変更

-- 既存のビューを削除
DROP VIEW IF EXISTS public.organization_scenarios_with_master;

-- 修正されたビューを作成
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
  os.notes,
  
  -- 公演回数（その組織での実績公演回数、schedule_events からカウント）
  -- 条件: キャンセルを除く、過去の公演のみ（未来の予定は含まない）
  COALESCE(
    (SELECT COUNT(*)
     FROM public.schedule_events se
     JOIN public.scenarios s ON s.id = se.scenario_id
     WHERE s.scenario_master_id = os.scenario_master_id
       AND se.organization_id = os.organization_id
       AND se.scenario_id IS NOT NULL
       AND COALESCE(se.is_cancelled, false) = false
       AND se.date <= CURRENT_DATE
    ), 0
  )::INTEGER AS play_count

FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id;

COMMENT ON VIEW public.organization_scenarios_with_master IS '組織シナリオとマスタを結合したビュー。組織固有設定があればそちらを優先。GM/店舗/ライセンス情報を含む';

-- 確認用クエリ
-- SELECT id, title, play_count 
-- FROM organization_scenarios_with_master 
-- WHERE play_count > 0
-- ORDER BY play_count DESC
-- LIMIT 10;

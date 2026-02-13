-- organization_scenarios_with_master ビューを更新
-- 作成日: 2026-02-09
-- 概要: title, author, genre, difficulty, player_count_min, player_count_max に
--       organization_scenarios の override_* カラムを COALESCE で適用。
--       組織がマスター情報を上書きできるようにする（マスター自体は変更しない）。

-- 既存のビューを削除
DROP VIEW IF EXISTS public.organization_scenarios_with_master;

-- override カラムを活用したビューを作成
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
  
  -- マスタ情報（組織の override があればそちらを優先）
  COALESCE(os.override_title, sm.title) AS title,
  COALESCE(os.override_author, sm.author) AS author,
  sm.author_id,
  COALESCE(os.custom_key_visual_url, sm.key_visual_url) AS key_visual_url,
  COALESCE(os.custom_description, sm.description) AS description,
  COALESCE(os.custom_synopsis, sm.synopsis) AS synopsis,
  COALESCE(os.custom_caution, sm.caution) AS caution,
  COALESCE(os.override_player_count_min, sm.player_count_min) AS player_count_min,
  COALESCE(os.override_player_count_max, sm.player_count_max) AS player_count_max,
  COALESCE(os.duration, sm.official_duration) AS duration,
  COALESCE(os.override_genre, sm.genre) AS genre,
  COALESCE(os.override_difficulty, sm.difficulty) AS difficulty,
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

COMMENT ON VIEW public.organization_scenarios_with_master IS '組織シナリオとマスタを結合したビュー。組織固有設定（override_*）があればそちらを優先。GM/店舗/ライセンス情報を含む';

-- 確認用クエリ
-- SELECT id, title, author, genre, difficulty, player_count_min, player_count_max
-- FROM organization_scenarios_with_master
-- LIMIT 10;

-- scenarios テーブル廃止に向けた移行 Step 2
-- 作成日: 2026-03-02
-- 概要: scenarios テーブルの代わりに使える互換ビューを作成
--       既存のコードが scenarios を参照しても動作するようにする

-- ============================================================
-- 1. 互換ビュー scenarios_v2 を作成
--    organization_scenarios + scenario_masters を結合
--    scenarios テーブルと同じカラム構成を持つ
-- ============================================================

DROP VIEW IF EXISTS public.scenarios_v2;

CREATE OR REPLACE VIEW public.scenarios_v2 AS
SELECT
  -- ID: organization_scenarios.scenario_master_id を使用
  -- （scenario_master_id が scenarios.id の代わりになる）
  os.scenario_master_id AS id,
  
  -- organization_scenarios からのカラム
  os.id AS org_scenario_id,
  os.organization_id,
  os.scenario_master_id,
  os.slug,
  os.org_status AS status,  -- org_status を status にマッピング
  os.participation_fee,
  os.participation_costs,
  os.gm_costs,
  os.gm_count,
  os.gm_assignments,
  os.extra_preparation_time,
  os.available_stores,
  os.available_gms,
  os.experienced_staff,
  os.license_amount,
  os.gm_test_license_amount,
  os.franchise_license_amount,
  os.franchise_gm_test_license_amount,
  os.production_cost,
  os.production_costs,
  os.depreciation_per_performance,
  os.play_count,
  os.notes,
  os.created_at,
  os.updated_at,
  
  -- scenario_masters からのカラム（組織上書きがあればそちらを優先）
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
  COALESCE(os.override_genre, sm.genre) AS genre,
  COALESCE(os.override_difficulty, sm.difficulty) AS difficulty,
  COALESCE(os.override_has_pre_reading, sm.has_pre_reading) AS has_pre_reading,
  sm.release_date,
  sm.official_site_url,
  sm.required_items AS required_props,
  
  -- マスタステータス
  sm.master_status,
  
  -- 互換性のための追加フィールド
  TRUE AS is_shared,  -- マスタ連携シナリオは共有可能
  'normal'::TEXT AS scenario_type,  -- 通常タイプ
  0::DECIMAL AS rating,  -- 未使用
  1 AS kit_count  -- デフォルト値

FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id;

COMMENT ON VIEW public.scenarios_v2 IS 
  'scenarios テーブルの互換ビュー。organization_scenarios + scenario_masters を結合し、scenarios と同じカラム構成を提供';

-- ============================================================
-- 2. RLSポリシー用の関数（ビューは直接RLSを持てないため）
-- ============================================================

-- scenarios_v2 は organization_scenarios と scenario_masters の RLS に依存
-- 追加のRLS設定は不要（ベーステーブルのRLSが適用される）

-- ============================================================
-- 3. 確認用クエリ
-- ============================================================

DO $$
DECLARE
  view_count INTEGER;
  scenarios_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO view_count FROM scenarios_v2;
  SELECT COUNT(*) INTO scenarios_count FROM scenarios;
  
  RAISE NOTICE 'scenarios_v2 ビュー: %件', view_count;
  RAISE NOTICE 'scenarios テーブル: %件', scenarios_count;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Step 2 完了: scenarios_v2 互換ビューを作成しました';
  RAISE NOTICE '次のステップ: アプリコードを scenarios_v2 参照に変更してテスト';
  RAISE NOTICE '========================================';
END $$;
